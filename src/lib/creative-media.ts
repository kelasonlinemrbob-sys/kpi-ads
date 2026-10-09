import "server-only";
import { downloadImage, graphGet, GRAPH, isMetaMediaUrl, MetaRequestError, type ImageMediaType } from "./ai-analysis-meta";
import { getMetaToken } from "./meta-connection";

/**
 * The actual creative of an ad, for "Analisa creative": the video (as a Meta CDN URL the model can
 * watch), the image or carousel cards, and the ad copy. Pulled with the team's Meta connection. The sync only keeps a 64px thumbnail, too small to judge.
 */

const MAX_CAROUSEL_IMAGES = 5;

export type CreativeCopy = { primaryText: string | null; headline: string | null; description: string | null; cta: string | null };

export type CreativeMedia = {
  kind: "video" | "image" | "carousel" | "none";
  /** Meta CDN URL of the video file (signed, expires after some hours). */
  videoUrl: string | null;
  videoSeconds: number | null;
  images: { mediaType: ImageMediaType; data: string }[];
  /** Video cover, kept as a fallback when the model can't process the video file. */
  cover: { mediaType: ImageMediaType; data: string } | null;
  copy: CreativeCopy;
  /** What couldn't be pulled; shown with the result and told to the model. */
  gaps: string[];
};

type CallToAction = { type?: string };
type MetaCreative = {
  id?: string;
  effective_object_story_id?: string;
  video_id?: string;
  image_url?: string;
  body?: string;
  title?: string;
  call_to_action_type?: string;
  object_story_spec?: {
    page_id?: string;
    video_data?: { video_id?: string; message?: string; title?: string; link_description?: string; image_url?: string; call_to_action?: CallToAction };
    link_data?: { message?: string; name?: string; description?: string; picture?: string; call_to_action?: CallToAction; child_attachments?: { name?: string; picture?: string }[] };
    photo_data?: { caption?: string; url?: string };
  };
  asset_feed_spec?: { bodies?: { text?: string }[]; titles?: { text?: string }[]; descriptions?: { text?: string }[]; videos?: { video_id?: string }[]; call_to_action_types?: string[] };
};

const CREATIVE_FIELDS =
  "creative{id,effective_object_story_id,video_id,image_url,body,title,call_to_action_type," +
  "object_story_spec{page_id,video_data{video_id,message,title,link_description,image_url,call_to_action{type}},link_data{message,name,description,picture,call_to_action{type},child_attachments{name,picture}},photo_data{caption,url}}," +
  "asset_feed_spec{bodies{text},titles{text},descriptions{text},videos{video_id},call_to_action_types}}";

const first = (...values: (string | undefined | null)[]) => values.map((v) => v?.trim()).find((v) => v) ?? null;

/** Ad copy wherever Meta keeps it: plain creative fields, the post spec, or dynamic-creative assets. */
export function creativeCopy(c: MetaCreative | undefined): CreativeCopy {
  const video = c?.object_story_spec?.video_data;
  const link = c?.object_story_spec?.link_data;
  const feed = c?.asset_feed_spec;
  return {
    primaryText: first(c?.body, video?.message, link?.message, c?.object_story_spec?.photo_data?.caption, feed?.bodies?.[0]?.text),
    headline: first(c?.title, video?.title, link?.name, feed?.titles?.[0]?.text),
    description: first(video?.link_description, link?.description, feed?.descriptions?.[0]?.text),
    cta: first(c?.call_to_action_type, video?.call_to_action?.type, link?.call_to_action?.type, feed?.call_to_action_types?.[0]),
  };
}

const url = (path: string, token: string, params: Record<string, string>) => {
  const u = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token);
  return u;
};

export async function fetchCreativeMedia(target: { adAccountId: number; adId: string }): Promise<CreativeMedia> {
  const empty: CreativeMedia = { kind: "none", videoUrl: null, videoSeconds: null, images: [], cover: null, copy: { primaryText: null, headline: null, description: null, cta: null }, gaps: [] };
  const token = await getMetaToken();
  if (!token) return { ...empty, gaps: ["Media iklan tidak diambil: koneksi Meta Ads tim belum diisi."] };

  let creative: MetaCreative | undefined;
  try {
    creative = (await graphGet<{ creative?: MetaCreative }>(url(target.adId, token, { fields: CREATIVE_FIELDS }))).creative;
  } catch (error) {
    return { ...empty, gaps: [`Detail creative gagal diambil dari Meta: ${error instanceof MetaRequestError ? error.message : "kesalahan tidak dikenal"}.`] };
  }
  const media: CreativeMedia = { ...empty, copy: creativeCopy(creative), gaps: [] };
  if (!media.copy.primaryText && !media.copy.headline) media.gaps.push("Copy iklan (primary text / headline) tidak ditemukan di Meta.");

  const thumbnail = async () => {
    if (!creative?.id || !/^\d+$/.test(creative.id)) return null;
    try {
      const t = await graphGet<{ thumbnail_url?: string }>(url(creative.id, token, { fields: "thumbnail_url", thumbnail_width: "720", thumbnail_height: "720" }));
      return t.thumbnail_url ? downloadImage(t.thumbnail_url) : null;
    } catch {
      return null;
    }
  };

  const videoId = first(creative?.video_id, creative?.object_story_spec?.video_data?.video_id, creative?.asset_feed_spec?.videos?.[0]?.video_id);
  if (videoId && /^\d+$/.test(videoId)) {
    media.kind = "video";
    const readVideo = async (accessToken: string) => {
      const video = await graphGet<{ source?: string; length?: number }>(url(videoId, accessToken, { fields: "source,length" }));
      media.videoSeconds = typeof video.length === "number" ? Math.round(video.length) : media.videoSeconds;
      if (video.source && isMetaMediaUrl(video.source)) media.videoUrl = video.source;
    };
    await readVideo(token).catch(() => {});
    // The video belongs to the Page: an ads-only token gets "(#10) no permission", and even with
    // pages_read_engagement a System User token gets the length without `source` (checked 2026-10-07).
    // The Page token, available once the Page is assigned, returns the file URL.
    const pageId = first(creative?.object_story_spec?.page_id, creative?.effective_object_story_id?.split("_")[0]);
    if (!media.videoUrl && pageId && /^\d+$/.test(pageId)) {
      try {
        const page = await graphGet<{ access_token?: string }>(url(pageId, token, { fields: "access_token" }));
        if (page.access_token) await readVideo(page.access_token);
      } catch {
        /* falls back to the cover image below */
      }
    }
    const cover = await thumbnail();
    if (media.videoUrl) media.cover = cover;
    else {
      if (cover) media.images.push(cover);
      media.gaps.push(cover
        ? "File video tidak bisa diambil dari Meta, jadi yang dinilai hanya cover video. Supaya isi video ikut dinilai, token Meta perlu izin pages_read_engagement dan akses ke Page iklan ini (assign Page ke System User)."
        : "File video dan cover-nya tidak bisa diambil dari Meta, jadi visual tidak dinilai.");
    }
    return media;
  }

  const cards = (creative?.object_story_spec?.link_data?.child_attachments ?? []).map((c) => c.picture).filter((p): p is string => !!p);
  if (cards.length > 1) {
    media.kind = "carousel";
    for (const picture of cards.slice(0, MAX_CAROUSEL_IMAGES)) {
      const image = await downloadImage(picture);
      if (image) media.images.push(image);
    }
    if (media.images.length < Math.min(cards.length, MAX_CAROUSEL_IMAGES)) media.gaps.push("Sebagian kartu carousel tidak bisa diambil dari Meta.");
    if (cards.length > MAX_CAROUSEL_IMAGES) media.gaps.push(`Hanya ${MAX_CAROUSEL_IMAGES} kartu carousel pertama yang dinilai.`);
    return media;
  }

  const src = first(creative?.image_url, creative?.object_story_spec?.link_data?.picture, creative?.object_story_spec?.photo_data?.url, creative?.object_story_spec?.video_data?.image_url);
  const image = (src ? await downloadImage(src) : null) ?? (await thumbnail());
  if (image) {
    media.kind = "image";
    media.images.push(image);
  } else media.gaps.push("Gambar creative tidak bisa diambil dari Meta, jadi visual tidak dinilai.");
  return media;
}

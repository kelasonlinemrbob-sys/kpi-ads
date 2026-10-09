"use client";
import { Check, ChevronDown, RotateCcw } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { ORDER_FORM_FONT_CLASSES } from "@/components/order-form-fonts";
import { formPageBackground } from "@/components/order-form-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIELD_LABELS, type FieldKey, type OrderFields } from "@/lib/order-form-input";
import {
  applyFormTheme,
  BUTTON_STYLES,
  buttonForeground,
  contrastRatio,
  FIELD_STYLES,
  FORM_FONTS,
  FORM_RADII,
  FORM_THEMES,
  FORM_WIDTHS,
  THEME_TOKEN_DEFAULTS,
  THEME_TOKEN_KEYS,
  type FormAppearance,
  type FormThemeId,
} from "@/lib/order-form-config";

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const isHex = (value: string | null | undefined): value is string => !!value && /^#[0-9a-f]{6}$/i.test(value);
const IMAGE_URL = /^https:\/\/[^\s"'<>()\\]+$/;
/** Font stacks for the picker tiles; the same variables the form itself uses. */
const FONT_PREVIEW: Record<FormAppearance["font"], string> = {
  sans: "var(--font-dm-sans)", inter: "var(--of-font-inter)", jakarta: "var(--of-font-jakarta)", poppins: "var(--of-font-poppins)", montserrat: "var(--of-font-montserrat)",
  nunito: "var(--of-font-nunito)", rounded: "ui-rounded, 'SF Pro Rounded', sans-serif", playfair: "var(--of-font-playfair)", lora: "var(--of-font-lora)",
  serif: "ui-serif, Georgia, serif", mono: "ui-monospace, Menlo, monospace",
};

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm">{label}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {(Object.keys(options) as T[]).map((key) => (
          <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors ${value === key ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {options[key]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function HexInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex gap-2">
      <input type="color" aria-label={label} value={isHex(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1" />
      <Input
        aria-label={`${label} (hex)`}
        value={value}
        maxLength={7}
        spellCheck={false}
        className="font-mono uppercase"
        onChange={(e) => {
          const next = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
          if (/^#[0-9a-fA-F]{0,6}$/.test(next)) onChange(next.toLowerCase());
        }}
      />
    </div>
  );
}

function ColorField({ id, label, value, onChange, warning }: { id: string; label: string; value: string; onChange: (value: string) => void; warning?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <HexInput label={label} value={value} onChange={onChange} />
      {warning && <p className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>}
    </div>
  );
}

/** A colour that is derived automatically until the user picks one. */
function OptionalColor({ label, hint, value, auto, onChange, warning }: { label: string; hint: string; value: string | null; auto: string; onChange: (value: string | null) => void; warning?: string }) {
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm">{label}</span>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="size-3.5" checked={value === null} onChange={(e) => onChange(e.target.checked ? null : auto)} />
          Otomatis
        </label>
      </div>
      {value === null ? (
        <p className="flex h-10 items-center gap-2 rounded-md border border-dashed px-3 text-xs text-muted-foreground">
          <span className="size-4 shrink-0 rounded border" style={{ background: auto }} />
          {hint}
        </p>
      ) : (
        <HexInput label={label} value={value} onChange={onChange} />
      )}
      {warning && <p className="text-xs text-amber-600 dark:text-amber-400">{warning}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function Section({ title, description, defaultOpen = false, children }: { title: string; description: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details open={defaultOpen} className="group/section hatched rounded-xl border p-1">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-1.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-foreground/80">{title}</span>
          <span className="block text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/section:rotate-180" />
      </summary>
      <div className="mt-1 rounded-lg border bg-card p-4">{children}</div>
    </details>
  );
}

function ImageUrl({ id, label, value, onChange, help }: { id: string; label: string; value: string; onChange: (value: string) => void; help: string }) {
  const invalid = value !== "" && !IMAGE_URL.test(value);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="url" inputMode="url" placeholder="https://…" value={value} maxLength={500} spellCheck={false} onChange={(e) => onChange(e.target.value.trim())} aria-invalid={invalid} />
      <p className={`text-xs ${invalid ? "text-destructive" : "text-muted-foreground"}`}>{invalid ? "Gunakan URL gambar yang diawali https://" : help}</p>
    </div>
  );
}

function PresetTile({ id, active, onClick }: { id: FormThemeId; active: boolean; onClick: () => void }) {
  const t = { ...THEME_TOKEN_DEFAULTS, ...FORM_THEMES[id] } as unknown as FormAppearance;
  const r = t.radius === "none" ? 0 : t.radius === "full" ? 99 : 4;
  const button = t.buttonStyle === "gradient" ? `linear-gradient(135deg, ${t.buttonColor}, ${t.buttonColorTo ?? t.buttonColor})` : t.buttonStyle === "solid" ? t.buttonColor : t.buttonStyle === "soft" ? `${t.buttonColor}26` : "transparent";
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`relative overflow-hidden rounded-lg border text-left text-xs transition-shadow ${active ? "ring-2 ring-primary" : "hover:shadow-sm"}`}>
      <span className="block p-2.5" style={{ background: formPageBackground(t) }}>
        <span className="block border p-2" style={{ background: t.backgroundColor, color: t.textColor, borderRadius: t.radius === "none" ? 0 : t.radius === "full" ? 14 : 8, borderColor: `${t.textColor}22` }}>
          <span className="block h-1.5 w-2/3 rounded-full opacity-80" style={{ background: t.headingColor ?? t.textColor }} />
          <span className="mt-1.5 block h-3 border" style={{ borderColor: `${t.textColor}33`, borderRadius: r, background: t.fieldBgColor ?? undefined }} />
          <span className="mt-1.5 block h-3.5" style={{ background: button, border: `1.5px solid ${t.buttonStyle === "soft" ? "transparent" : t.buttonColor}`, borderRadius: r }} />
        </span>
      </span>
      <span className="flex items-center justify-between gap-1 border-t bg-card px-2.5 py-2 font-medium">
        {FORM_THEMES[id].label}
        {active && <Check className="size-3.5 text-primary" />}
      </span>
    </button>
  );
}

export function AppearanceSettings({ fields, setFields, appearance: a, setAppearance }: { fields: OrderFields; setFields: (value: OrderFields) => void; appearance: FormAppearance; setAppearance: (value: FormAppearance) => void }) {
  /** Changing a visual token by hand turns the preset into "custom". */
  const set = <K extends keyof FormAppearance>(key: K, value: FormAppearance[K]) =>
    setAppearance({ ...a, [key]: value, ...((THEME_TOKEN_KEYS as readonly string[]).includes(key) ? { theme: "custom" as const } : {}) });
  const transparent = a.pageColor === "transparent";
  const pageMode = transparent ? "transparent" : a.pageStyle;
  const ratio = (x: string | null, y: string) => (isHex(x) && isHex(y) ? contrastRatio(x, y) : 21);
  const textContrast = ratio(a.textColor, a.backgroundColor);
  const headingContrast = ratio(a.headingColor ?? a.textColor, a.backgroundColor);
  const filledButton = a.buttonStyle === "solid" || a.buttonStyle === "gradient";
  const buttonText = a.buttonTextColor ?? (filledButton && isHex(a.buttonColor) ? buttonForeground(a.buttonColor) : a.buttonColor);
  const buttonContrast = filledButton ? ratio(buttonText, a.buttonColor) : ratio(a.buttonTextColor ?? a.buttonColor, a.backgroundColor);
  const radiusOptions = { follow: "Ikuti kartu", ...FORM_RADII } as Record<"follow" | keyof typeof FORM_RADII, string>;

  return (
    <div className="grid gap-4">
      <Panel title="Field customer">
        <div className="grid gap-3 p-4">
          {(Object.keys(FIELD_LABELS) as FieldKey[]).map((key) => (
            <div key={key} className="grid items-center gap-2 sm:grid-cols-[90px_170px_1fr] sm:gap-3">
              <Label htmlFor={`field_${key}`}>{FIELD_LABELS[key]}</Label>
              <select id={`field_${key}`} name={`field_${key}`} value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value as OrderFields[FieldKey] })} className={selectClass}>
                <option value="required">Aktif · wajib</option>
                <option value="optional">Aktif · opsional</option>
                <option value="off">Nonaktif</option>
              </select>
              <Input aria-label={`Placeholder ${FIELD_LABELS[key]}`} placeholder="Placeholder" value={a.placeholders[key]} maxLength={80} disabled={fields[key] === "off"} onChange={(e) => setAppearance({ ...a, placeholders: { ...a.placeholders, [key]: e.target.value } })} />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Minimal No. HP atau Email wajib diisi agar customer bisa dihubungi. Kolom kanan adalah teks contoh di dalam field.</p>
        </div>
      </Panel>

      <Panel
        title="Tema"
        action={
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAppearance({ ...a, ...THEME_TOKEN_DEFAULTS, theme: "whatsapp" } as FormAppearance)}>
            <RotateCcw className="size-3.5" />
            Reset gaya
          </Button>
        }
      >
        <div className="grid gap-3 p-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(FORM_THEMES) as FormThemeId[]).map((id) => (
              <PresetTile key={id} id={id} active={a.theme === id} onClick={() => setAppearance(applyFormTheme(a, id))} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {a.theme === "custom" ? "Tema kustom. Pilih tema di atas untuk mengganti semua warna dan gaya sekaligus." : "Pilih tema sebagai titik awal, lalu sesuaikan detailnya di bawah. Teks, placeholder, logo dan banner tidak ikut berubah."}
          </p>
        </div>
      </Panel>

      <Section title="Warna" description="Warna utama, plus warna detail untuk judul, field, tombol dan keunggulan." defaultOpen>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField id="of-color-button" label="Warna tombol / aksen" value={a.buttonColor} onChange={(v) => set("buttonColor", v)} warning={buttonContrast < 3 ? `Teks tombol kurang kontras (${buttonContrast.toFixed(1)}:1).` : undefined} />
          <ColorField id="of-color-bg" label="Latar form" value={a.backgroundColor} onChange={(v) => set("backgroundColor", v)} />
          <ColorField id="of-color-text" label="Warna teks" value={a.textColor} onChange={(v) => set("textColor", v)} warning={textContrast < 4.5 ? `Kontras teks ${textContrast.toFixed(1)}:1, sulit dibaca (disarankan ≥ 4.5:1).` : undefined} />
          <OptionalColor label="Warna judul" hint="Sama dengan warna teks" value={a.headingColor} auto={a.textColor} onChange={(v) => set("headingColor", v)} warning={headingContrast < 3 ? `Kontras judul ${headingContrast.toFixed(1)}:1.` : undefined} />
        </div>
        <details className="group/detail mt-4 rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Warna detail
            <span className="text-xs font-normal text-muted-foreground">teks sekunder, garis, field, tombol, keunggulan</span>
            <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open/detail:rotate-180" />
          </summary>
          <div className="grid gap-4 border-t p-3 sm:grid-cols-2">
            <OptionalColor label="Teks sekunder" hint="Campuran teks & latar" value={a.mutedColor} auto="#64748b" onChange={(v) => set("mutedColor", v)} />
            <OptionalColor label="Garis & border kartu" hint="Tipis dari warna teks" value={a.borderColor} auto="#e2e8f0" onChange={(v) => set("borderColor", v)} />
            <OptionalColor label="Latar field" hint="Mengikuti gaya field" value={a.fieldBgColor} auto={a.backgroundColor} onChange={(v) => set("fieldBgColor", v)} />
            <OptionalColor label="Garis field" hint="Mengikuti gaya field" value={a.fieldBorderColor} auto="#cbd5e1" onChange={(v) => set("fieldBorderColor", v)} />
            <OptionalColor label="Teks tombol" hint="Kontras otomatis" value={a.buttonTextColor} auto={buttonText} onChange={(v) => set("buttonTextColor", v)} />
            <OptionalColor label="Ujung gradasi tombol" hint="Versi gelap warna tombol" value={a.buttonColorTo} auto={a.buttonColor} onChange={(v) => set("buttonColorTo", v)} />
            <OptionalColor label="Latar baris keunggulan" hint="Sedikit lebih gelap dari latar" value={a.benefitsBgColor} auto={a.backgroundColor} onChange={(v) => set("benefitsBgColor", v)} />
            <OptionalColor label="Teks baris keunggulan" hint="Sama dengan teks sekunder" value={a.benefitsTextColor} auto={a.textColor} onChange={(v) => set("benefitsTextColor", v)} />
          </div>
        </details>
      </Section>

      <Section title="Latar halaman" description="Warna polos, gradasi dua warna, atau transparan untuk embed.">
        <div className="grid gap-4">
          <Segmented
            label="Jenis latar"
            value={pageMode}
            options={{ solid: "Polos", gradient: "Gradasi", transparent: "Transparan" }}
            onChange={(mode) => setAppearance({ ...a, theme: "custom", pageStyle: mode === "gradient" ? "gradient" : "solid", pageColor: mode === "transparent" ? "transparent" : transparent ? "#f8fafc" : a.pageColor })}
          />
          {!transparent && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ColorField id="of-color-page" label={a.pageStyle === "gradient" ? "Warna awal" : "Latar halaman"} value={a.pageColor} onChange={(v) => set("pageColor", v)} />
              {a.pageStyle === "gradient" && <ColorField id="of-color-page-to" label="Warna akhir" value={a.pageGradientTo} onChange={(v) => set("pageGradientTo", v)} />}
              {a.pageStyle === "gradient" && (
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="of-angle">Arah gradasi · {a.pageGradientAngle}°</Label>
                  <input id="of-angle" type="range" min={0} max={360} step={15} value={a.pageGradientAngle} onChange={(e) => set("pageGradientAngle", Number(e.target.value))} />
                </div>
              )}
            </div>
          )}
          {transparent && <p className="text-xs text-muted-foreground">Form mengikuti latar landing page tempat kode embed dipasang.</p>}
        </div>
      </Section>

      <Section title="Tipografi" description="Font, ukuran dan ketebalan judul, serta ukuran teks.">
        <div className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm">Font</legend>
            <div className={`grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 ${ORDER_FORM_FONT_CLASSES}`}>
              {(Object.keys(FORM_FONTS) as FormAppearance["font"][]).map((key) => (
                <button key={key} type="button" aria-pressed={a.font === key} onClick={() => set("font", key)} className={`rounded-lg border px-3 py-2 text-left transition-colors ${a.font === key ? "ring-2 ring-primary" : "hover:bg-accent"}`}>
                  <span className="block text-lg leading-tight" style={{ fontFamily: FONT_PREVIEW[key] }}>
                    Aa Daftar
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{FORM_FONTS[key]}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Segmented label="Ukuran judul" value={a.titleSize} options={{ sm: "S", md: "M", lg: "L", xl: "XL" }} onChange={(v) => set("titleSize", v)} />
            <Segmented label="Ketebalan judul" value={a.titleWeight} options={{ semibold: "Sedang", bold: "Tebal", extrabold: "Sangat tebal" }} onChange={(v) => set("titleWeight", v)} />
            <Segmented label="Ukuran teks" value={a.textSize} options={{ sm: "Kecil", md: "Normal", lg: "Besar" }} onChange={(v) => set("textSize", v)} />
          </div>
        </div>
      </Section>

      <Section title="Bentuk & tata letak" description="Lebar form, kartu, sudut, bayangan, border dan jarak.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented label="Tampilan" value={a.layout} options={{ card: "Kartu", plain: "Tanpa kartu" }} onChange={(v) => set("layout", v)} />
          <Segmented label="Lebar form (juga di embed)" value={a.width} options={FORM_WIDTHS} onChange={(v) => set("width", v)} />
          <div className="sm:col-span-2">
            <Segmented label="Sudut kartu" value={a.radius} options={FORM_RADII} onChange={(v) => set("radius", v)} />
          </div>
          <Segmented label="Sudut field" value={a.fieldRadius ?? "follow"} options={radiusOptions} onChange={(v) => set("fieldRadius", v === "follow" ? null : v)} />
          <Segmented label="Sudut tombol" value={a.buttonRadius ?? "follow"} options={radiusOptions} onChange={(v) => set("buttonRadius", v === "follow" ? null : v)} />
          {a.layout === "card" && <Segmented label="Bayangan kartu" value={a.shadow} options={{ none: "Tanpa", sm: "Tipis", md: "Sedang", lg: "Tebal" }} onChange={(v) => set("shadow", v)} />}
          {a.layout === "card" && <Segmented label="Border kartu" value={a.border} options={{ none: "Tanpa", thin: "Tipis", thick: "Tebal" }} onChange={(v) => set("border", v)} />}
          <Segmented label="Padding dalam" value={a.padding} options={{ compact: "Rapat", normal: "Normal", spacious: "Lega" }} onChange={(v) => set("padding", v)} />
          <Segmented label="Jarak antar field" value={a.fieldGap} options={{ compact: "Rapat", normal: "Normal", relaxed: "Lega" }} onChange={(v) => set("fieldGap", v)} />
        </div>
      </Section>

      <Section title="Field & tombol" description="Gaya field, gaya dan ukuran tombol, bayangan dan ikon.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented label="Gaya field" value={a.fieldStyle} options={FIELD_STYLES} onChange={(v) => set("fieldStyle", v)} />
          <Segmented label="Gaya tombol" value={a.buttonStyle} options={BUTTON_STYLES} onChange={(v) => set("buttonStyle", v)} />
          <Segmented label="Ukuran tombol" value={a.buttonSize} options={{ md: "Normal", lg: "Besar" }} onChange={(v) => set("buttonSize", v)} />
          <div className="grid content-end gap-2.5">
            <Toggle checked={a.buttonShadow} onChange={(v) => set("buttonShadow", v)}>Bayangan berwarna pada tombol</Toggle>
            <Toggle checked={a.showButtonIcon} onChange={(v) => set("showButtonIcon", v)}>Ikon panah pada tombol</Toggle>
          </div>
          {a.buttonStyle === "gradient" && <p className="text-xs text-muted-foreground sm:col-span-2">Gradasi dari warna tombol ke warna akhir. Atur warna akhir di Warna → Warna detail → Ujung gradasi tombol.</p>}
        </div>
      </Section>

      <Section title="Header & gambar" description="Logo, banner, nama produk, judul dan baris keunggulan.">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <ImageUrl id="of-logo" label="Logo (URL gambar)" value={a.logoUrl} onChange={(v) => setAppearance({ ...a, logoUrl: v })} help="PNG/SVG transparan disarankan. Kosongkan untuk tanpa logo." />
            {a.logoUrl && <Segmented label="Ukuran logo" value={a.logoSize} options={{ sm: "Kecil", md: "Sedang", lg: "Besar" }} onChange={(v) => setAppearance({ ...a, logoSize: v })} />}
          </div>
          <ImageUrl id="of-banner" label="Banner di atas form (URL gambar)" value={a.bannerUrl} onChange={(v) => setAppearance({ ...a, bannerUrl: v })} help="Gambar lebar, misalnya 1200×400. Kosongkan untuk tanpa banner." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Segmented label="Rata judul" value={a.align} options={{ left: "Kiri", center: "Tengah" }} onChange={(v) => set("align", v)} />
            <div className="grid content-end gap-2.5">
              <Toggle checked={a.showProduct} onChange={(v) => set("showProduct", v)}>Tampilkan nama produk</Toggle>
              <Toggle checked={a.titleDivider} onChange={(v) => set("titleDivider", v)}>Garis di bawah judul</Toggle>
            </div>
          </div>
          <div className="grid gap-3 rounded-lg border p-3">
            <Toggle checked={a.showBenefits} onChange={(v) => set("showBenefits", v)}>Tampilkan baris keunggulan</Toggle>
            {a.showBenefits && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Segmented label="Posisi" value={a.benefitsPosition} options={{ top: "Atas", bottom: "Bawah" }} onChange={(v) => set("benefitsPosition", v)} />
                  <div className="grid content-end">
                    <Toggle checked={a.benefitsIcons} onChange={(v) => set("benefitsIcons", v)}>Tampilkan ikon</Toggle>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {a.benefits.map((value, index) => (
                    <Input
                      key={index}
                      aria-label={`Keunggulan ${index + 1}`}
                      value={value}
                      maxLength={20}
                      onChange={(e) => {
                        const next = [...a.benefits] as FormAppearance["benefits"];
                        next[index] = e.target.value;
                        setAppearance({ ...a, benefits: next });
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Teks & label" description="Teks tombol, catatan di bawah tombol, dan label field." defaultOpen>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="of-button-text">Teks tombol</Label>
            <Input id="of-button-text" value={a.buttonText} maxLength={60} onChange={(e) => setAppearance({ ...a, buttonText: e.target.value })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="of-note">Catatan di bawah tombol</Label>
            <Input id="of-note" value={a.note} maxLength={160} placeholder="Kosongkan untuk menyembunyikan" onChange={(e) => setAppearance({ ...a, note: e.target.value })} />
          </div>
          <Toggle checked={a.showLabels} onChange={(v) => setAppearance({ ...a, showLabels: v })}>
            Tampilkan label di atas field
          </Toggle>
        </div>
      </Section>
    </div>
  );
}

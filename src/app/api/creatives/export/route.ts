import { getCurrentUser } from "@/lib/auth";
import { creativesCsv, getCreativeRows, getCreativeTeam, parseCreativeFilters } from "@/lib/creatives-data";
import { adsScopeFor } from "@/lib/ads-scope";
import { can } from "@/lib/roles";
import { creativePeriod } from "@/lib/creative-period";

/** CSV of the Creative page with the current filters, in the team's spreadsheet column order. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can.viewCreatives(user.role)) return new Response("Forbidden", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const period = creativePeriod(sp.period);
  const [rows, team] = await Promise.all([getCreativeRows({ ...parseCreativeFilters(sp, user), scope: await adsScopeFor(user) }), getCreativeTeam()]);
  return new Response(creativesCsv(rows, new Map(team.map((p) => [p.id, p.name])), period), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="konten-iklan-${period.start}_${period.end}.csv"`,
    },
  });
}

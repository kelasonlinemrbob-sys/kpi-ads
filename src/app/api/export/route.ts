import { getCurrentUser } from "@/lib/auth";
import { getMembers, getScorecards } from "@/lib/data";
import { currentPeriod, isPeriod, STATUS_META } from "@/lib/kpi";
import { ROLE_LABEL } from "@/lib/roles";

const csv = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Scorecard CSV for a month: the whole team for supervisors, only yourself otherwise. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const p = new URL(req.url).searchParams.get("period") ?? "";
  const period = isPeriod(p) ? p : currentPeriod();

  const members =
    user.role === "supervisor"
      ? await getMembers()
      : [{ id: user.id, name: user.name, email: user.email, role: user.role, title: user.title }];
  const cards = await getScorecards(period, members);

  const lines = [["Period", "Member", "Email", "Role", "KPI Score", "Status", "Reports", "KPI", "Actual", "Target", "Expected to date", "Achievement %", "Weight"]];
  for (const c of cards) {
    for (const r of c.results) {
      lines.push([
        period,
        c.member.name,
        c.member.email,
        ROLE_LABEL[c.member.role],
        c.score === null ? "" : c.score.toFixed(1),
        STATUS_META[c.status].label,
        String(c.reportsCount),
        r.metric.name,
        r.actual === null ? "" : String(+r.actual.toFixed(2)),
        r.target === null ? "" : String(r.target),
        r.expected === null ? "" : String(+r.expected.toFixed(2)),
        r.achievement === null ? "" : (r.achievement * 100).toFixed(1),
        String(r.metric.weight),
      ]);
    }
  }
  const body = "﻿" + lines.map((l) => l.map(csv).join(",")).join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kpi-scorecard-${period}.csv"`,
    },
  });
}

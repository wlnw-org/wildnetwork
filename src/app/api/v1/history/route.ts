import { PERIODS, getHistory, type Period } from "@/lib/history";

/**
 * GET /api/v1/history?period=7d|30d|12m&group=all|avian|bat|...
 * What was recorded over a past period (see src/lib/history.ts). Served from history_cache, renewed every few hours.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const period = (p.get("period") ?? "7d") as Period;
  if (!(period in PERIODS)) return Response.json({ error: "period must be 7d, 30d or 12m" }, { status: 400 });
  const g = (p.get("group") ?? "all").slice(0, 20);
  return Response.json(await getHistory(period, g), { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}

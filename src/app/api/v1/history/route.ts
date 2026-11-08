import { PERIODS, getHistory, localArrivals, type Period } from "@/lib/history";

/**
 * GET /api/v1/history?period=7d|30d|12m&group=all|avian|bat|...[&lat&lon]
 * What was recorded over a past period (see src/lib/history.ts). Served from history_cache, renewed every few hours.
 * With ?lat&lon (whole degrees, snapped to the 5 degree cell) the arrivals list is the visitor's area first (near, then region,
 * then the world); arrivalsScope says which. Totals, dots and the most recorded list stay worldwide.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const period = (p.get("period") ?? "7d") as Period;
  if (!(period in PERIODS)) return Response.json({ error: "period must be 7d, 30d or 12m" }, { status: 400 });
  const g = (p.get("group") ?? "all").slice(0, 20);
  const la = Number(p.get("lat")), lo = Number(p.get("lon"));
  const here = p.has("lat") && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180
    ? { cellLat: Math.floor(la / 5) * 5, cellLon: Math.floor(lo / 5) * 5 } : null;
  const [data, local] = await Promise.all([getHistory(period, g), here ? localArrivals(period, g, here.cellLat, here.cellLon) : null]);
  const out = here
    ? { ...(data as object), ...(local ? { arrivals: local.arrivals, arrivalCount: local.arrivalCount } : {}), arrivalsScope: local?.scope ?? "world" }
    : data;
  return Response.json(out, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}

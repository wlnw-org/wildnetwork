import { RADAR, unusualNights } from "@/lib/radar";

export const dynamic = "force-dynamic";

/**
 * Unusual night migration over Europe. GET /api/v1/radar/unusual[?days=60] -> { from, to, rule, nights: [{ night, radars:
 * [{ radar, lat, lon, vid, normal, dir, ... }] }] }, newest first. A radar's night is unusual when it holds at least
 * UNUSUAL_RATIO times the median of its previous 14 nights and at least UNUSUAL_MIN_VID birds/km2. Radars with interference
 * are left out. Aloft data, CC BY 4.0, about two days behind.
 */
export async function GET(req: Request) {
  const d = Number(new URL(req.url).searchParams.get("days") ?? 60);
  const days = Number.isFinite(d) ? Math.min(Math.max(Math.round(d), 1), RADAR.KEEP_DAYS) : 60;
  const data = await unusualNights(days).catch(() => null);
  if (!data) return Response.json({ error: "radar data unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  return Response.json({
    ...data, rule: { ratio: RADAR.UNUSUAL_RATIO, minBirdsPerKm2: RADAR.UNUSUAL_MIN_VID, normalNights: RADAR.NORMAL_NIGHTS, minNormalNights: RADAR.MIN_NORMAL },
    source: "Aloft (ENRAM, BALTRAD, OPERA weather radars), CC BY 4.0",
  }, { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}

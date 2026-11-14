import { radarNight } from "@/lib/radar";

export const dynamic = "force-dynamic";

/**
 * Night bird migration over Europe from weather radars (Aloft, CC BY 4.0). GET /api/v1/radar[?night=YYYY-MM-DD] ->
 * { night, nights, radars: [{ radar, lat, lon, vid (birds/km2 aloft, night mean), mtr (birds/km/h, mean), mtrMax, dir
 * (degrees, direction of movement), normal (median vid of the previous 14 nights), profiles }] }. About two days behind.
 */
export async function GET(req: Request) {
  const night = new URL(req.url).searchParams.get("night") ?? undefined;
  const data = await radarNight(night && /^\d{4}-\d{2}-\d{2}$/.test(night) ? night : undefined).catch(() => null);
  if (!data) return Response.json({ error: "radar data unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  return Response.json({ ...data, source: "Aloft (ENRAM, BALTRAD, OPERA weather radars), CC BY 4.0" },
    { headers: { "cache-control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}

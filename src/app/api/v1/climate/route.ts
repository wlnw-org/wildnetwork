import { cellClimate } from "@/lib/climate";

/**
 * Climate context for the 5 degree cell holding a point: GET /api/v1/climate?lat=&lon= ->
 * { cell, base, last12: { tAnom (deg C vs 1991-2020), pPct (rain, % vs normal), from, to }, years: [...], recent: [24 months] }.
 * Sources: NASA GISTEMP v4 (temperature), NOAA GPCP v2.3 (rainfall). See /methods#climate.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get("lat")), lon = Number(u.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  const data = await cellClimate(lat, lon);
  if (!data) return Response.json({ error: "no climate data" }, { status: 404, headers: { "cache-control": "public, s-maxage=3600" } });
  return Response.json(data, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}

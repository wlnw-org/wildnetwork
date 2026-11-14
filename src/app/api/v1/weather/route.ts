import { after } from "next/server";
import { sql } from "@/lib/db";
import { REFRESH_MS, WEATHER_KEY, claimWeatherRefresh, computeWeather, storeWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";
const headers = { "cache-control": "public, s-maxage=1800, stale-while-revalidate=10800" };

/** Map weather layer: GET /api/v1/weather -> { at, source, points: [{ lat, lon, t (C), ws (km/h at 850 hPa), wd (degrees, wind from) }] }. */
export async function GET() {
  const [row] = await sql<{ data: unknown; age_ms: number }[]>`
    SELECT data, (extract(epoch FROM now() - computed_at) * 1000)::float AS age_ms FROM history_cache WHERE key = ${WEATHER_KEY}`.catch(() => []);
  if (row) {
    if (row.age_ms > REFRESH_MS) after(async () => {
      if (await claimWeatherRefresh()) await storeWeather(await computeWeather()).catch((e) => console.error("weather refresh", e));
    });
    return Response.json(row.data, { headers });
  }
  try {
    const data = await computeWeather();
    await storeWeather(data).catch(() => {});
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: "weather unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

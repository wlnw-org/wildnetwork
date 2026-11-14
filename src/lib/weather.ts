import { sql } from "@/lib/db";

/**
 * Weather layer for the map: wind about 1.5 km up (850 hPa, the height most night migrants fly at) and ground temperature,
 * on a 10 degree world grid, from Open-Meteo (CC BY 4.0, free for non-commercial use). One copy is kept in history_cache
 * (key WEATHER_KEY) and refreshed every REFRESH_MS, so the site makes about 470 x 8 = 3,800 location calls a day, well
 * inside Open-Meteo's free 10,000. Visitors never call Open-Meteo themselves.
 */
export const WEATHER_KEY = "weather|grid";
export const REFRESH_MS = 3 * 60 * 60 * 1000;
const STEP = 10, LAT_MIN = -50, LAT_MAX = 70, BATCH = 100;

export type WeatherPoint = { lat: number; lon: number; t: number; ws: number; wd: number };
export type Weather = { at: string; source: string; points: WeatherPoint[] };

function grid() {
  const pts: { lat: number; lon: number }[] = [];
  for (let lat = LAT_MIN; lat <= LAT_MAX; lat += STEP) for (let lon = -180; lon < 180; lon += STEP) pts.push({ lat, lon });
  return pts;
}

type Current = { time: string; temperature_2m: number | null; wind_speed_850hPa: number | null; wind_direction_850hPa: number | null };

async function fetchBatch(pts: { lat: number; lon: number }[]): Promise<Current[]> {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", pts.map((p) => p.lat).join(","));
  u.searchParams.set("longitude", pts.map((p) => p.lon).join(","));
  u.searchParams.set("current", "temperature_2m,wind_speed_850hPa,wind_direction_850hPa");
  u.searchParams.set("wind_speed_unit", "kmh");
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(u, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "WildlifeNetwork/0.1" } }).catch(() => null);
    if (r?.ok) {
      const j = await r.json();
      return (Array.isArray(j) ? j : [j]).map((x: { current: Current }) => x.current);
    }
    await new Promise((res) => setTimeout(res, 3000 * (attempt + 1))); // "service overloaded" happens; back off
  }
  throw new Error("open-meteo unavailable");
}

export async function computeWeather(): Promise<Weather> {
  const pts = grid(), out: WeatherPoint[] = [];
  let at = "";
  for (let i = 0; i < pts.length; i += BATCH) {
    const part = pts.slice(i, i + BATCH);
    const cur = await fetchBatch(part);
    cur.forEach((c, k) => {
      if (!c || c.temperature_2m == null || c.wind_speed_850hPa == null || c.wind_direction_850hPa == null) return;
      at = at || c.time;
      out.push({ lat: part[k].lat, lon: part[k].lon, t: Math.round(c.temperature_2m), ws: Math.round(c.wind_speed_850hPa), wd: Math.round(c.wind_direction_850hPa) });
    });
  }
  return { at: at ? `${at}Z` : new Date().toISOString(), source: "Open-Meteo (CC BY 4.0)", points: out };
}

export async function storeWeather(data: Weather) {
  await sql`INSERT INTO history_cache (key, data, computed_at) VALUES (${WEATHER_KEY}, ${sql.json(data as never)}, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, computed_at = now()`;
}

/** Claims a stale copy for one refresher (the other app copy and later requests skip it for 30 minutes). */
export async function claimWeatherRefresh(): Promise<boolean> {
  const rows = await sql`UPDATE history_cache SET computed_at = now() - make_interval(secs => ${REFRESH_MS / 1000 - 1800})
    WHERE key = ${WEATHER_KEY} AND computed_at < now() - make_interval(secs => ${REFRESH_MS / 1000}) RETURNING key`;
  return rows.length > 0;
}

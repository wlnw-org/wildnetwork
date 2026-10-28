import { sql } from "@/lib/db";

/** GET /api/v1/history/cell?period=7d|30d|12m&group=&lat=&lon= : the most recorded species in one 5 degree cell over a past period. */
const PERIODS = { "7d": 7, "30d": 30, "12m": 364 } as const;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const period = p.get("period") as keyof typeof PERIODS;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (!(period in PERIODS) || !Number.isInteger(lat) || !Number.isInteger(lon) || lat % 5 || lon % 5) return Response.json({ error: "period, lat and lon (cell corner) required" }, { status: 400 });
  const g = (p.get("group") ?? "all").slice(0, 20);
  const days = PERIODS[period];
  const table = period === "12m" ? sql`species_weekly` : sql`species_daily`;
  const since = period === "12m" ? sql`t.week >= CURRENT_DATE - ${days}::int` : sql`t.day >= CURRENT_DATE - ${days}::int`;
  const species = await sql<{ sci: string; common: string | null; n: number }[]>`
    SELECT t.scientific_name AS sci, MIN(t.vernacular_name) AS common, SUM(t.count)::float AS n
    FROM ${table} t JOIN species_group g USING (scientific_name)
    WHERE ${since} AND t.cell_lat = ${lat} AND t.cell_lon = ${lon} AND g.is_species ${g === "all" ? sql`` : sql`AND g.grp = ${g}`}
    GROUP BY 1 ORDER BY 3 DESC LIMIT 10`;
  return Response.json({ period, lat, lon, species }, { headers: { "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
}

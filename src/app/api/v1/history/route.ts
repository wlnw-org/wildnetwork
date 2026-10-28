import { sql } from "@/lib/db";

/**
 * GET /api/v1/history?period=7d|30d|12m&group=all|avian|bat|...
 * What was recorded over a past period, from the rollups (individual detections are only kept for the live window):
 * daily tables for 7 and 30 days (they hold 28 days, so "30d" starts at the oldest day kept), weekly tables for 12 months.
 * Returns per-cell record totals for the map, the most recorded species, and arrivals whose estimated week falls in the period.
 */
const PERIODS = { "7d": 7, "30d": 30, "12m": 364 } as const;
// Map icon group, as in the events route.
const ICON_GRP = sql`CASE g.grp WHEN 'marine' THEN 'Marine' WHEN 'bat' THEN 'bat' WHEN 'avian' THEN 'Aves' WHEN 'amphibian' THEN 'Amphibia' WHEN 'insect' THEN 'Insecta' WHEN 'mammal' THEN 'Mammalia' ELSE 'Unknown' END`;
type Period = keyof typeof PERIODS;

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const period = (p.get("period") ?? "7d") as Period;
  if (!(period in PERIODS)) return Response.json({ error: "period must be 7d, 30d or 12m" }, { status: 400 });
  const g = (p.get("group") ?? "all").slice(0, 20);
  const days = PERIODS[period];
  const weekly = period === "12m";
  const grpEffort = g === "all" ? sql`` : sql`AND grp = ${g}`;
  const grpSpecies = g === "all" ? sql`` : sql`AND g.grp = ${g}`;

  const table = weekly ? sql`species_weekly` : sql`species_daily`;
  const since = weekly ? sql`t.week >= CURRENT_DATE - ${days}::int` : sql`t.day >= CURRENT_DATE - ${days}::int`;
  const [[span], cells, top, [totals], arrivals, leaders] = await Promise.all([
    weekly
      ? sql<{ from: string; to: string }[]>`SELECT MIN(week)::text AS from, LEAST(MAX(week + 6), CURRENT_DATE)::text AS to FROM effort_weekly WHERE week >= CURRENT_DATE - ${days}::int`
      : sql<{ from: string; to: string }[]>`SELECT MIN(day)::text AS from, MAX(day)::text AS to FROM effort_daily WHERE day >= CURRENT_DATE - ${days}::int`,
    weekly
      ? sql<{ lat: number; lon: number; n: number }[]>`
          SELECT cell_lat AS lat, cell_lon AS lon, SUM(detections)::float AS n FROM effort_weekly WHERE week >= CURRENT_DATE - ${days}::int ${grpEffort} GROUP BY 1, 2`
      : sql<{ lat: number; lon: number; n: number }[]>`
          SELECT cell_lat AS lat, cell_lon AS lon, SUM(detections)::float AS n FROM effort_daily WHERE day >= CURRENT_DATE - ${days}::int ${grpEffort} GROUP BY 1, 2`,
    weekly
      ? sql<{ scientific_name: string; vernacular_name: string | null; n: number; cells: number }[]>`
          SELECT w.scientific_name, MIN(w.vernacular_name) AS vernacular_name, SUM(w.count)::float AS n, COUNT(DISTINCT (w.cell_lat, w.cell_lon))::int AS cells
          FROM species_weekly w JOIN species_group g USING (scientific_name)
          WHERE w.week >= CURRENT_DATE - ${days}::int AND g.is_species ${grpSpecies} GROUP BY 1 ORDER BY 3 DESC LIMIT 25`
      : sql<{ scientific_name: string; vernacular_name: string | null; n: number; cells: number }[]>`
          SELECT d.scientific_name, MIN(d.vernacular_name) AS vernacular_name, SUM(d.count)::float AS n, COUNT(DISTINCT (d.cell_lat, d.cell_lon))::int AS cells
          FROM species_daily d JOIN species_group g USING (scientific_name)
          WHERE d.day >= CURRENT_DATE - ${days}::int AND g.is_species ${grpSpecies} GROUP BY 1 ORDER BY 3 DESC LIMIT 25`,
    weekly
      ? sql<{ species: number }[]>`SELECT COUNT(DISTINCT w.scientific_name)::int AS species FROM species_weekly w JOIN species_group g USING (scientific_name) WHERE w.week >= CURRENT_DATE - ${days}::int AND g.is_species ${grpSpecies}`
      : sql<{ species: number }[]>`SELECT COUNT(DISTINCT d.scientific_name)::int AS species FROM species_daily d JOIN species_group g USING (scientific_name) WHERE d.day >= CURRENT_DATE - ${days}::int AND g.is_species ${grpSpecies}`,
    // Arrival estimates (from the last year of weekly history) whose week falls in the period: earliest cell per species.
    sql<{ scientific_name: string; vernacular_name: string | null; arrival: string; lat: number; lon: number; cells: number }[]>`
      SELECT DISTINCT ON (p.scientific_name) p.scientific_name, p.vernacular_name, p.arrival_week::text AS arrival, p.cell_lat AS lat, p.cell_lon AS lon,
             COUNT(*) OVER (PARTITION BY p.scientific_name)::int AS cells
      FROM phenology p JOIN species_group g USING (scientific_name)
      WHERE p.arrival_week >= CURRENT_DATE - ${days}::int AND (p.arrival_support IS NULL OR p.arrival_support >= 0.5) ${grpSpecies}
      ORDER BY p.scientific_name, p.arrival_week`,
    // The most recorded species per cell, with the source that recorded it most: drawn as one icon per cell.
    sql<{ lat: number; lon: number; sci: string; common: string | null; grp: string; src: string }[]>`
      WITH s AS (
        SELECT t.cell_lat, t.cell_lon, t.scientific_name, MIN(t.vernacular_name) AS common, SUM(t.count) AS n,
               (array_agg(t.source_system ORDER BY t.count DESC))[1] AS src, MIN(${ICON_GRP}) AS grp
        FROM ${table} t JOIN species_group g USING (scientific_name)
        WHERE ${since} AND g.is_species ${grpSpecies} GROUP BY 1, 2, 3)
      SELECT DISTINCT ON (cell_lat, cell_lon) cell_lat AS lat, cell_lon AS lon, scientific_name AS sci, common, grp, src
      FROM s ORDER BY cell_lat, cell_lon, n DESC`,
  ]);
  const lead = new Map(leaders.map((l) => [`${l.lat},${l.lon}`, l]));
  // Widespread arrivals first (seen arriving in the most areas), so one-off records do not lead the list.
  const recentArrivals = arrivals.sort((a, b) => b.cells - a.cells || b.arrival.localeCompare(a.arrival)).slice(0, 25);
  const records = cells.reduce((s, c) => s + c.n, 0);
  return Response.json(
    { period, group: g, from: span?.from ?? null, to: span?.to ?? null, records, species: totals?.species ?? 0,
      cells: cells.map((c) => { const l = lead.get(`${c.lat},${c.lon}`); return l ? { ...c, sci: l.sci, common: l.common, grp: l.grp, src: l.src } : c; }), top, arrivals: recentArrivals, arrivalCount: arrivals.length },
    { headers: { "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
  );
}

import { sql } from "@/lib/db";

/**
 * Past periods for the map (7d / 30d / 12m): what was recorded over a past period, from the rollups (individual detections are only kept for the live window):
 * daily tables for 7 and 30 days (they hold 28 days, so "30d" starts at the oldest day kept), weekly tables for 12 months.
 * Returns per-cell record totals for the map, the most recorded species, and arrivals whose estimated week falls in the period.
 */
export const PERIODS = { "7d": 7, "30d": 30, "12m": 364 } as const;
const POINTS_PER_CELL = 12;
// Map icon group, as in the events route.
const ICON_GRP = sql`CASE g.grp WHEN 'marine' THEN 'Marine' WHEN 'bat' THEN 'bat' WHEN 'avian' THEN 'Aves' WHEN 'amphibian' THEN 'Amphibia' WHEN 'insect' THEN 'Insecta' WHEN 'mammal' THEN 'Mammalia' ELSE 'Unknown' END`;
export type Period = keyof typeof PERIODS;

/** One period and class, computed from the rollups (5 to 15 s for the larger ones). */
export async function computeHistory(period: Period, g: string) {
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
    // The most recorded species per cell (up to POINTS_PER_CELL), with the source that recorded each most: drawn as dots like the live map.
    sql<{ lat: number; lon: number; sci: string; common: string | null; grp: string; src: string; n: number }[]>`
      WITH s AS (
        SELECT t.cell_lat, t.cell_lon, t.scientific_name, MIN(t.vernacular_name) AS common, SUM(t.count) AS n,
               (array_agg(t.source_system ORDER BY t.count DESC))[1] AS src, MIN(${ICON_GRP}) AS grp
        FROM ${table} t JOIN species_group g USING (scientific_name)
        WHERE ${since} AND g.is_species AND g.grp <> 'other' ${grpSpecies} GROUP BY 1, 2, 3)
      SELECT lat, lon, sci, common, grp, src, n FROM (
        SELECT cell_lat AS lat, cell_lon AS lon, scientific_name AS sci, common, grp, src, n::float AS n,
               ROW_NUMBER() OVER (PARTITION BY cell_lat, cell_lon ORDER BY n DESC) AS r FROM s) x
      WHERE r <= ${POINTS_PER_CELL}`,
  ]);
  // Widespread arrivals first (seen arriving in the most areas), so one-off records do not lead the list.
  const recentArrivals = arrivals.sort((a, b) => b.cells - a.cells || b.arrival.localeCompare(a.arrival)).slice(0, 25);
  const records = cells.reduce((s, c) => s + c.n, 0);
  return { period, group: g, from: span?.from ?? null, to: span?.to ?? null, records, species: totals?.species ?? 0,
      cells,
      // [lat, lon, scientific name, common name, icon group, source, records]: compact, there can be several thousand.
      points: leaders.map((l) => [l.lat, l.lon, l.sci, l.common, l.grp, l.src, Math.round(l.n)]), top, arrivals: recentArrivals, arrivalCount: arrivals.length };
}

export const HISTORY_GROUPS = ["all", "avian", "bat", "amphibian", "insect", "mammal", "marine"];
const FRESH_HOURS = 6;
// Refreshed when older than this, so entries are renewed before visitors would find them stale.
const REFRESH_HOURS = 3.5;

/**
 * Served from history_cache: the CDN cache is per region, so a database copy is what keeps every visitor fast. A missing or
 * stale entry is computed on the spot; warmHistory() refreshes every period and class ahead of time from the status trigger.
 */
export async function getHistory(period: Period, g: string) {
  const key = `${period}|${g}`;
  const [row] = await sql<{ data: unknown }[]>`SELECT data FROM history_cache WHERE key = ${key} AND computed_at > now() - make_interval(hours => ${FRESH_HOURS})`;
  if (row) return row.data;
  const data = await computeHistory(period, g);
  if (HISTORY_GROUPS.includes(g)) await storeHistory(key, data);
  return data;
}

async function storeHistory(key: string, data: unknown) {
  await sql`INSERT INTO history_cache (key, data, computed_at) VALUES (${key}, ${sql.json(data as never)}, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, computed_at = now()`;
}

/** Recompute the period and class summaries that are due, oldest first, within the time budget (all 21 take a few minutes). */
export async function warmHistory(budgetMs: number): Promise<number> {
  const t0 = Date.now();
  const have = new Map((await sql<{ key: string; t: number }[]>`SELECT key, extract(epoch FROM computed_at)::float AS t FROM history_cache`).map((r) => [r.key, r.t]));
  const due = Date.now() / 1000 - REFRESH_HOURS * 3600;
  const keys = (Object.keys(PERIODS) as Period[]).flatMap((p) => HISTORY_GROUPS.map((g) => `${p}|${g}`))
    .filter((k) => (have.get(k) ?? 0) < due).sort((a, b) => (have.get(a) ?? 0) - (have.get(b) ?? 0));
  let n = 0;
  for (const key of keys) {
    if (Date.now() - t0 > budgetMs) break;
    const [p, g] = key.split("|") as [Period, string];
    await storeHistory(key, await computeHistory(p, g));
    n++;
  }
  return n;
}

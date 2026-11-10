import { sql } from "@/lib/db";
import { REGION, YEAR_ROUND_Q25 } from "@/lib/methods";

/**
 * Which of `names` are recorded all year in a region (see YEAR_ROUND_Q25). Uses the species' own phenology cells in the region,
 * species_weekly summed over sources (and over a subspecies group's plain species name) against effort_weekly of the class, by calendar month over the last 52 weeks.
 */
export async function yearRound(region: string, names: string[], grp: string): Promise<Set<string>> {
  if (!names.length) return new Set();
  const rows = await sql<{ scientific_name: string }[]>`
    WITH cells AS (
      SELECT scientific_name, split_part(scientific_name, ' ', 1) || ' ' || split_part(scientific_name, ' ', 2) AS base, cell_lat, cell_lon
      FROM phenology WHERE ${REGION} = ${region} AND scientific_name IN ${sql(names)}),
    s AS (
      -- A name like "Phasianus colchicus [colchicus Group]" is pooled with its plain species name, which may hold the longer history.
      SELECT c.scientific_name, EXTRACT(MONTH FROM w.week)::int AS m, SUM(w.count)::float AS n
      FROM cells c JOIN species_weekly w ON w.cell_lat = c.cell_lat AND w.cell_lon = c.cell_lon AND w.scientific_name IN (c.scientific_name, c.base)
      WHERE w.week > now() - interval '52 weeks' GROUP BY 1, 2),
    e AS (
      SELECT c.scientific_name, EXTRACT(MONTH FROM f.week)::int AS m, SUM(f.detections)::float AS eff
      FROM effort_weekly f JOIN cells c USING (cell_lat, cell_lon)
      WHERE f.grp = ${grp} AND f.week > now() - interval '52 weeks' GROUP BY 1, 2),
    r AS (SELECT e.scientific_name, COALESCE(s.n, 0) / NULLIF(e.eff, 0) AS share FROM e LEFT JOIN s USING (scientific_name, m))
    SELECT scientific_name FROM r GROUP BY 1
    HAVING MAX(share) > 0 AND percentile_cont(0.25) WITHIN GROUP (ORDER BY share) / MAX(share) >= ${YEAR_ROUND_Q25}`;
  return new Set(rows.map((r) => r.scientific_name));
}

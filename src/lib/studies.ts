import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { ARRIVAL, sendMail } from "@/lib/alerts";
import { decryptToken } from "@/lib/optin";
import { SITE, speciesSlug } from "@/lib/site";

/**
 * Study areas: a box of 5 degree cells, a class and an optional species list, owned by an ORCID-signed-in researcher.
 * Everything shown is read from the same tables as the public map. Exports carry GBIF-derived rows only, because
 * BirdWeather-derived counts may be shown but not redistributed (see CLAUDE.md, BIRDWEATHER).
 */
export const STUDY_LIMITS = { PER_OWNER: 20, MAX_CELLS: 400, MEMBERS: 25 };
export const GROUP_LABEL: Record<string, string> = { avian: "Birds", bat: "Bats", amphibian: "Frogs and toads", insect: "Insects", mammal: "Mammals", marine: "Marine" };

export interface Study {
  id: string; owner: string; owner_name: string; title: string; question: string | null;
  lat_min: number; lat_max: number; lon_min: number; lon_max: number; grp: string; species: string[]; digest: boolean; created_at: string;
}

export const newStudyId = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").toLowerCase();
export const snap = (v: number) => Math.floor(v / 5) * 5;

export async function getStudy(id: string): Promise<Study | null> {
  const [s] = await sql<Study[]>`
    SELECT s.*, r.name AS owner_name, s.created_at::text AS created_at FROM studies s JOIN researchers r ON r.orcid = s.owner WHERE s.id = ${id}`;
  return s ?? null;
}

export async function canEdit(studyId: string, orcid: string | undefined): Promise<boolean> {
  if (!orcid) return false;
  const [r] = await sql`SELECT 1 FROM studies WHERE id = ${studyId} AND owner = ${orcid}
    UNION ALL SELECT 1 FROM study_members WHERE study_id = ${studyId} AND orcid = ${orcid} LIMIT 1`;
  return !!r;
}

const inBox = (s: Study) => sql`cell_lat BETWEEN ${s.lat_min} AND ${s.lat_max} AND cell_lon BETWEEN ${s.lon_min} AND ${s.lon_max}`;
const speciesFilter = (s: Study) => (s.species.length ? sql`AND scientific_name = ANY(${s.species})` : sql``);

/** Everything the dashboard shows, in one round of queries. */
export async function studyDashboard(s: Study) {
  const [coverage, top, arrivals, members, reviews] = await Promise.all([
    // Cells in the box and how many of the last 12 complete weeks each was watched (class effort above the minimum).
    sql<{ cell_lat: number; cell_lon: number; watched: number }[]>`
      SELECT cell_lat, cell_lon, COUNT(*) FILTER (WHERE detections >= CASE WHEN ${s.grp} = 'avian' THEN 1000 ELSE 150 END)::int AS watched
      FROM effort_weekly WHERE grp = ${s.grp} AND ${inBox(s)} AND week >= CURRENT_DATE - 91 AND week < date_trunc('week', now())::date
      GROUP BY 1, 2 ORDER BY 3 DESC`,
    // Most recorded over 8 weeks, as a share of the class's records in the same cells and weeks.
    sql<{ scientific_name: string; vernacular_name: string | null; n: number; share: number; cells: number }[]>`
      WITH w AS (
        SELECT w.scientific_name, MIN(w.vernacular_name) AS vernacular_name, SUM(w.count)::int AS n, COUNT(DISTINCT (w.cell_lat, w.cell_lon))::int AS cells
        FROM species_weekly w JOIN species_group g USING (scientific_name)
        WHERE g.grp = ${s.grp} AND g.is_species AND w.week >= CURRENT_DATE - 56 AND ${inBox(s)} ${speciesFilter(s)}
        GROUP BY 1),
      e AS (SELECT SUM(detections)::float AS d FROM effort_weekly WHERE grp = ${s.grp} AND week >= CURRENT_DATE - 56 AND ${inBox(s)})
      SELECT w.*, CASE WHEN e.d > 0 THEN 1000.0 * w.n / e.d ELSE 0 END::float AS share FROM w, e ORDER BY n DESC LIMIT 30`,
    // Arrival estimates in the box, with their intervals and support.
    sql<{ scientific_name: string; vernacular_name: string | null; cell_lat: number; cell_lon: number; arrival: string; low: string | null; high: string | null; support: number | null; peak: string }[]>`
      SELECT p.scientific_name, p.vernacular_name, p.cell_lat, p.cell_lon, p.arrival_week::text AS arrival, p.arrival_low::text AS low,
             p.arrival_high::text AS high, p.arrival_support AS support, p.peak_week::text AS peak
      FROM phenology p JOIN species_group g USING (scientific_name)
      WHERE g.grp = ${s.grp} AND ${sql`p.cell_lat BETWEEN ${s.lat_min} AND ${s.lat_max} AND p.cell_lon BETWEEN ${s.lon_min} AND ${s.lon_max}`}
        ${s.species.length ? sql`AND p.scientific_name = ANY(${s.species})` : sql``}
      ORDER BY EXTRACT(DOY FROM p.arrival_week), p.scientific_name LIMIT 400`,
    sql<{ orcid: string; name: string; role: string }[]>`
      SELECT m.orcid, r.name, m.role FROM study_members m JOIN researchers r USING (orcid) WHERE m.study_id = ${s.id} ORDER BY m.added_at`,
    sql<{ scientific_name: string; cell_lat: number; cell_lon: number; verdict: string; n: number }[]>`
      SELECT scientific_name, cell_lat, cell_lon, verdict, COUNT(*)::int AS n FROM arrival_reviews
      WHERE ${inBox(s)} GROUP BY 1, 2, 3, 4`,
  ]);
  return { coverage, top, arrivals, members, reviews };
}

/** GBIF-derived weekly rows in the box (CSV). BirdWeather-derived rows are never exported. */
export async function studyExport(s: Study): Promise<string> {
  const rows = await sql<{ week: string; cell_lat: number; cell_lon: number; scientific_name: string; vernacular_name: string | null; count: number }[]>`
    SELECT w.week::text AS week, w.cell_lat, w.cell_lon, w.scientific_name, w.vernacular_name, w.count
    FROM species_weekly w JOIN species_group g USING (scientific_name)
    WHERE w.source_system = 'gbif' AND g.grp = ${s.grp} AND ${inBox(s)} ${speciesFilter(s)}
    ORDER BY w.week, w.cell_lat, w.cell_lon, w.scientific_name LIMIT 200000`;
  const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [
    `# Wildlife Network study "${s.title}" (${SITE}/studies/${s.id}). GBIF-derived weekly records only (CC0 / CC BY 4.0 records); cite the contributing datasets listed at ${SITE}/data. Cells are 5 degree squares named by their south-west corner.`,
    "week,cell_lat,cell_lon,scientific_name,vernacular_name,records",
    ...rows.map((r) => [r.week, r.cell_lat, r.cell_lon, r.scientific_name, r.vernacular_name, r.count].map(esc).join(",")),
  ].join("\n");
}

/**
 * Weekly digest to the owner (when they gave an email and kept the digest on): species that turned up in the study area
 * this week or last after at least ARRIVAL.ABSENT_WEEKS watched weeks without them (the same rule as species alerts).
 */
export async function sendDigests(budgetMs = 60_000): Promise<number> {
  const t0 = Date.now();
  const due = await sql<(Study & { email_enc: string | null })[]>`
    SELECT s.*, r.name AS owner_name, r.email_enc FROM studies s JOIN researchers r ON r.orcid = s.owner
    WHERE s.digest AND r.email_enc IS NOT NULL AND (s.last_digest IS NULL OR s.last_digest < now() - interval '7 days')`;
  let sent = 0;
  for (const s of due) {
    if (Date.now() - t0 > budgetMs) break;
    const rows = await sql<{ scientific_name: string; vernacular_name: string | null; cell_lat: number; cell_lon: number; n: number }[]>`
      WITH cur AS (
        SELECT w.scientific_name, MIN(w.vernacular_name) AS vernacular_name, w.cell_lat, w.cell_lon, SUM(w.count)::int AS n
        FROM species_weekly w JOIN species_group g USING (scientific_name)
        WHERE g.grp = ${s.grp} AND g.is_species AND w.week >= date_trunc('week', now())::date - 7 AND ${inBox(s)} ${speciesFilter(s)}
        GROUP BY 1, 3, 4 HAVING SUM(w.count) >= ${ARRIVAL.MIN_RECORDS})
      SELECT c.* FROM cur c
      WHERE NOT EXISTS (SELECT 1 FROM species_weekly w2 WHERE w2.scientific_name = c.scientific_name AND w2.cell_lat = c.cell_lat AND w2.cell_lon = c.cell_lon
                          AND w2.week < date_trunc('week', now())::date - 7 AND w2.week >= date_trunc('week', now())::date - 7 - 7 * ${ARRIVAL.ABSENT_WEEKS})
        AND (SELECT COUNT(*) FROM effort_weekly e WHERE e.grp = ${s.grp} AND e.cell_lat = c.cell_lat AND e.cell_lon = c.cell_lon AND e.detections > 0
               AND e.week < date_trunc('week', now())::date - 7 AND e.week >= date_trunc('week', now())::date - 7 - 7 * ${ARRIVAL.ABSENT_WEEKS}) >= ${ARRIVAL.ABSENT_WEEKS}
      ORDER BY n DESC LIMIT 25`;
    await sql`UPDATE studies SET last_digest = now() WHERE id = ${s.id}`;
    if (!rows.length || !s.email_enc) continue;
    const lines = rows.map((r) => `- ${r.vernacular_name ?? r.scientific_name} (${r.scientific_name}), ${r.n} records in ${r.cell_lat}°, ${r.cell_lon}°: ${SITE}/species/${speciesSlug(r.scientific_name)}`);
    const ok = await sendMail("digest", decryptToken(s.email_enc), `${rows.length} new ${rows.length === 1 ? "arrival" : "arrivals"} in "${s.title}"`,
      `New this week in your study area "${s.title}", after at least ${ARRIVAL.ABSENT_WEEKS} watched weeks without them:\n\n${lines.join("\n")}\n\n` +
      `Dashboard: ${SITE}/studies/${s.id}\nTurn the weekly digest off on the dashboard.\n\nWildlife Network, ${SITE}`);
    if (!ok) break;
    sent++;
  }
  return sent;
}

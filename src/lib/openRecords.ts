import { sql } from "@/lib/db";
import { INCLUDED } from "@/lib/datasets";
import { SITE } from "@/lib/site";

/**
 * Weekly records that may be redistributed: GBIF records (CC0 / CC BY 4.0 only, see src/lib/gbif.ts) and records of live
 * contributed datasets under CC0 or CC BY 4.0. Never BirdWeather-derived counts (redistribution not agreed), never
 * CC BY-NC datasets (those have their own download on the dataset page, with the licence attached).
 * Per 5 degree cell and week, the same grid as the open data releases.
 */
export const OPEN_DATASET_LICENSES = ["CC0-1.0", "CC-BY-4.0"];
export const OPEN_LIMITS = { MAX_ROWS: 200_000, MAX_DAYS: 3 * 366, DEFAULT_DAYS: 365 };

export interface OpenQuery { species?: string; cell?: { lat: number; lon: number }; group?: string; from: string; to: string }
export interface OpenRow { week: string; cell_lat: number; cell_lon: number; scientific_name: string; vernacular_name: string | null; records: number; source: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GROUPS = ["avian", "bat", "amphibian", "insect", "mammal", "other"];

/** Read a query from URL parameters. Null when neither a species nor a point is given. */
export function parseOpenQuery(p: URLSearchParams): OpenQuery | null {
  const species = p.get("species")?.trim().slice(0, 120) || undefined;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  const cell = p.get("lat") && p.get("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
    ? { lat: Math.floor(lat / 5) * 5, lon: Math.floor(lon / 5) * 5 } : undefined;
  if (!species && !cell) return null;
  const today = new Date().toISOString().slice(0, 10);
  const day = (s: string | null, d: string) => (s && ISO.test(s) && !Number.isNaN(Date.parse(s)) ? s : d);
  let to = day(p.get("to"), today);
  let from = day(p.get("from"), new Date(Date.parse(to) - OPEN_LIMITS.DEFAULT_DAYS * 86400_000).toISOString().slice(0, 10));
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > OPEN_LIMITS.MAX_DAYS * 86400_000) from = new Date(Date.parse(to) - OPEN_LIMITS.MAX_DAYS * 86400_000).toISOString().slice(0, 10);
  const group = GROUPS.includes(p.get("group") ?? "") ? p.get("group")! : undefined;
  return { species, cell, group, from, to };
}

export async function openRows(q: OpenQuery): Promise<OpenRow[]> {
  const grp = () => (q.group ? sql`AND scientific_name IN (SELECT scientific_name FROM species_group WHERE grp = ${q.group})` : sql``);
  const gbif = sql`
    SELECT week::text AS week, cell_lat, cell_lon, scientific_name, vernacular_name, count::int AS records, 'gbif' AS source
    FROM species_weekly
    WHERE source_system = 'gbif' AND week >= date_trunc('week', ${q.from}::date)::date AND week <= ${q.to}::date
      ${q.species ? sql`AND scientific_name = ${q.species}` : sql``}
      ${q.cell ? sql`AND cell_lat = ${q.cell.lat} AND cell_lon = ${q.cell.lon}` : sql``} ${grp()}`;
  // Contributed datasets: counted from the records themselves so the licence of each dataset can be checked.
  const uploads = sql`
    SELECT date_trunc('week', r.ts)::date::text AS week, (FLOOR(r.lat / 5) * 5)::int AS cell_lat, (FLOOR(r.lon / 5) * 5)::int AS cell_lon,
           r.scientific_name, NULL::text AS vernacular_name, COUNT(*)::int AS records, 'dataset:' || d.id AS source
    FROM dataset_records r JOIN datasets d ON d.id = r.dataset_id
    WHERE d.status = 'live' AND d.license = ANY(${OPEN_DATASET_LICENSES}) AND r.verification = ANY(${INCLUDED})
      AND r.ts >= date_trunc('week', ${q.from}::date) AND r.ts < ${q.to}::date + 7
      ${q.species ? sql`AND r.scientific_name = ${q.species}` : sql``}
      ${q.cell ? sql`AND r.lat >= ${q.cell.lat} AND r.lat < ${q.cell.lat + 5} AND r.lon >= ${q.cell.lon} AND r.lon < ${q.cell.lon + 5}` : sql``}
      ${q.group ? sql`AND r.scientific_name IN (SELECT scientific_name FROM species_group WHERE grp = ${q.group})` : sql``}
    GROUP BY 1, 2, 3, 4, 7`;
  return sql<OpenRow[]>`
    SELECT * FROM (${gbif} UNION ALL ${uploads}) x
    ORDER BY week, cell_lat, cell_lon, scientific_name, source LIMIT ${OPEN_LIMITS.MAX_ROWS}`;
}

export async function openRecordsCsv(q: OpenQuery): Promise<string> {
  const rows = await openRows(q);
  const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const what = q.species ? `species ${q.species}` : `the 5 degree cell ${q.cell!.lat}, ${q.cell!.lon} (south-west corner)`;
  return [
    `# Wildlife Network open weekly records for ${what}, weeks ${q.from} to ${q.to}. GBIF records under CC0 or CC BY 4.0 (cite the datasets listed at ${SITE}/data) and contributed datasets under CC0 or CC BY 4.0 (source dataset:<id>, cite ${SITE}/datasets/<id>). BirdWeather detections are not included. Counts are records, not animals. Weeks start on Monday.`,
    "week,cell_lat,cell_lon,scientific_name,vernacular_name,records,source",
    ...rows.map((r) => [r.week, r.cell_lat, r.cell_lon, r.scientific_name, r.vernacular_name, r.records, r.source].map(esc).join(",")),
  ].join("\n");
}

/** Link to the open CSV for a species or a point, e.g. openRecordsHref({ species }) or openRecordsHref({ lat, lon, from, to }). */
export function openRecordsHref(o: { species?: string; lat?: number; lon?: number; from?: string; to?: string; group?: string }): string {
  const u = new URLSearchParams({ format: "csv" });
  for (const [k, v] of Object.entries(o)) if (v != null && v !== "" && v !== "all") u.set(k, String(v));
  return `/api/v1/records?${u}`;
}

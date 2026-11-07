import { sql } from "@/lib/db";
import { HIDDEN_DEPLOYMENT_SOURCES, PENDING_SOURCES, SOURCES } from "@/lib/sources";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { SITE } from "@/lib/site";
import { minAcousticWeek, minObservedWeek } from "@/lib/methods";

/**
 * Site reports: what stations around a point recorded between two dates, optionally against a second period
 * (before and after a restoration, or this year and last). Built for one honest question: is wildlife at this
 * place coming back or going away?
 *
 * Resolution: the rest of the site works in 5 degree cells (about 550 km). A site report works per station, from
 * station_weekly, which is only kept for sources whose history we may keep: devices that push WDX to Wildlife Network.
 * Pulled sources are listed (so the report says who else listens nearby) but their history is not stored here:
 * BirdWeather until BirdWeather agrees, GBIF, iNaturalist and OBIS because they keep their own history at source.
 */

/** Sources whose records are people's observations, counted against the observed coverage threshold. */
const OBSERVER_SOURCES = ["gbif", "inaturalist", "upload"];

/** Sources pulled from elsewhere. Everything else is a device pushing WDX to us, whose history we keep. */
export const PULLED_SOURCES = ["birdweather", "inaturalist", "gbif", ...Object.keys(SOURCES).filter((k) => !k.startsWith("_"))];

export const REPORT_LIMITS = { MAX_KM: 50, DEFAULT_KM: 10, MAX_DAYS: 3 * 366 };
export const REPORT_GROUPS = ["all", "avian", "bat", "amphibian", "insect"] as const;
/** Detections at or above this confidence count as high confidence (same threshold as the daily rollups). */
const HIGH_CONF = 0.85;

/** A station's position is close to exact, so sensitive taxa are counted in the totals but never named against a station. */
const nameable = (scientificName: string) => !isSensitiveTaxon([scientificName, scientificName.split(" ")[0]]);

/** Roll the current and previous week of our own devices' events into station_weekly. Called by the daily rollup. */
export async function refreshStationWeekly(): Promise<void> {
  await sql`
    INSERT INTO station_weekly (week, deployment_id, scientific_name, vernacular_name, count, high_conf_count)
    SELECT date_trunc('week', event_start)::date, deployment_id, scientific_name, MIN(vernacular_name),
           COUNT(*), COUNT(*) FILTER (WHERE confidence >= ${HIGH_CONF})
    FROM events
    WHERE event_start >= date_trunc('week', now()) - interval '7 days'
      AND scientific_name IS NOT NULL AND review_status <> 'rejected'
      AND source_system <> ALL(${PULLED_SOURCES}) AND source_system <> ALL(${PENDING_SOURCES})
    GROUP BY 1, 2, 3
    ON CONFLICT (week, deployment_id, scientific_name) DO UPDATE SET
      count = EXCLUDED.count, high_conf_count = EXCLUDED.high_conf_count, vernacular_name = EXCLUDED.vernacular_name`;
}

export interface Period { from: string; to: string }
/** name: optional title for a named place, such as a protected area (plain text, shown escaped). */
export interface ReportQuery { lat: number; lon: number; km: number; group: string; a: Period; b?: Period; name?: string }

export interface SpeciesRow { scientific_name: string; vernacular_name: string | null; n: number; high: number; stations: number; per1000: number }
export interface PeriodSummary {
  period: Period; detections: number; species: number; stationWeeks: number;
  /** watched (area mode only): the cell-week reached the coverage threshold of the class, by recordings or by observers. */
  weeks: { week: string; detections: number; species: number; stations: number; watched?: boolean }[];
  top: SpeciesRow[];
}
export interface SiteReport {
  q: ReportQuery;
  stations: { id: string; name: string | null; source_system: string; sensor_type: string; km: number; kept: boolean; last_seen: string }[];
  a: PeriodSummary;
  b: PeriodSummary | null;
  /** Species recorded in only one of the two periods (when there are two). */
  onlyA: SpeciesRow[]; onlyB: SpeciesRow[];
  /** Week that history is available from: for the kept stations, or for the grid cell in area mode. */
  historyFrom: string | null;
  /** "stations": our own stations nearby. "area": none nearby, so the 5 degree grid cell around the point is used instead. */
  mode: "stations" | "area";
  /** South-west corner of the grid cell used in area mode. */
  cell: { lat: number; lon: number } | null;
  /** Area mode: the sources used. With two periods, only those with records in both. */
  sources: string[];
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string | undefined, fallback: string) => (s && ISO.test(s) && !Number.isNaN(Date.parse(s)) ? s : fallback);
const shift = (iso: string, days: number) => new Date(Date.parse(iso) + days * 86400_000).toISOString().slice(0, 10);

/** Read and clamp a report query from URL parameters. Null when the point is missing or invalid. */
export function parseReportQuery(p: Record<string, string | undefined>): ReportQuery | null {
  const lat = Number(p.lat), lon = Number(p.lon);
  if (!p.lat || !p.lon || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const km = Math.min(REPORT_LIMITS.MAX_KM, Math.max(1, Number(p.km) || REPORT_LIMITS.DEFAULT_KM));
  const group = (REPORT_GROUPS as readonly string[]).includes(p.group ?? "") ? p.group! : "all";
  const today = new Date().toISOString().slice(0, 10);
  const period = (f?: string, t?: string, df?: string, dt?: string): Period => {
    let to = day(t, dt ?? today), from = day(f, df ?? shift(to, -84));
    if (from > to) [from, to] = [to, from];
    if (Date.parse(to) - Date.parse(from) > REPORT_LIMITS.MAX_DAYS * 86400_000) from = shift(to, -REPORT_LIMITS.MAX_DAYS);
    return { from, to };
  };
  const a = period(p.from, p.to);
  const b = p.from2 || p.to2 ? period(p.from2, p.to2, shift(a.from, -364), shift(a.to, -364)) : undefined;
  // Control characters out, whitespace collapsed; React escapes the rest when it is shown.
  const name = (p.name ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || undefined;
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, km, group, a, b, name };
}

async function summarise(ids: string[], group: string, p: Period): Promise<PeriodSummary> {
  const grp = group === "all" ? sql`` : sql`AND g.grp = ${group}`;
  // Weeks are labelled by their Monday; a week counts if any of it falls inside the period.
  const rows = sql`
    SELECT w.* FROM station_weekly w LEFT JOIN species_group g USING (scientific_name)
    WHERE w.deployment_id = ANY(${ids}) AND w.week >= date_trunc('week', ${p.from}::date)::date AND w.week <= ${p.to}::date ${grp}`;
  const [weeks, top] = await Promise.all([
    sql<{ week: string; detections: number; species: number; stations: number }[]>`
      SELECT week::text AS week, SUM(count)::int AS detections, COUNT(DISTINCT scientific_name)::int AS species,
             COUNT(DISTINCT deployment_id)::int AS stations
      FROM (${rows}) r GROUP BY week ORDER BY week`,
    sql<SpeciesRow[]>`
      WITH r AS (${rows}), t AS (SELECT SUM(count)::float AS d FROM r)
      SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, SUM(count)::int AS n, SUM(high_conf_count)::int AS high,
             COUNT(DISTINCT deployment_id)::int AS stations,
             CASE WHEN t.d > 0 THEN 1000.0 * SUM(count) / t.d ELSE 0 END::float AS per1000
      FROM r, t GROUP BY scientific_name, t.d ORDER BY n DESC`,
  ]);
  return {
    period: p, weeks, top: top.filter((x) => nameable(x.scientific_name)),
    detections: weeks.reduce((s, w) => s + w.detections, 0),
    species: top.length, // includes sensitive taxa, which are not listed
    stationWeeks: weeks.reduce((s, w) => s + w.stations, 0),
  };
}

/**
 * Area mode: the weekly counts per 5 degree cell that the map, species pages and study areas already show (BirdWeather
 * detections and GBIF records). Shown only, never exported, because BirdWeather-derived counts may not be redistributed.
 */
async function summariseCell(cell: { lat: number; lon: number }, group: string, p: Period, sources: string[]): Promise<PeriodSummary> {
  const grp = group === "all" ? sql`` : sql`AND g.grp = ${group}`;
  const rows = sql`
    SELECT w.week, w.scientific_name, w.vernacular_name, w.count, COALESCE(w.high_conf_count, 0) AS high_conf_count
    FROM species_weekly w LEFT JOIN species_group g USING (scientific_name)
    WHERE w.cell_lat = ${cell.lat} AND w.cell_lon = ${cell.lon} AND COALESCE(g.is_species, true) AND w.source_system = ANY(${sources})
      AND w.week >= date_trunc('week', ${p.from}::date)::date AND w.week <= ${p.to}::date ${grp}`;
  const [weeks, top] = await Promise.all([
    sql<{ week: string; detections: number; species: number; stations: number }[]>`
      SELECT week::text AS week, SUM(count)::bigint::float8 AS detections, COUNT(DISTINCT scientific_name)::int AS species, 1 AS stations
      FROM (${rows}) r GROUP BY week ORDER BY week`,
    sql<SpeciesRow[]>`
      WITH r AS (${rows}), t AS (SELECT SUM(count)::float AS d FROM r)
      SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, SUM(count)::bigint::float8 AS n, SUM(high_conf_count)::bigint::float8 AS high,
             1 AS stations,
             CASE WHEN t.d > 0 THEN 1000.0 * SUM(count) / t.d ELSE 0 END::float AS per1000
      FROM r, t GROUP BY scientific_name, t.d ORDER BY n DESC`,
  ]);
  // Watched weeks, with the coverage rule (/methods#coverage): recordings at the acoustic minimum or observers' records at the
  // observed minimum of the class, counted over the same sources. "All" uses the bird thresholds, as the coverage map does.
  const g = group === "all" ? "avian" : group;
  const effort = await sql<{ week: string; acoustic: number; observed: number }[]>`
    SELECT week::text AS week,
           COALESCE(SUM(detections) FILTER (WHERE source_system <> ALL(${OBSERVER_SOURCES})), 0)::float AS acoustic,
           COALESCE(SUM(detections) FILTER (WHERE source_system = ANY(${OBSERVER_SOURCES})), 0)::float AS observed
    FROM effort_weekly_source
    WHERE cell_lat = ${cell.lat} AND cell_lon = ${cell.lon} AND grp = ${g} AND source_system = ANY(${sources})
      AND week >= date_trunc('week', ${p.from}::date)::date AND week <= ${p.to}::date
    GROUP BY week`;
  const watched = new Set(effort.filter((e) => e.acoustic >= minAcousticWeek(g) || e.observed >= minObservedWeek(g)).map((e) => e.week));
  return {
    period: p, weeks: weeks.map((w) => ({ ...w, watched: watched.has(w.week) })), top: top.filter((x) => nameable(x.scientific_name)),
    detections: weeks.reduce((s, w) => s + Number(w.detections), 0),
    species: top.length,
    stationWeeks: weeks.length,
  };
}

/** openOnly (the public API): area mode leaves out BirdWeather-derived counts, which may be shown on the site but not handed out as data. */
export async function siteReport(q: ReportQuery, opts: { openOnly?: boolean } = {}): Promise<SiteReport> {
  const stations = await sql<SiteReport["stations"]>`
    SELECT d.id, d.name, d.source_system, d.sensor_type, d.last_seen::text AS last_seen,
           round((ST_Distance(d.geom, ST_SetSRID(ST_MakePoint(${q.lon}, ${q.lat}), 4326)::geography) / 1000)::numeric, 1)::float AS km,
           d.source_system <> ALL(${PULLED_SOURCES}) AND d.source_system <> ALL(${PENDING_SOURCES}) AS kept
    FROM deployments d
    WHERE ST_DWithin(d.geom, ST_SetSRID(ST_MakePoint(${q.lon}, ${q.lat}), 4326)::geography, ${q.km * 1000})
      AND d.source_system <> ALL(${HIDDEN_DEPLOYMENT_SOURCES})
    ORDER BY km LIMIT 500`;
  const ids = stations.filter((s) => s.kept).map((s) => s.id);
  // Other sources' stations are only counted per source: no id, name, distance or date (BirdWeather's conditions, see CLAUDE.md).
  const listed = stations.map((s) => (s.kept ? s : { ...s, id: "", name: null, km: 0, last_seen: "" }));
  const cell = ids.length ? null : { lat: Math.floor(q.lat / 5) * 5, lon: Math.floor(q.lon / 5) * 5 };
  // Two periods are compared on the sources that have records in both. BirdWeather's weekly counts start in November 2025,
  // so a comparison with an earlier period would otherwise call every species it hears "only in period A".
  const inPeriod = async (p: Period) => cell ? (await sql<{ s: string }[]>`
    SELECT DISTINCT source_system AS s FROM species_weekly
    WHERE week >= date_trunc('week', ${p.from}::date)::date AND week <= ${p.to}::date AND cell_lat = ${cell.lat} AND cell_lon = ${cell.lon}`).map((r) => r.s) : [];
  const [srcA, srcB] = await Promise.all([inPeriod(q.a), q.b ? inPeriod(q.b) : Promise.resolve(null)]);
  const sources = (srcB ? srcA.filter((s) => srcB.includes(s)) : srcA).filter((s) => !opts.openOnly || s !== "birdweather");
  const sum = (p: Period) => (cell ? summariseCell(cell, q.group, p, sources) : summarise(ids, q.group, p));
  const [a, b, first] = await Promise.all([
    sum(q.a),
    q.b ? sum(q.b) : Promise.resolve(null),
    cell
      ? sql<{ w: string | null }[]>`SELECT MIN(week)::text AS w FROM effort_weekly WHERE cell_lat = ${cell.lat} AND cell_lon = ${cell.lon} AND detections > 0`
      : sql<{ w: string | null }[]>`SELECT MIN(week)::text AS w FROM station_weekly WHERE deployment_id = ANY(${ids})`,
  ]);
  const inB = new Set(b?.top.map((x) => x.scientific_name));
  const inA = new Set(a.top.map((x) => x.scientific_name));
  return {
    q, stations: listed, a, b,
    onlyA: b ? a.top.filter((x) => !inB.has(x.scientific_name)) : [],
    onlyB: b ? b.top.filter((x) => !inA.has(x.scientific_name)) : [],
    historyFrom: first[0]?.w ?? null,
    mode: cell ? "area" : "stations",
    cell,
    sources: cell ? sources : [],
  };
}

/** Link to a report with the same query (for sharing and the CSV download). */
export function reportHref(q: ReportQuery, extra = ""): string {
  const u = new URLSearchParams({ lat: String(q.lat), lon: String(q.lon), km: String(q.km), from: q.a.from, to: q.a.to });
  if (q.group !== "all") u.set("group", q.group);
  if (q.b) { u.set("from2", q.b.from); u.set("to2", q.b.to); }
  if (q.name) u.set("name", q.name);
  return `?${u}${extra}`;
}

/** Weekly rows per station and species for the kept stations, as CSV. Every row is from a device that publishes to Wildlife Network. */
export async function siteReportCsv(q: ReportQuery): Promise<string> {
  const r = await siteReport(q);
  const ids = r.stations.filter((s) => s.kept).map((s) => s.id);
  const periods = [r.a.period, ...(r.b ? [r.b.period] : [])];
  const grp = q.group === "all" ? sql`` : sql`AND g.grp = ${q.group}`;
  const rows = ids.length ? await sql<{ week: string; deployment_id: string; scientific_name: string; vernacular_name: string | null; count: number; high_conf_count: number }[]>`
    SELECT w.week::text AS week, w.deployment_id, w.scientific_name, w.vernacular_name, w.count, w.high_conf_count
    FROM station_weekly w LEFT JOIN species_group g USING (scientific_name)
    WHERE w.deployment_id = ANY(${ids}) ${grp}
      AND (${periods.map((p) => sql`(w.week >= date_trunc('week', ${p.from}::date)::date AND w.week <= ${p.to}::date)`).reduce((x, y) => sql`${x} OR ${y}`)})
    ORDER BY w.week, w.deployment_id, w.scientific_name LIMIT 200000` : [];
  const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [
    `# Wildlife Network site report ${SITE}/report${reportHref(q)}. Stations within ${q.km} km of ${q.lat}, ${q.lon} that publish to Wildlife Network. Weeks start on Monday. Cite: Wildlife Network (wlnw.org) and the station owners.`,
    "week,station,scientific_name,vernacular_name,detections,high_confidence",
    ...rows.filter((x) => nameable(x.scientific_name)).map((x) => [x.week, x.deployment_id, x.scientific_name, x.vernacular_name, x.count, x.high_conf_count].map(esc).join(",")),
  ].join("\n");
}

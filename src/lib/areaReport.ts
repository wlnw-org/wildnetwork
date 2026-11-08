import { randomBytes } from "node:crypto";
import { sql } from "@/lib/db";
import { baseParams, gbifJson, resolveTaxa, taxon } from "@/lib/gbif";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { HIDDEN_DEPLOYMENT_SOURCES, PENDING_SOURCES } from "@/lib/sources";
import { PULLED_SOURCES } from "@/lib/siteReport";
import { SITE } from "@/lib/site";

/**
 * Area reports for officials and planners: a district, protected area or any boundary, with what was recorded inside it.
 * Only data that is precise enough for a district is used:
 *  - stations that publish to Wildlife Network inside the boundary (exact positions, our own weekly counts);
 *  - GBIF records inside the boundary, CC0 or CC BY 4.0 only, counted live by GBIF itself (nothing stored here);
 *  - the regional arrival date of each species from the 5 degree cell around the area's centre, clearly marked as regional.
 * BirdWeather stations are only counted, never named or placed (their conditions, see src/lib/sources.ts).
 */

export const AREA_LIMITS = { MAX_VERTICES: 400, MAX_KM2: 200_000, PER_DAY: 30, MAX_DAYS: 5 * 366, GBIF_SPECIES: 1000, RESOLVE: 1000, GBIF_WKT: 2500 };
export const AREA_GROUPS: Record<string, number[]> = { all: [212, 734, 131, 216], avian: [212], bat: [734], amphibian: [131], insect: [216] };
const UA = "WildlifeNetwork/0.1 (+https://wlnw.org)";
const NOMINATIM = "https://nominatim.openstreetmap.org";

export interface AreaRow { id: string; name: string; source: string; osm_ref: string | null; km2: number; lat: number; lon: number; bbox: [number, number, number, number]; geojson: GeoJSON.MultiPolygon }
export interface AreaHit { name: string; type: string; osm: string; lat: number; lon: number }

const newId = () => randomBytes(6).toString("base64url");

/** Search OpenStreetMap (Nominatim) for named areas with a boundary: districts, protected areas, parks, towns. */
export async function searchAreas(q: string): Promise<AreaHit[]> {
  const u = new URLSearchParams({ q, format: "jsonv2", limit: "8", polygon_geojson: "0", addressdetails: "0" });
  const res = await fetch(`${NOMINATIM}/search?${u}`, { headers: { "user-agent": UA, "accept-language": "en" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const rows = (await res.json()) as { osm_type: string; osm_id: number; display_name: string; type: string; category?: string; class?: string; lat: string; lon: string }[];
  // Only relations and closed ways have an area; nodes are points.
  return rows.filter((r) => r.osm_type === "relation" || r.osm_type === "way").map((r) => ({
    name: r.display_name, type: [r.category ?? r.class, r.type].filter(Boolean).join(" "), osm: `${r.osm_type === "relation" ? "R" : "W"}${r.osm_id}`,
    lat: Number(r.lat), lon: Number(r.lon),
  }));
}

/** Simplify, validate and store an area. Returns its id. */
async function storeArea(name: string, source: string, geojson: unknown, osmRef: string | null, ipHash: string | null): Promise<string> {
  const g = JSON.stringify(geojson);
  const [chk] = await sql<{ ok: boolean; km2: number; n: number }[]>`
    WITH g AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${g}), 4326)) AS geom)
    SELECT GeometryType(ST_CollectionExtract(geom, 3)) IN ('POLYGON', 'MULTIPOLYGON') AS ok,
           ST_Area(geom::geography) / 1e6 AS km2, ST_NPoints(geom) AS n FROM g`;
  if (!chk?.ok) throw new Error("That boundary is not a polygon.");
  if (chk.km2 > AREA_LIMITS.MAX_KM2) throw new Error(`That area is ${Math.round(chk.km2).toLocaleString("en")} km². Reports work for areas up to ${AREA_LIMITS.MAX_KM2.toLocaleString("en")} km², such as a district or a protected area.`);
  if (chk.km2 < 0.01) throw new Error("That area is too small.");
  const id = newId();
  // Simplify until it fits the vertex budget (GBIF takes the polygon in a URL), then force the counter-clockwise outer rings GBIF expects.
  await sql`
    WITH g AS (SELECT ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${g}), 4326)), 3) AS geom),
    s AS (SELECT COALESCE(
      (SELECT x FROM (SELECT ST_SimplifyPreserveTopology(geom, t) AS x, t FROM g, unnest(ARRAY[0, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05]) AS t) q
       WHERE ST_NPoints(x) <= ${AREA_LIMITS.MAX_VERTICES} AND NOT ST_IsEmpty(x) ORDER BY t LIMIT 1),
      (SELECT ST_ConvexHull(geom) FROM g)) AS geom)
    INSERT INTO report_areas (id, name, source, osm_ref, geom, created_ip_hash)
    SELECT ${id}, ${name.slice(0, 120)}, ${source}, ${osmRef}, ST_Multi(ST_ForcePolygonCCW(ST_MakeValid(geom))), ${ipHash} FROM s`;
  return id;
}

/** How many areas this network created in the last day (drawn or uploaded areas only; OSM areas are shared). */
export async function areasToday(ipHash: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM report_areas WHERE created_ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  return r.n;
}

/** An OpenStreetMap area by reference (R123 or W123): stored once, then shared by everyone who picks it. */
export async function areaFromOsm(ref: string, ipHash: string | null): Promise<string> {
  if (!/^[RW]\d{1,12}$/.test(ref)) throw new Error("Unknown area.");
  const [have] = await sql<{ id: string }[]>`SELECT id FROM report_areas WHERE osm_ref = ${ref}`;
  if (have) return have.id;
  const u = new URLSearchParams({ osm_ids: ref, format: "jsonv2", polygon_geojson: "1", polygon_threshold: "0.0005" });
  const res = await fetch(`${NOMINATIM}/lookup?${u}`, { headers: { "user-agent": UA, "accept-language": "en" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`OpenStreetMap lookup failed (${res.status}).`);
  const [r] = (await res.json()) as { display_name: string; name?: string; geojson?: { type: string } }[];
  if (!r?.geojson || !/Polygon/.test(r.geojson.type)) throw new Error("That place has no boundary in OpenStreetMap. Draw it or upload a KML instead.");
  return storeArea(r.name || r.display_name.split(",")[0], "osm", r.geojson, ref, ipHash);
}

/** A drawn or uploaded boundary (GeoJSON geometry, Feature or FeatureCollection; uploads are parsed in the browser). */
export async function areaFromGeoJson(name: string, geo: unknown, source: "drawn" | "upload", ipHash: string | null): Promise<string> {
  const geoms: unknown[] = [];
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    const o = x as { type?: string; features?: unknown[]; geometry?: unknown; geometries?: unknown[] };
    if (o.type === "FeatureCollection") o.features?.forEach(walk);
    else if (o.type === "Feature") walk(o.geometry);
    else if (o.type === "GeometryCollection") o.geometries?.forEach(walk);
    else if (o.type === "Polygon" || o.type === "MultiPolygon") geoms.push(o);
  };
  walk(geo);
  if (!geoms.length) throw new Error("No polygon found. Upload a KML or GeoJSON file with an area boundary.");
  const collection = { type: "GeometryCollection", geometries: geoms };
  return storeArea(name.trim() || "Custom area", source, collection, null, ipHash);
}

export async function getArea(id: string): Promise<AreaRow | null> {
  if (!/^[A-Za-z0-9_-]{4,16}$/.test(id)) return null;
  const [r] = await sql<(Omit<AreaRow, "geojson" | "bbox"> & { geojson: string; bbox: string })[]>`
    SELECT id, name, source, osm_ref, (ST_Area(geom::geography) / 1e6)::float AS km2,
           ST_Y(ST_PointOnSurface(geom))::float AS lat, ST_X(ST_PointOnSurface(geom))::float AS lon,
           ST_AsGeoJSON(geom, 5) AS geojson,
           concat_ws(',', ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom)) AS bbox
    FROM report_areas WHERE id = ${id}`;
  if (!r) return null;
  return { ...r, geojson: JSON.parse(r.geojson), bbox: r.bbox.split(",").map(Number) as AreaRow["bbox"] };
}

export interface AreaPeriod { from: string; to: string }
export interface ChecklistRow { scientificName: string; vernacularName: string | null; group: string; gbif: number; acoustic: number; stations: number; arrival: { week: string; low: string | null; high: string | null } | null }
export interface AreaReport {
  area: AreaRow; period: AreaPeriod; group: string; generatedAt: string;
  stations: { id: string; name: string | null; source: string; sensor: string; lat: number; lon: number; lastSeen: string }[];
  otherStations: { source: string; n: number }[];
  checklist: ChecklistRow[];
  sensitiveHidden: number;
  /** GBIF species whose name could not be looked up this time (counted, listed on a later report). */
  unnamed: number;
  gbif: { records: number; species: number; datasets: { key: string; title: string; n: number }[]; truncated: boolean; error: string | null };
  acoustic: { detections: number; species: number };
  regionCell: { lat: number; lon: number };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function parsePeriod(from?: string, to?: string): AreaPeriod {
  const today = new Date().toISOString().slice(0, 10);
  let t = to && ISO.test(to) ? to : today;
  let f = from && ISO.test(from) ? from : new Date(Date.parse(t) - 365 * 86400_000).toISOString().slice(0, 10);
  if (f > t) [f, t] = [t, f];
  if (Date.parse(t) - Date.parse(f) > AREA_LIMITS.MAX_DAYS * 86400_000) f = new Date(Date.parse(t) - AREA_LIMITS.MAX_DAYS * 86400_000).toISOString().slice(0, 10);
  return { from: f, to: t };
}

const nameable = (s: string) => !isSensitiveTaxon([s, s.split(" ")[0]]);

export async function areaReport(area: AreaRow, period: AreaPeriod, group: string): Promise<AreaReport> {
  const keys = AREA_GROUPS[group] ?? AREA_GROUPS.all;
  // GBIF takes the polygon in the URL (about 8 KB at most), so the query uses a further simplified copy of the boundary.
  const [wkt] = await sql<{ w: string }[]>`
    SELECT w FROM (
      SELECT ST_AsText(ST_Multi(ST_ForcePolygonCCW(ST_MakeValid(ST_SimplifyPreserveTopology(geom, t)))), 4) AS w, t
      FROM report_areas, unnest(ARRAY[0, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2]) AS t WHERE id = ${area.id}) q
    WHERE length(w) <= ${AREA_LIMITS.GBIF_WKT} ORDER BY t LIMIT 1`;
  const gbifWkt = wkt?.w ?? (await sql<{ w: string }[]>`SELECT ST_AsText(ST_ForcePolygonCCW(ST_Envelope(geom)), 4) AS w FROM report_areas WHERE id = ${area.id}`)[0].w;
  const regionCell = { lat: Math.floor(area.lat / 5) * 5, lon: Math.floor(area.lon / 5) * 5 };

  // Stations inside the boundary. Our own (kept) stations are listed; other sources only counted.
  const inside = await sql<{ id: string; name: string | null; source_system: string; sensor_type: string; lat: number; lon: number; last_seen: string; kept: boolean }[]>`
    SELECT d.id, d.name, d.source_system, d.sensor_type, d.latitude::float AS lat, d.longitude::float AS lon, d.last_seen::text AS last_seen,
           d.source_system <> ALL(${PULLED_SOURCES}) AND d.source_system <> ALL(${PENDING_SOURCES}) AS kept
    FROM deployments d, report_areas a
    WHERE a.id = ${area.id} AND ST_Covers(a.geom::geography, d.geom) AND d.source_system <> ALL(${HIDDEN_DEPLOYMENT_SOURCES})
      AND d.source_system NOT IN ('gbif', 'inaturalist', 'obis')
    LIMIT 2000`;
  const kept = inside.filter((s) => s.kept);
  const other = new Map<string, number>();
  for (const s of inside.filter((x) => !x.kept)) other.set(s.source_system, (other.get(s.source_system) ?? 0) + 1);

  const grp = group === "all" ? sql`` : sql`AND g.grp = ${group}`;
  const acousticRows = kept.length ? await sql<{ scientific_name: string; vernacular_name: string | null; grp: string | null; n: number; stations: number }[]>`
    SELECT w.scientific_name, MIN(w.vernacular_name) AS vernacular_name, MIN(g.grp) AS grp, SUM(w.count)::int AS n, COUNT(DISTINCT w.deployment_id)::int AS stations
    FROM station_weekly w LEFT JOIN species_group g USING (scientific_name)
    WHERE w.deployment_id = ANY(${kept.map((s) => s.id)}) AND w.week >= date_trunc('week', ${period.from}::date)::date AND w.week <= ${period.to}::date ${grp}
    GROUP BY 1` : [];

  // GBIF: species and datasets inside the polygon, counted by GBIF. Licences CC0 and CC BY 4.0 only.
  let gbifSpecies: { key: number; n: number }[] = [], datasets: { key: string; n: number }[] = [], records = 0, gbifError: string | null = null;
  try {
    const p = baseParams();
    p.set("geometry", gbifWkt);
    p.set("eventDate", `${period.from},${period.to}`);
    for (const k of keys) p.append("taxonKey", String(k));
    p.set("limit", "0");
    p.append("facet", "speciesKey"); p.append("facet", "datasetKey");
    p.set("speciesKey.facetLimit", String(AREA_LIMITS.GBIF_SPECIES)); p.set("datasetKey.facetLimit", "30");
    const j = await gbifJson<{ count: number; facets: { field: string; counts: { name: string; count: number }[] }[] }>("/occurrence/search", p, 2);
    records = j.count;
    gbifSpecies = (j.facets.find((f) => f.field === "SPECIES_KEY")?.counts ?? []).map((c) => ({ key: Number(c.name), n: c.count }));
    datasets = (j.facets.find((f) => f.field === "DATASET_KEY")?.counts ?? []).map((c) => ({ key: c.name, n: c.count }));
  } catch (e) { gbifError = e instanceof Error ? e.message : String(e); }
  // Names: cached in gbif_taxa; new ones are looked up from GBIF in small batches (two requests each), so a first report can take a while.
  const keysToName = gbifSpecies.slice(0, AREA_LIMITS.RESOLVE).map((s) => s.key);
  for (let i = 0; i < keysToName.length; i += 25) await resolveTaxa(keysToName.slice(i, i + 25));
  const titles = datasets.length ? await sql<{ dataset_key: string; title: string }[]>`SELECT dataset_key, title FROM gbif_datasets WHERE dataset_key IN ${sql(datasets.map((d) => d.key))}`.catch(() => []) : [];
  const titleOf = new Map(titles.map((t) => [t.dataset_key, t.title]));
  await Promise.all(datasets.slice(0, 10).filter((d) => !titleOf.has(d.key)).map((d) =>
    gbifJson<{ title: string }>(`/dataset/${d.key}`, new URLSearchParams(), 1).then((x) => titleOf.set(d.key, x.title)).catch(() => {})));

  // Merge both sources by scientific name.
  const rows = new Map<string, ChecklistRow>();
  for (const s of gbifSpecies) {
    const t = taxon(s.key);
    if (!t) continue;
    rows.set(t.scientific_name, { scientificName: t.scientific_name, vernacularName: t.vernacular_name, group: t.grp, gbif: s.n, acoustic: 0, stations: 0, arrival: null });
  }
  for (const a of acousticRows) {
    const r = rows.get(a.scientific_name) ?? { scientificName: a.scientific_name, vernacularName: a.vernacular_name, group: a.grp ?? "other", gbif: 0, acoustic: 0, stations: 0, arrival: null };
    r.acoustic = a.n; r.stations = a.stations; r.vernacularName ??= a.vernacular_name;
    rows.set(a.scientific_name, r);
  }
  // Regional arrival dates (5 degree cell around the area), only where the estimate is well supported.
  const names = [...rows.keys()];
  const arrivals = names.length ? await sql<{ scientific_name: string; week: string; low: string | null; high: string | null }[]>`
    SELECT scientific_name, arrival_week::text AS week, arrival_low::text AS low, arrival_high::text AS high FROM phenology
    WHERE cell_lat = ${regionCell.lat} AND cell_lon = ${regionCell.lon} AND scientific_name IN ${sql(names)} AND COALESCE(arrival_support, 0) >= 0.5` : [];
  for (const a of arrivals) { const r = rows.get(a.scientific_name); if (r) r.arrival = { week: a.week, low: a.low, high: a.high }; }

  const all = [...rows.values()];
  const listed = all.filter((r) => nameable(r.scientificName)).sort((a, b) => (b.gbif + b.acoustic) - (a.gbif + a.acoustic));
  return {
    area, period, group, generatedAt: new Date().toISOString(),
    stations: kept.map((s) => ({ id: s.id, name: s.name, source: s.source_system, sensor: s.sensor_type, lat: s.lat, lon: s.lon, lastSeen: s.last_seen })),
    otherStations: [...other.entries()].map(([source, n]) => ({ source, n })),
    checklist: listed,
    sensitiveHidden: all.length - listed.length,
    unnamed: gbifSpecies.filter((x) => !taxon(x.key)).length,
    gbif: {
      records, species: gbifSpecies.length, truncated: gbifSpecies.length >= AREA_LIMITS.GBIF_SPECIES, error: gbifError,
      datasets: datasets.map((d) => ({ key: d.key, title: titleOf.get(d.key) ?? d.key, n: d.n })),
    },
    acoustic: { detections: acousticRows.reduce((s, r) => s + r.n, 0), species: acousticRows.length },
    regionCell,
  };
}

export const areaReportHref = (id: string, p: AreaPeriod, group: string, extra: Record<string, string> = {}) => {
  const u = new URLSearchParams({ from: p.from, to: p.to, ...(group !== "all" ? { group } : {}), ...extra });
  return `/report/area/${id}?${u}`;
};

const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);

/** Checklist as CSV: GBIF counts (CC0 / CC BY 4.0) and our stations' detections. */
export function areaReportCsv(r: AreaReport): string {
  return [
    `# Wildlife Network area report: ${r.area.name}, ${r.period.from} to ${r.period.to}. ${SITE}${areaReportHref(r.area.id, r.period, r.group)}`,
    `# GBIF records under CC0 or CC BY 4.0 (cite the datasets listed in the report) and detections from stations that publish to Wildlife Network. Boundary: ${r.area.source === "osm" ? "OpenStreetMap contributors (ODbL)" : "supplied by the user"}.`,
    "scientific_name,vernacular_name,class,gbif_records,station_detections,stations,regional_arrival_week,arrival_low,arrival_high",
    ...r.checklist.map((x) => [x.scientificName, x.vernacularName, x.group, x.gbif, x.acoustic, x.stations, x.arrival?.week, x.arrival?.low, x.arrival?.high].map(esc).join(",")),
  ].join("\n");
}

/** Boundary and our stations as GeoJSON or KML, for QGIS, ArcGIS and Google Earth. */
export function areaGeo(r: AreaReport, format: "geojson" | "kml"): string {
  const stations = r.stations.map((s) => ({ type: "Feature", properties: { kind: "station", id: s.id, name: s.name ?? s.id, source: s.source, sensor: s.sensor }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } }));
  const boundary = { type: "Feature", properties: { kind: "boundary", name: r.area.name, km2: Math.round(r.area.km2), species: r.checklist.length, report: `${SITE}${areaReportHref(r.area.id, r.period, r.group)}` }, geometry: r.area.geojson };
  if (format === "geojson") return JSON.stringify({ type: "FeatureCollection", features: [boundary, ...stations] });
  const ring = (c: number[][]) => c.map((p) => `${p[0]},${p[1]}`).join(" ");
  const polys = r.area.geojson.coordinates.map((poly) => `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ring(poly[0])}</coordinates></LinearRing></outerBoundaryIs>${poly.slice(1).map((h) => `<innerBoundaryIs><LinearRing><coordinates>${ring(h)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}</Polygon>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xml(r.area.name)}</name>
<Placemark><name>${xml(r.area.name)}</name><description>${xml(`${r.checklist.length} species, ${r.period.from} to ${r.period.to}. ${SITE}${areaReportHref(r.area.id, r.period, r.group)}`)}</description><MultiGeometry>${polys}</MultiGeometry></Placemark>
${r.stations.map((s) => `<Placemark><name>${xml(s.name ?? s.id)}</name><description>${xml(`${s.source} ${s.sensor}`)}</description><Point><coordinates>${s.lon},${s.lat}</coordinates></Point></Placemark>`).join("\n")}
</Document></kml>`;
}


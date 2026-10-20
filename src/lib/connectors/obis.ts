import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { SOURCES, type ObisConfig } from "@/lib/sources";
import type { TaxonRank, WdxEvent } from "@/lib/wdx/types";
import { roundTo } from "./acartia";
import { getJson } from "./orcasound";
import type { PullConnector } from "./types";

/**
 * OBIS (obis.org), the Ocean Biodiversity Information System: the main open global marine dataset.
 * Paged with `after` (records come in id order, which is random, so a capped walk is an even sample of the window).
 * Regions and caps in src/config/sources.json: the India box first, then a global sample, and never more than maxRows
 * OBIS rows in the database (prune() enforces the same cap). A walk restarts each day, so new India records arrive daily.
 * Licences per record: CC0 and CC BY kept, CC BY-NC kept (map, and only the noncommercial/ part of exports), others skipped.
 */
export const API = "https://api.obis.org/v3/occurrence";
const FIELDS = "id,occurrenceID,scientificName,eventDate,date_start,date_mid,date_end,decimalLatitude,decimalLongitude,basisOfRecord,license,dataset_id,datasetName,institutionCode,taxonRank,individualCount,coordinateUncertaintyInMeters,genus,family,order,class,absence,dropped";

export interface ObisRecord {
  id?: string; occurrenceID?: string; scientificName?: string; eventDate?: string; date_start?: number; date_mid?: number; date_end?: number;
  decimalLatitude?: number; decimalLongitude?: number; basisOfRecord?: string; license?: string; dataset_id?: string; datasetName?: string;
  institutionCode?: string; taxonRank?: string; individualCount?: number | string; coordinateUncertaintyInMeters?: number | string;
  genus?: string; family?: string; order?: string; class?: string; absence?: boolean; dropped?: boolean;
}

/** CC0 and CC BY go into the main data, CC BY-NC is shown but exported only as noncommercial; anything else is skipped. */
export function licenceClass(url: string | undefined): "cc0" | "cc-by" | "cc-by-nc" | null {
  const u = (url ?? "").toLowerCase().trim();
  if (/publicdomain\/zero|\bcc0\b|cc-zero/.test(u)) return "cc0";
  if (/licenses\/by-nc\/\d|\bcc[- ]by[- ]nc(?:[- ]\d|$)/.test(u)) return "cc-by-nc";
  if (/licenses\/by\/\d|^cc[- ]by(?:[- ]\d(?:\.\d)?)?$/.test(u)) return "cc-by";
  return null;
}
const LICENCE_URL = { "cc0": "https://creativecommons.org/publicdomain/zero/1.0/", "cc-by": "https://creativecommons.org/licenses/by/4.0/", "cc-by-nc": "https://creativecommons.org/licenses/by-nc/4.0/" };

const RANKS: Record<string, TaxonRank> = { species: "species", genus: "genus", family: "family", order: "order", class: "class" };
const MAX_UNCERTAINTY_FOR = (step: number) => Math.round((step / 2) * Math.SQRT2 * 111_320);

/** Event time: the published date-time when it has one, otherwise the middle of OBIS's parsed date range. */
export function eventTimes(r: ObisRecord): { start: string; end?: string } | null {
  const ed = (r.eventDate ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ed) && !ed.includes("/") && !Number.isNaN(Date.parse(ed))) return { start: new Date(ed).toISOString() };
  const mid = Number(r.date_mid ?? r.date_start);
  if (!Number.isFinite(mid) || mid <= 0) return null;
  const start = new Date(mid).toISOString();
  const s = Number(r.date_start), e = Number(r.date_end);
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? { start, end: new Date(Math.max(e, mid)).toISOString() } : { start };
}

export type Skip = "licence" | "absence" | "invalid";

export function toWdx(r: ObisRecord, sensitive: (names: (string | undefined)[]) => boolean = (n) => isSensitiveTaxon(n)): { event?: WdxEvent; skipped?: Skip; nc?: boolean } {
  if (r.absence || r.dropped) return { skipped: "absence" };
  const lic = licenceClass(r.license);
  if (!lic) return { skipped: "licence" };
  const lat = Number(r.decimalLatitude), lon = Number(r.decimalLongitude), when = eventTimes(r);
  if (!r.id || !r.scientificName || !when || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { skipped: "invalid" };
  const step = SOURCES.obis.sensitiveRoundDegrees;
  const hide = sensitive([r.scientificName, r.genus, r.family, r.order]);
  const unc = Number(r.coordinateUncertaintyInMeters);
  const count = Math.trunc(Number(r.individualCount));
  const machine = (r.basisOfRecord ?? "").toLowerCase() === "machineobservation";
  const dataset = (r.datasetName ?? "").trim() || r.dataset_id || "unknown";
  return {
    nc: lic === "cc-by-nc",
    event: {
      wdx: "0.3",
      eventId: `obis:${r.id}`,
      eventStart: when.start,
      ...(when.end ? { eventEnd: when.end } : {}),
      // One deployment per dataset; OBIS deployments are never published (hideDeployments), only credited.
      deployment: {
        deploymentId: r.dataset_id ?? "unknown",
        name: dataset,
        latitude: hide ? roundTo(lat, step) : roundTo(lat, 1e-5),
        longitude: hide ? roundTo(lon, step) : roundTo(lon, 1e-5),
        ...(hide ? { coordinateUncertaintyMeters: Math.max(Number.isFinite(unc) ? unc : 0, MAX_UNCERTAINTY_FOR(step)) } : Number.isFinite(unc) && unc > 0 ? { coordinateUncertaintyMeters: unc } : {}),
        sensorType: "other",
        sensorModel: machine ? "machine observation" : r.basisOfRecord ?? "occurrence",
      },
      detection: {
        observationMethod: machine ? "machine" : "human",
        scientificName: r.scientificName,
        taxonRank: RANKS[(r.taxonRank ?? "").toLowerCase()] ?? "unranked",
        ...(count >= 1 ? { individualCount: count } : {}),
        // OBIS does not name the model behind a MachineObservation: recorded as unspecified, never invented.
        ...(machine ? { classifier: { name: "unspecified", version: "unknown" } } : {}),
      },
      source: {
        system: "obis", sourceRecordId: r.id, provider: dataset,
        ...(r.dataset_id ? { providerUrl: `https://obis.org/dataset/${r.dataset_id}` } : {}),
        ...(r.occurrenceID ? { occurrenceId: r.occurrenceID } : {}),
        ...(r.institutionCode ? { institutionCode: r.institutionCode } : {}),
      },
      license: LICENCE_URL[lic],
    },
  };
}

/** Our class for an OBIS taxon: seabirds stay birds, everything else from OBIS is marine. */
export const groupFor = (r: ObisRecord) => ((r.class ?? "").toLowerCase() === "aves" ? "avian" : "marine");

export interface RegionCursor { after: string | null; day: string; done: boolean }
export type ObisCursor = Record<string, RegionCursor>;

/**
 * Which region to fetch next and from where. A region is skipped once its walk is done today or its row cap is reached,
 * and the whole source stops at maxRows. Walks restart (after = null) on a new day. Pure, for tests.
 */
export function nextRegion(cfg: ObisConfig, cursor: ObisCursor, counts: { total: number; byRegion: Record<string, number> }, today: string):
  { region: ObisConfig["regions"][number]; after: string | null } | { stop: string } {
  if (counts.total >= cfg.maxRows) return { stop: `row cap reached (${counts.total} of ${cfg.maxRows})` };
  for (const region of cfg.regions) {
    const c = cursor[region.name];
    if (c && c.day === today && c.done) continue;
    if ((counts.byRegion[region.name] ?? 0) >= region.maxRows) continue;
    return { region, after: c && c.day === today ? c.after : null };
  }
  return { stop: "all regions done for today" };
}

export function pageUrl(region: ObisConfig["regions"][number], after: string | null, size: number, today: string): string {
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - region.days * 86400_000).toISOString().slice(0, 10);
  const q = new URLSearchParams({ startdate: start, size: String(size), fields: FIELDS });
  if (region.geometry) q.set("geometry", region.geometry);
  if (after) q.set("after", after);
  return `${API}?${q}`;
}

/** Rows held per region (a region with a geometry counts rows inside its bounding box; the unbounded one counts the rest). */
async function regionCounts(cfg: ObisConfig): Promise<{ total: number; byRegion: Record<string, number> }> {
  const { sql } = await import("@/lib/db"); // loaded lazily so the pure functions here can be tested without a database
  const [{ n }] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM events WHERE source_system = 'obis'`;
  const byRegion: Record<string, number> = {};
  let boxed = 0;
  for (const r of cfg.regions) {
    const box = r.geometry ? bbox(r.geometry) : null;
    if (!box) continue;
    const [{ c }] = await sql<{ c: number }[]>`SELECT count(*)::int AS c FROM events WHERE source_system = 'obis'
      AND longitude BETWEEN ${box[0]} AND ${box[2]} AND latitude BETWEEN ${box[1]} AND ${box[3]}`;
    byRegion[r.name] = c; boxed += c;
  }
  for (const r of cfg.regions) if (!r.geometry) byRegion[r.name] = n - boxed;
  return { total: n, byRegion };
}

/** [west, south, east, north] of a WKT POLYGON. */
export function bbox(wkt: string): [number, number, number, number] | null {
  const nums = [...wkt.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  if (!nums.length) return null;
  return [Math.min(...nums.map((p) => p[0])), Math.min(...nums.map((p) => p[1])), Math.max(...nums.map((p) => p[0])), Math.max(...nums.map((p) => p[1]))];
}

export function parsePage(json: unknown): { events: WdxEvent[]; records: ObisRecord[]; skipped: Record<Skip, number>; nc: number; lastId: string | null; size: number } {
  const recs = ((json as { results?: ObisRecord[] } | null)?.results ?? []).filter((r) => r && typeof r === "object");
  const skipped: Record<Skip, number> = { licence: 0, absence: 0, invalid: 0 };
  const events: WdxEvent[] = [], records: ObisRecord[] = [];
  let nc = 0;
  for (const r of recs) {
    const m = toWdx(r);
    if (m.event) { events.push(m.event); records.push(r); if (m.nc) nc++; } else if (m.skipped) skipped[m.skipped]++;
  }
  return { events, records, skipped, nc, lastId: recs.length ? recs[recs.length - 1].id ?? null : null, size: recs.length };
}

export const obis: PullConnector = {
  name: "obis",
  minIntervalMinutes: SOURCES.obis.pollMinutes,
  async pull(cursorText) {
    const cfg = SOURCES.obis;
    const today = new Date().toISOString().slice(0, 10);
    const cursor: ObisCursor = cursorText ? JSON.parse(cursorText) : {};
    const counts = await regionCounts(cfg);
    const heldBefore = counts.total;
    const events: WdxEvent[] = [];
    const groups = new Map<string, string>();
    const tally: Record<string, number> = { licence: 0, absence: 0, invalid: 0, nc: 0 };
    const notes: string[] = [];
    for (let page = 0; page < cfg.pagesPerRun; page++) {
      const next = nextRegion(cfg, cursor, counts, today);
      if ("stop" in next) { notes.push(next.stop); break; }
      const { region, after } = next;
      const p = parsePage(await getJson(pageUrl(region, after, cfg.pageSize, today), fetch, 60_000));
      const room = Math.max(0, Math.min(cfg.maxRows - counts.total, region.maxRows - (counts.byRegion[region.name] ?? 0)));
      const take = p.events.slice(0, room);
      events.push(...take);
      p.records.slice(0, room).forEach((r) => groups.set(r.scientificName!, groupFor(r)));
      counts.total += take.length;
      counts.byRegion[region.name] = (counts.byRegion[region.name] ?? 0) + take.length;
      for (const k of ["licence", "absence", "invalid"] as const) tally[k] += p.skipped[k];
      tally.nc += p.events.slice(0, room).filter((e) => e.license?.includes("/by-nc/")).length;
      cursor[region.name] = { after: p.lastId, day: today, done: p.size < cfg.pageSize || !p.lastId };
    }
    notes.unshift(`${events.length} records (${tally.nc} CC BY-NC); skipped ${tally.licence} other or missing licence, ${tally.absence} absences, ${tally.invalid} incomplete; ${heldBefore} of ${cfg.maxRows} rows held before this run`);
    return { events, cursor: JSON.stringify(cursor), notes, groups: [...groups].map(([name, grp]) => ({ name, grp })), keepGroups: true };
  },
};

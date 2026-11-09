// Lost species watch. Species not confirmed in the wild for 10 years or more (list: lost_species, names: lost_names).
// Any record of one, from any source, is held back from every public table and stored in lost_flags for private expert
// review. Most will be misidentifications, so nothing here is ever served publicly and nothing is announced automatically.
// Every path that writes species rows calls this first: WDX ingest (all connectors, device pushes), BirdWeather rollups,
// GBIF weekly rollups, dataset uploads and BirdWeather opt-in counts.
import { sql } from "@/lib/db";
import type { WdxEvent } from "@/lib/wdx/types";
import { matchLost } from "@/lib/lostNames";

export { matchLost, nameKeys } from "@/lib/lostNames";

const TTL_MS = 10 * 60_000;
let cache: { at: number; names: Map<string, number> } | null = null;

/** Watched names, lower case, cached for 10 minutes. Empty when the tables do not exist yet (before migration 0038). */
export async function watchNames(): Promise<Map<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
  try {
    const rows = await sql<{ name: string; lost_id: number }[]>`SELECT name, lost_id FROM lost_names`;
    cache = { at: Date.now(), names: new Map(rows.map((r) => [r.name, r.lost_id])) };
  } catch {
    cache = { at: Date.now(), names: new Map() };
  }
  return cache.names;
}
export function resetWatchCache() { cache = null; }

export interface FlagRow {
  flag_key: string; lost_id: number; name_received: string; kind: "record" | "count"; source_system: string;
  source_record: string | null; source_url: string | null; observed_at: Date | null; period: string | null;
  latitude: number | null; longitude: number | null; count: number | null; confidence: number | null;
  media_type: string | null; media_url: string | null; detail: Record<string, unknown>;
}

async function storeFlags(rows: FlagRow[]): Promise<number> {
  if (!rows.length) return 0;
  let fresh = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, detail: sql.json(r.detail as Parameters<typeof sql.json>[0]) }));
    const res = await sql<{ inserted: boolean }[]>`
      INSERT INTO lost_flags ${sql(chunk)}
      ON CONFLICT (flag_key) DO UPDATE SET last_seen = now(), count = COALESCE(EXCLUDED.count, lost_flags.count)
      RETURNING (xmax = 0) AS inserted`;
    fresh += res.filter((r) => r.inserted).length;
  }
  return fresh;
}

/** Splits rows into those that may go public and those held for review. Held rows are stored as flags. If storing fails
 *  the held rows are still dropped (never published): the next pull or upload brings them again. */
async function hold<T>(rows: T[], nameOf: (r: T) => string | null | undefined, toFlag: (r: T, lostId: number) => FlagRow): Promise<T[]> {
  if (!rows.length) return rows;
  const names = await watchNames();
  if (!names.size) return rows;
  const keep: T[] = [];
  const flags: FlagRow[] = [];
  for (const r of rows) {
    const id = matchLost(nameOf(r), names);
    if (id === null) keep.push(r); else flags.push(toFlag(r, id));
  }
  if (flags.length) {
    try { await storeFlags(flags); } catch (e) { console.error("lost_flags", (e as Error).message); }
  }
  return keep;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** WDX events (every connector and device push). */
export function holdEvents(events: WdxEvent[]): Promise<WdxEvent[]> {
  return hold(events, (e) => e.detection.scientificName, (e, lostId) => ({
    flag_key: `record:${e.eventId}`, lost_id: lostId, name_received: e.detection.scientificName ?? "", kind: "record",
    source_system: e.source.system, source_record: e.source.sourceRecordId ?? null, source_url: e.source.providerUrl ?? null,
    observed_at: new Date(e.eventStart), period: null, latitude: num(e.deployment.latitude), longitude: num(e.deployment.longitude),
    count: e.detection.individualCount ?? null, confidence: num(e.detection.confidence),
    media_type: e.media?.mediaType ?? null, media_url: e.media?.url ?? null,
    detail: { vernacularName: e.detection.vernacularName ?? null, classifier: e.detection.classifier ?? null, method: e.detection.observationMethod ?? null,
      provider: e.source.provider ?? null, deployment: e.deployment.deploymentId, sensor: e.deployment.sensorType, license: e.license ?? null },
  }));
}

/** Aggregate counts per cell and day or week (BirdWeather topSpecies, GBIF facets): nothing to look at, only where and when. */
export function holdCounts<T extends { scientific_name: string; count: number }>(rows: T[], source: string, period: (r: T) => string, centre: (r: T) => { lat: number; lon: number }): Promise<T[]> {
  return hold(rows, (r) => r.scientific_name, (r, lostId) => {
    const c = centre(r);
    return {
      flag_key: `count:${source}:${period(r)}:${c.lat}:${c.lon}:${r.scientific_name.toLowerCase()}`, lost_id: lostId, name_received: r.scientific_name,
      kind: "count", source_system: source, source_record: null, source_url: null, observed_at: null, period: period(r),
      latitude: c.lat, longitude: c.lon, count: r.count, confidence: null, media_type: null, media_url: null, detail: {},
    };
  });
}

/** Rows of an uploaded dataset (one per detection or observation). */
export function holdDatasetRows<T extends { dataset_id: string; site: string; lat: number; lon: number; ts: Date; scientific_name: string; confidence: number | null; individuals: number; file_name: string | null }>(rows: T[]): Promise<T[]> {
  return hold(rows, (r) => r.scientific_name, (r, lostId) => ({
    flag_key: `record:dataset:${r.dataset_id}:${r.site}:${r.ts.toISOString()}:${r.scientific_name.toLowerCase()}`, lost_id: lostId, name_received: r.scientific_name,
    kind: "record", source_system: `dataset:${r.dataset_id}`, source_record: r.file_name, source_url: `/datasets/${r.dataset_id}`,
    observed_at: r.ts, period: null, latitude: r.lat, longitude: r.lon, count: r.individuals, confidence: r.confidence,
    media_type: null, media_url: null, detail: { site: r.site, file: r.file_name },
  }));
}

/** Names that must never be shown publicly (for live lists built straight from GBIF, such as area reports). */
export async function isLostName(): Promise<(name: string) => boolean> {
  const names = await watchNames();
  return (name: string) => matchLost(name, names) !== null;
}

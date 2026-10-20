import { sql } from "@/lib/db";
import { dedupeKey, splitDuplicates } from "@/lib/dedupe";
import { creditFor } from "@/lib/sources";
import type { WdxEvent } from "./types";

export interface IngestResult {
  received: number;
  inserted: number;
  updated: number;
  /** Records already held from another aggregator (same occurrence): not added again, their credit added to the kept row. */
  merged?: number;
}

const SOURCE_NAME: Record<string, string> = { gbif: "GBIF", inaturalist: "iNaturalist" };

/** Upserts sensor or observer locations (also used for stations with no records yet, such as hydrophones). */
export async function upsertDeployments(rows: { id: string; source_system: string; deployment_id: string; name: string | null; sensor_type: string; sensor_model: string | null; latitude: number; longitude: number; coord_uncertainty_m: number | null }[], tx = sql): Promise<void> {
  if (!rows.length) return;
  await tx`
    INSERT INTO deployments ${tx(rows)}
    ON CONFLICT (id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, deployments.name),
      sensor_model = COALESCE(EXCLUDED.sensor_model, deployments.sensor_model),
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      coord_uncertainty_m = COALESCE(EXCLUDED.coord_uncertainty_m, deployments.coord_uncertainty_m),
      last_seen = now()
  `;
}

/**
 * Upsert a batch of already-validated WDX events.
 * Dedupe rule (WDX 0.1): same eventId, later review.reviewedAt wins; otherwise later-received wins.
 */
export async function ingestEvents(events: WdxEvent[], opts: { keepRaw?: boolean } = {}): Promise<IngestResult> {
  // Pulled sources can be re-fetched, so their raw JSON is not stored (it is most of the row size).
  const keepRaw = opts.keepRaw ?? true;
  if (events.length === 0) return { received: 0, inserted: 0, updated: 0 };

  // Deployments first (dedupe within batch).
  const depMap = new Map<string, WdxEvent["deployment"] & { source: string }>();
  for (const e of events) {
    const id = `${e.source.system}:${e.deployment.deploymentId}`;
    if (!depMap.has(id)) depMap.set(id, { ...e.deployment, source: e.source.system });
  }
  const depRows = [...depMap.entries()].map(([id, d]) => ({
    id,
    source_system: d.source,
    deployment_id: d.deploymentId,
    name: d.name ?? null,
    sensor_type: d.sensorType,
    sensor_model: d.sensorModel ?? null,
    latitude: d.latitude,
    longitude: d.longitude,
    coord_uncertainty_m: d.coordinateUncertaintyMeters ?? null,
  }));

  const evRows = events.map((e) => ({
    event_id: e.eventId,
    deployment_id: `${e.source.system}:${e.deployment.deploymentId}`,
    source_system: e.source.system,
    source_record_id: e.source.sourceRecordId ?? null,
    event_start: e.eventStart,
    event_end: e.eventEnd ?? null,
    scientific_name: e.detection.scientificName ?? null,
    vernacular_name: e.detection.vernacularName ?? null,
    taxon_rank: e.detection.taxonRank ?? null,
    taxon_id: e.detection.taxonId ?? null,
    confidence: e.detection.confidence ?? null,
    classifier_name: e.detection.classifier?.name ?? null,
    classifier_version: e.detection.classifier?.version ?? null,
    observation_method: e.detection.observationMethod ?? "machine",
    individual_count: e.detection.individualCount ?? null,
    source_provider: e.source.provider ?? null,
    source_trusted: e.source.trusted ?? null,
    source_provider_url: e.source.providerUrl ?? null,
    dedupe_key: dedupeKey(e.source.system, e.source.sourceRecordId, e.source.occurrenceId, e.source.institutionCode),
    media_type: e.media?.mediaType ?? null,
    media_url: e.media?.url ?? null,
    review_status: e.review?.status ?? "unreviewed",
    license: e.license ?? null,
    latitude: e.deployment.latitude,
    longitude: e.deployment.longitude,
    raw: sql.json((keepRaw ? e : {}) as unknown as Parameters<typeof sql.json>[0]),
  }));

  // Same occurrence already held from another aggregator: keep that row and add this source's credit to it.
  const keys = [...new Set(evRows.map((r) => r.dedupe_key).filter((k): k is string => !!k))];
  const existing = new Map<string, { event_id: string; source_system: string }>();
  if (keys.length) {
    for (const r of await sql<{ dedupe_key: string; event_id: string; source_system: string }[]>`
      SELECT DISTINCT ON (dedupe_key) dedupe_key, event_id, source_system FROM events WHERE dedupe_key = ANY(${keys}) ORDER BY dedupe_key, received_at`) existing.set(r.dedupe_key, r);
  }
  const { fresh, merged } = splitDuplicates(evRows, existing);
  let inserted = 0;
  let updated = 0;
  // postgres caps a statement at 65534 bind params; ~24 cols per row, so chunk at 2000 rows.
  const CHUNK = 2000;
  const chunks = <T,>(arr: T[]) => Array.from({ length: Math.ceil(arr.length / CHUNK) }, (_, i) => arr.slice(i * CHUNK, (i + 1) * CHUNK));
  await sql.begin(async (tx) => {
    for (const depChunk of chunks(depRows)) await upsertDeployments(depChunk, tx as unknown as typeof sql);
    for (const m of merged) {
      const c = creditFor(m.row.source_system, m.row.source_provider)?.text ?? `Also in ${SOURCE_NAME[m.row.source_system] ?? m.row.source_system}`;
      await tx`UPDATE events SET also_credit = ${c.replace(/^Data: /, "Also in ")} WHERE event_id = ${m.into}`;
    }
    for (const evChunk of chunks(fresh)) {
    const res = await tx<{ inserted: boolean }[]>`
      INSERT INTO events ${tx(evChunk)}
      ON CONFLICT (event_id) DO UPDATE SET
        review_status = EXCLUDED.review_status,
        confidence = EXCLUDED.confidence,
        scientific_name = EXCLUDED.scientific_name,
        vernacular_name = EXCLUDED.vernacular_name,
        taxon_id = EXCLUDED.taxon_id,
        taxon_rank = EXCLUDED.taxon_rank,
        individual_count = EXCLUDED.individual_count,
        source_trusted = EXCLUDED.source_trusted,
        media_url = COALESCE(EXCLUDED.media_url, events.media_url),
        raw = EXCLUDED.raw,
        received_at = now()
      WHERE events.source_system = EXCLUDED.source_system
        AND COALESCE(EXCLUDED.raw->'review'->>'reviewedAt', '') >= COALESCE(events.raw->'review'->>'reviewedAt', '')
      RETURNING (xmax = 0) AS inserted
    `;
    for (const r of res) if (r.inserted) inserted++; else updated++;
    }
  });

  return { received: events.length, inserted, updated, merged: merged.length };
}

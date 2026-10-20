import { sql } from "@/lib/db";
import { ingestEvents, upsertDeployments } from "@/lib/wdx/ingest";
import { validateWdx } from "@/lib/wdx/validate";
import { acartia } from "./acartia";
import { birdweather } from "./birdweather";
import { gbif } from "./gbif";
import { inaturalist } from "./inaturalist";
import { BIRDWEATHER_PAUSED, SOURCES } from "@/lib/sources";
import { upsertGroups } from "@/lib/rollups";
import { isDue } from "./schedule";
import type { PullConnector } from "./types";

export const connectors: Record<string, PullConnector> = BIRDWEATHER_PAUSED ? { inaturalist, gbif, acartia } : { birdweather, inaturalist, gbif, acartia };

export interface RunResult {
  connector: string;
  pulled: number;
  inserted: number;
  updated: number;
  invalid: number;
  cursor: string | null;
  error?: string;
  skipped?: boolean;
  notes?: string[];
}


export async function runConnector(c: PullConnector): Promise<RunResult> {
  const [state] = await sql<{ cursor: string | null; last_run_at: Date | null; last_error: string | null }[]>`
    SELECT cursor, last_run_at, last_error FROM pull_state WHERE connector = ${c.name}`;
  if (!isDue(c.minIntervalMinutes, state?.last_run_at ?? null, state?.last_error ?? null)) {
    return { connector: c.name, pulled: 0, inserted: 0, updated: 0, invalid: 0, cursor: state?.cursor ?? null, skipped: true };
  }
  try {
    const { events, cursor, notes, groups, keepGroups, stations } = await c.pull(state?.cursor ?? null);
    if (stations?.length) await upsertDeployments(stations.map((d) => ({
      id: `${c.name}:${d.deploymentId}`, source_system: c.name, deployment_id: d.deploymentId, name: d.name ?? null, sensor_type: d.sensorType,
      sensor_model: d.sensorModel ?? null, latitude: d.latitude, longitude: d.longitude, coord_uncertainty_m: d.coordinateUncertaintyMeters ?? null })));
    if (notes?.length) console.log(`[${c.name}]`, notes.join("; "));
    const valid = events.filter((e) => validateWdx(e).ok);
    const r = await ingestEvents(valid, { keepRaw: false });
    if (groups?.length) await upsertGroups(groups, { overwrite: !keepGroups });
    await sql`
      INSERT INTO pull_state (connector, cursor, last_run_at, last_count, last_error)
      VALUES (${c.name}, ${cursor}, now(), ${r.received}, NULL)
      ON CONFLICT (connector) DO UPDATE SET cursor = EXCLUDED.cursor, last_run_at = now(), last_count = EXCLUDED.last_count, last_error = NULL
    `;
    const all = [...(notes ?? []), ...(r.merged ? [`${r.merged} already held from another aggregator, credited there`] : [])];
    return { connector: c.name, pulled: events.length, inserted: r.inserted, updated: r.updated, invalid: events.length - valid.length, cursor, ...(all.length ? { notes: all } : {}) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await sql`
      INSERT INTO pull_state (connector, last_run_at, last_error) VALUES (${c.name}, now(), ${msg})
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now(), last_error = EXCLUDED.last_error
    `;
    return { connector: c.name, pulled: 0, inserted: 0, updated: 0, invalid: 0, cursor: state?.cursor ?? null, error: msg };
  }
}

/**
 * Storage budget: raw events are only a live window. History lives in the rollup tables.
 * BirdWeather 3 hours, other pulled sources 7 days, device pushes 30 days, daily rollups 28 days.
 * Sized for Neon's free 512 MB: about 225 MB weekly history, 125 MB daily, 15 MB live events (500 newest BirdWeather detections per pull).
 */
export async function prune(): Promise<void> {
  // Bats are sparse and nocturnal, so they stay for a day; everything else from BirdWeather for 3 hours.
  await sql`DELETE FROM events e WHERE e.source_system = 'birdweather' AND e.event_start < now() - interval '3 hours'
    AND (e.event_start < now() - interval '24 hours' OR NOT EXISTS (SELECT 1 FROM species_group g WHERE g.scientific_name = e.scientific_name AND g.grp = 'bat'))`;
  await sql`DELETE FROM events WHERE source_system IN ('inaturalist', 'gbif') AND event_start < now() - interval '7 days'`;
  // Marine and other configured sources keep keepDays (src/config/sources.json); OBIS also stays under its row cap.
  const kept = Object.entries(SOURCES).filter(([k, r]) => !k.startsWith("_") && r.keepDays);
  for (const [source, r] of kept) await sql`DELETE FROM events WHERE source_system = ${source} AND event_start < now() - make_interval(days => ${r.keepDays!})`;
  await sql`DELETE FROM events WHERE event_id IN (SELECT event_id FROM events WHERE source_system = 'obis' ORDER BY event_start DESC OFFSET ${SOURCES.obis.maxRows})`;
  const skip = ["birdweather", "inaturalist", "gbif", ...kept.map(([k]) => k)];
  await sql`DELETE FROM events WHERE source_system <> ALL(${skip}) AND event_start < now() - interval '30 days'`;
  await sql`DELETE FROM species_daily WHERE day < CURRENT_DATE - 28`;
  // Stations that stop reporting (removed, or made private) are forgotten after 30 days.
  await sql`DELETE FROM deployments d WHERE d.source_system = 'birdweather' AND d.last_seen < now() - interval '30 days'
    AND NOT EXISTS (SELECT 1 FROM events e WHERE e.deployment_id = d.id)`;
}

export async function pullAll(only?: string | null): Promise<RunResult[]> {
  const targets = Object.values(connectors).filter((c) => !only || c.name === only);
  const results = await Promise.all(targets.map(runConnector));
  await prune();
  return results;
}

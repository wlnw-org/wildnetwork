/**
 * Wildlife Network Base support on the server: health heartbeats and test stations.
 *
 * Health: POST /api/v1/devices/{id}/health (the device's own key) stores a heartbeat as a WDX device-status record in
 * device_status (STATUS_KEEP_DAYS of history) and as the device's latest status. Owners read it back with the same key.
 * Health data is never public. The server monitor emails when a Base goes quiet, loses its microphone or runs hot.
 *
 * Test stations: while a device is in test mode (devices.test, or a top-level `test: true` on an event), its
 * detections go to test_events instead of events, so the map, history, reports, rollups and open data never see them.
 * Switching test mode off sets field_since: from then on only detections made after the switch are counted.
 */
import { sql } from "@/lib/db";
import { STATUS_KEEP_DAYS, STATUS_MIN_SECONDS } from "@/lib/devices";
import type { WdxEvent } from "@/lib/wdx/types";
import { eventRow } from "@/lib/wdx/ingest";
import { toFeature } from "@/lib/eventFeature";
import { alertsWanted } from "@/lib/stationClaims";

export const HEALTH_ALERT = { QUIET_HOURS: 6, MAX_TEMP_C: 75, FORGET_DAYS: 30 };
export const TEST_EVENTS_KEEP_DAYS = 90;

type Num = number | null;
const num = (v: unknown, lo = -1e12, hi = 1e12): Num => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);
const str = (v: unknown, max = 80): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const iso = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * One heartbeat from a Base, cleaned into a WDX device-status record. Unknown fields are dropped and every value is
 * range-checked, so nothing beyond the documented health fields (no audio, no location) can be stored. Pure.
 */
export function normalizeHealth(deviceId: string, b: unknown, now = Date.now()): { ok: true; at: Date; status: Record<string, unknown> } | { ok: false; error: string } {
  if (!b || typeof b !== "object" || Array.isArray(b)) return { ok: false, error: "each heartbeat must be a JSON object" };
  const h = b as Record<string, unknown>;
  const at = h.at === undefined ? new Date(now).toISOString() : iso(h.at);
  if (!at) return { ok: false, error: "at must be an ISO time" };
  if (Date.parse(at) > now + 3600_000) return { ok: false, error: "at is in the future" };
  const software: Record<string, string> = {};
  if (h.software && typeof h.software === "object") {
    for (const [k, v] of Object.entries(h.software as Record<string, unknown>).slice(0, 10)) { const s = str(v, 40); if (s && /^[\w.-]{1,40}$/.test(k)) software[k] = s; }
  }
  const st = (h.storage ?? {}) as Record<string, unknown>;
  const mic = (h.microphone ?? {}) as Record<string, unknown>;
  const q = (h.queue ?? {}) as Record<string, unknown>;
  const net = (h.network ?? {}) as Record<string, unknown>;
  const status: Record<string, unknown> = {
    wdx: "0.2", kind: "device-status", deviceId, at,
    ...(Object.keys(software).length ? { software } : {}),
    ...(num(h.uptimeSeconds, 0) != null ? { uptimeSeconds: Math.round(h.uptimeSeconds as number) } : {}),
    ...(num(h.boots, 0) != null ? { boots: Math.round(h.boots as number) } : {}),
    ...(num(h.temperatureC, -60, 150) != null ? { temperatureC: Math.round((h.temperatureC as number) * 10) / 10 } : {}),
    ...(num(st.freeMb, 0) != null ? { storage: { freeMb: Math.round(st.freeMb as number), ...(num(st.totalMb, 0) != null ? { totalMb: Math.round(st.totalMb as number) } : {}) } } : {}),
    ...(typeof mic.active === "boolean" ? { microphone: { active: mic.active, lastDetectionAt: iso(mic.lastDetectionAt) } } : {}),
    ...(num(q.pending, 0) != null ? { queue: { pending: Math.round(q.pending as number) } } : {}),
    ...(str(net.type, 20) || num(net.signal) != null ? { network: { type: str(net.type, 20), signal: num(net.signal, -200, 200), signalUnit: str(net.signalUnit, 10) } } : {}),
  };
  return { ok: true, at: new Date(at), status };
}

/** Stores one status record: the device's latest (if newer) and history at most one per STATUS_MIN_SECONDS. */
export async function storeStatus(deviceId: string, at: Date, status: Record<string, unknown>): Promise<boolean> {
  await sql`UPDATE devices SET last_status = ${sql.json(status as never)}, last_status_at = ${at}
            WHERE id = ${deviceId} AND (last_status_at IS NULL OR last_status_at <= ${at})`;
  const r = await sql`
    INSERT INTO device_status (device_id, at, status)
    SELECT ${deviceId}, ${at}, ${sql.json(status as never)}
    WHERE NOT EXISTS (SELECT 1 FROM device_status WHERE device_id = ${deviceId}
                      AND at > ${at}::timestamptz - make_interval(secs => ${STATUS_MIN_SECONDS})
                      AND at < ${at}::timestamptz + make_interval(secs => ${STATUS_MIN_SECONDS}))
    ON CONFLICT DO NOTHING`;
  return r.count > 0;
}

export async function pruneStatus(deviceId: string) {
  await sql`DELETE FROM device_status WHERE device_id = ${deviceId} AND at < now() - make_interval(days => ${STATUS_KEEP_DAYS})`;
}

/** Latest heartbeat and history (newest first) for the owner of the device. */
export async function deviceHealth(deviceId: string, days = 7) {
  const [d] = await sql<{ last_status: Record<string, unknown> | null }[]>`SELECT last_status FROM devices WHERE id = ${deviceId}`;
  const rows = await sql<{ status: Record<string, unknown> }[]>`
    SELECT status FROM device_status WHERE device_id = ${deviceId} AND at > now() - make_interval(days => ${Math.min(Math.max(days, 1), STATUS_KEEP_DAYS)})
    ORDER BY at DESC LIMIT 2000`;
  return { latest: d?.last_status ?? null, history: rows.map((r) => r.status) };
}

export interface HealthRow { id: string; name: string; at: Date; quiet: boolean; s: Record<string, unknown> | null; test: boolean; alerts_paused_until: Date | null }

/**
 * Problems worth an email: Bases quiet for QUIET_HOURS, without an active microphone, or hotter than MAX_TEMP_C.
 * Test stations and Bases whose owner paused alerts are skipped.
 */
export async function healthProblems(): Promise<string[]> {
  const rows = await sql<HealthRow[]>`
    SELECT id, name, last_status_at AS at, last_status_at < now() - make_interval(hours => ${HEALTH_ALERT.QUIET_HOURS}) AS quiet, last_status AS s,
           test, alerts_paused_until
    FROM devices WHERE model = 'wildnetwork-base' AND NOT test AND (alerts_paused_until IS NULL OR alerts_paused_until <= now())
      AND last_status_at > now() - make_interval(days => ${HEALTH_ALERT.FORGET_DAYS})`;
  return problemLines(rows);
}

/** The email lines for these devices (test and paused ones skipped again here). Pure. */
export function problemLines(rows: HealthRow[], now = Date.now()): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (!alertsWanted(r, now)) continue;
    const who = `Base ${r.name} (${r.id})`;
    if (r.quiet) { out.push(`${who}: no heartbeat since ${r.at.toISOString().slice(0, 16).replace("T", " ")} UTC`); continue; }
    const mic = r.s?.microphone as { active?: boolean } | undefined;
    if (mic && mic.active === false) out.push(`${who}: microphone not active`);
    const t = Number(r.s?.temperatureC);
    if (Number.isFinite(t) && t > HEALTH_ALERT.MAX_TEMP_C) out.push(`${who}: running at ${t} C`);
  }
  return out;
}

/** True when an event from this device must stay out of public tables. Pure. */
export function isTestEvent(device: { test: boolean; field_since: Date | null } | null, ev: WdxEvent & { test?: unknown }): boolean {
  if (ev.test === true) return true;
  if (!device) return false;
  if (device.test) return true;
  return !!device.field_since && Date.parse(ev.eventStart) < device.field_since.getTime();
}

/** Splits a device's batch: test detections are stored in test_events and only the rest go on to the public tables. */
export async function divertTestEvents(deviceId: string | null, events: WdxEvent[]): Promise<{ events: WdxEvent[]; test: number }> {
  const [device] = deviceId ? await sql<{ test: boolean; field_since: Date | null }[]>`SELECT test, field_since FROM devices WHERE id = ${deviceId}` : [];
  const keep: WdxEvent[] = [], test: WdxEvent[] = [];
  for (const e of events) (isTestEvent(device ?? null, e) ? test : keep).push(e);
  if (test.length) {
    const rows = test.map((e) => ({ event_id: e.eventId, device_id: deviceId ?? "unknown", event_start: e.eventStart, event: sql.json(e as never) }));
    for (let i = 0; i < rows.length; i += 1000) {
      await sql`INSERT INTO test_events ${sql(rows.slice(i, i + 1000))} ON CONFLICT (event_id) DO UPDATE SET event = EXCLUDED.event, received_at = now()`;
    }
    await sql`DELETE FROM test_events WHERE received_at < now() - make_interval(days => ${TEST_EVENTS_KEEP_DAYS})`;
  }
  return { events: keep, test: test.length };
}

/** Test mode on or off. Off sets field_since now: detections made before the switch stay out of public tables. */
export async function setTestMode(deviceId: string, on: boolean) {
  const [d] = await sql<{ test: boolean; field_since: Date | null }[]>`
    UPDATE devices SET test = ${on}, field_since = CASE WHEN ${on} THEN NULL WHEN test THEN now() ELSE field_since END
    WHERE id = ${deviceId} RETURNING test, field_since`;
  return d ? { test: d.test, fieldSince: d.field_since } : null;
}

/** A test station's stored detection as a map/API feature, marked test: true. Only ever shown to the device's owner. Pure. */
export function testEventFeature(e: WdxEvent) {
  const f = toFeature({ ...eventRow(e), n: 1, grp: null });
  return { ...f, properties: { ...f.properties, test: true } as Record<string, unknown> };
}

/** The owner's test-station detections for one deployment (source:deploymentId), newest first. */
export async function ownerTestEvents(deviceId: string, deployment: string, from: Date, to: Date, limit: number) {
  const rows = await sql<{ event: WdxEvent }[]>`
    SELECT event FROM test_events
    WHERE device_id = ${deviceId} AND event_start >= ${from} AND event_start <= ${to}
      AND (event->'source'->>'system') || ':' || (event->'deployment'->>'deploymentId') = ${deployment}
    ORDER BY event_start DESC LIMIT ${limit}`;
  return rows.map((r) => testEventFeature(r.event));
}

/** The station (source:deploymentId) a device's batch is filed under: the newest event's. Pure. */
export function batchDeployment(events: WdxEvent[]): string | null {
  let best: WdxEvent | null = null;
  for (const e of events) if (!best || Date.parse(e.eventStart) > Date.parse(best.eventStart)) best = e;
  return best ? eventRow(best).deployment_id : null;
}

/** Remembers which station a device sends to, so station pages can link them reliably. */
export async function linkDeviceDeployment(deviceId: string | null, events: WdxEvent[]) {
  const dep = deviceId ? batchDeployment(events) : null;
  if (!dep) return;
  await sql`UPDATE devices SET deployment_id = ${dep} WHERE id = ${deviceId} AND deployment_id IS DISTINCT FROM ${dep}`;
}

/** Pause the server monitor's emails for a device until a time, or resume them (null). */
export async function setAlertPause(deviceId: string, until: Date | null) {
  const [d] = await sql<{ alerts_paused_until: Date | null }[]>`
    UPDATE devices SET alerts_paused_until = ${until} WHERE id = ${deviceId} RETURNING alerts_paused_until`;
  return d ? { alertsPausedUntil: d.alerts_paused_until } : null;
}

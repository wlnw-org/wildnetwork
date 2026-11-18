import { test } from "node:test";
import assert from "node:assert/strict";
import { isTestEvent, normalizeHealth } from "./baseDevices";
import type { WdxEvent } from "./wdx/types";

const now = Date.parse("2026-11-19T12:00:00Z");

test("a heartbeat keeps only the documented health fields, range checked", () => {
  const h = normalizeHealth("wnd_a", {
    at: "2026-11-19T11:45:00Z", software: { wnbase: "0.2.0", "wdx-agent": "0.4.4", "bad key!": "x" }, uptimeSeconds: 3600.4, boots: 7,
    temperatureC: 51.27, storage: { freeMb: 20480, totalMb: 29000 }, microphone: { active: false, lastDetectionAt: "2026-11-19T05:41:12Z" },
    queue: { pending: 12 }, network: { type: "wifi", signal: -61, signalUnit: "dBm" },
    audio: "AAAA", latitude: 13.0827, extra: { anything: 1 },
  }, now);
  assert.equal(h.ok, true);
  if (!h.ok) return;
  assert.deepEqual(h.status, {
    wdx: "0.2", kind: "device-status", deviceId: "wnd_a", at: "2026-11-19T11:45:00.000Z",
    software: { wnbase: "0.2.0", "wdx-agent": "0.4.4" }, uptimeSeconds: 3600, boots: 7, temperatureC: 51.3,
    storage: { freeMb: 20480, totalMb: 29000 }, microphone: { active: false, lastDetectionAt: "2026-11-19T05:41:12.000Z" },
    queue: { pending: 12 }, network: { type: "wifi", signal: -61, signalUnit: "dBm" },
  });
});

test("heartbeats without a time get now; bad times and non-objects are refused", () => {
  const h = normalizeHealth("wnd_a", { temperatureC: 40 }, now);
  assert.ok(h.ok && h.at.getTime() === now);
  assert.equal(normalizeHealth("wnd_a", { at: "yesterday-ish" }, now).ok, false);
  assert.equal(normalizeHealth("wnd_a", { at: "2026-11-19T20:00:00Z" }, now).ok, false);
  assert.equal(normalizeHealth("wnd_a", [1, 2], now).ok, false);
  const silly = normalizeHealth("wnd_a", { temperatureC: 900, boots: -3 }, now);
  assert.ok(silly.ok && silly.status.temperatureC === undefined && silly.status.boots === undefined);
});

const ev = (start: string, extra: Record<string, unknown> = {}) => ({ eventStart: start, ...extra }) as unknown as WdxEvent;

test("test stations and test events stay out of public tables", () => {
  assert.equal(isTestEvent(null, ev("2026-11-19T05:00:00Z")), false);
  assert.equal(isTestEvent(null, ev("2026-11-19T05:00:00Z", { test: true })), true);
  assert.equal(isTestEvent({ test: true, field_since: null }, ev("2026-11-19T05:00:00Z")), true);
  assert.equal(isTestEvent({ test: false, field_since: null }, ev("2026-11-19T05:00:00Z")), false);
});

test("after test mode is switched off, only detections made after the switch count", () => {
  const d = { test: false, field_since: new Date("2026-11-19T08:00:00Z") };
  assert.equal(isTestEvent(d, ev("2026-11-19T07:59:00Z")), true);
  assert.equal(isTestEvent(d, ev("2026-11-19T08:01:00Z")), false);
});

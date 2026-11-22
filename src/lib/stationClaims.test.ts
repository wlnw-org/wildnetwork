import { test } from "node:test";
import assert from "node:assert/strict";
import "./testDbUrl";
import { ONLINE_MINUTES, onlineState, addClaim, alertsWanted, claimSecret, decodeClaims, decodeLink, encodeClaims, encodeLink, LINK_MINUTES, linkSecret, MAX_CLAIMS, parsePause, pausedForever, pauseUntil, removeClaim } from "./stationClaims";
import { problemLines } from "./baseDevices";

const now = Date.parse("2026-11-21T12:00:00Z");
const sec = claimSecret("test-secret");

test("claims cookie round trip, tamper and expiry", () => {
  const c = encodeClaims(["wnd_abc", "wnd_def"], sec, now);
  assert.deepEqual(decodeClaims(c, sec, now), ["wnd_abc", "wnd_def"]);
  assert.deepEqual(decodeClaims(c, claimSecret("other"), now), []);
  const [data, mac] = c.split(".");
  const forged = Buffer.from(JSON.stringify({ d: ["wnd_evil"], exp: now + 1e9 })).toString("base64url");
  assert.deepEqual(decodeClaims(`${forged}.${mac}`, sec, now), []);
  assert.deepEqual(decodeClaims(`${data}.x`, sec, now), []);
  assert.deepEqual(decodeClaims(c, sec, now + 181 * 86_400_000), []);
  assert.deepEqual(decodeClaims(undefined, sec, now), []);
  assert.ok(!c.includes("wn_"), "no key material in the cookie");
});

test("claims list: newest first, unique, capped, bad ids dropped", () => {
  let ids: string[] = [];
  for (let i = 0; i < 12; i++) ids = addClaim(ids, `wnd_${i}`);
  assert.equal(ids.length, MAX_CLAIMS);
  assert.equal(ids[0], "wnd_11");
  assert.deepEqual(addClaim(["wnd_a", "wnd_b"], "wnd_b"), ["wnd_b", "wnd_a"]);
  assert.deepEqual(removeClaim(["wnd_a", "wnd_b"], "wnd_a"), ["wnd_b"]);
  assert.deepEqual(decodeClaims(encodeClaims(["wnd_ok", "../x", "wnd_ok"], sec, now), sec, now), ["wnd_ok"]);
});

test("pause validation", () => {
  assert.deepEqual(parsePause(null, now), { ok: true, until: null });
  const r = parsePause("2026-11-22T12:00:00Z", now);
  assert.ok(r.ok && r.until?.toISOString() === "2026-11-22T12:00:00.000Z");
  assert.deepEqual(parsePause("2026-11-20T12:00:00Z", now), { ok: true, until: null });
  assert.equal(parsePause("2200-01-01T00:00:00Z", now).ok, false);
  assert.equal(parsePause("tomorrow", now).ok, false);
  assert.equal(parsePause(123, now).ok, false);
  assert.equal(parsePause(undefined, now).ok, false);
  assert.ok(parsePause(pauseUntil("forever", now).toISOString(), now).ok);
  assert.ok(pausedForever(pauseUntil("forever", now), now));
  assert.ok(!pausedForever(pauseUntil("month", now), now));
  assert.equal(pauseUntil("week", now).toISOString(), "2026-11-28T12:00:00.000Z");
});

test("health emails skip test stations and paused alerts", () => {
  const base = { name: "Hill", at: new Date(now - 600_000), quiet: false, s: { microphone: { active: false } } };
  const rows = [
    { ...base, id: "wnd_on", test: false, alerts_paused_until: null },
    { ...base, id: "wnd_test", test: true, alerts_paused_until: null },
    { ...base, id: "wnd_paused", test: false, alerts_paused_until: new Date(now + 3600_000) },
    { ...base, id: "wnd_ended", test: false, alerts_paused_until: new Date(now - 3600_000) },
  ];
  const lines = problemLines(rows, now);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes("wnd_on") && lines[1].includes("wnd_ended"));
  assert.ok(!alertsWanted({ test: false, alerts_paused_until: new Date(now + 1) }, now));
});

test("a switched-off station is never reported, and shows as off to its owner", () => {
  const off = { id: "wnd_off", name: "Hill", at: new Date(now - 10 * 3600_000), quiet: true, s: { microphone: { active: false }, temperatureC: 90 }, test: false, alerts_paused_until: null };
  assert.deepEqual(problemLines([off], now), []);
  const hot = { ...off, id: "wnd_hot", at: new Date(now - 600_000), quiet: false, s: { temperatureC: 80 } };
  assert.equal(problemLines([hot], now).length, 1);
  assert.equal(onlineState(new Date(now - 10 * 60_000), now), "online");
  assert.equal(onlineState(new Date(now - (ONLINE_MINUTES + 1) * 60_000), now), "off");
  assert.equal(onlineState(null, now), "never");
});

test("app link tokens", () => {
  const sec = linkSecret("x"), other = claimSecret("x");
  const t = encodeLink("wnd_abc", sec, now);
  assert.equal(decodeLink(t, sec, now + 60_000), "wnd_abc");
  assert.equal(decodeLink(t, sec, now + LINK_MINUTES * 60_000 + 1), null);
  assert.equal(decodeLink(t, other, now), null);
  assert.equal(decodeLink(t.slice(0, -2) + "xx", sec, now), null);
  assert.equal(decodeLink(encodeClaims(["wnd_abc"], sec, now), sec, now), null);
  assert.equal(decodeLink(encodeLink("bad id", sec, now), sec, now), null);
  assert.equal(decodeLink(undefined, sec, now), null);
});

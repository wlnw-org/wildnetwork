import { test } from "node:test";
import assert from "node:assert/strict";
import { API, fetchSightings, mapSpecies, parseCreated, parseSightings, roundTo, toWdx, type AcartiaSighting } from "./acartia";
import { isDue } from "./schedule";
import { creditFor, isPublicNow } from "@/lib/sources";
import { validateWdx } from "@/lib/wdx/validate";

// Shaped like the live feed (October 2026), with personal fields filled with dummies: they must never reach the output.
const row = (o: Partial<AcartiaSighting> & Record<string, unknown> = {}): AcartiaSighting => ({
  ssemmi_id: "SPOTTER 262383", data_source_name: "Spotter-API", data_source_entity: "Conserve.io", data_source_id: 262383,
  created: "2026-10-15 20:35:45", photo_url: "https://example.org/p.jpg", no_sighted: 1, latitude: 38.94383, longitude: -123.73272,
  type: "Humpback", data_source_witness: "witness-username", trusted: 0,
  data_source_comments: "[Orca Network] Orcas southbound (A. Person)<br><br>Submitted by ... Via App\r\n",
  profile: { name: "spotter" }, entry_id: "3aee1aaa-0000-4000-8000-000000000001", ssemmi_date_added: "Sun Oct 18 2026 11:24:09 GMT+0000",
  submitter_did: "did:ethr:0xabc", signature: { r: "0x1", s: "0x2" }, ...o,
}) as AcartiaSighting;

test("parseCreated reads Acartia's offset-less time as UTC and keeps explicit offsets", () => {
  assert.equal(parseCreated("2026-10-15 20:35:45"), "2026-10-15T20:35:45.000Z");
  assert.equal(parseCreated("2026-10-15 20:35"), "2026-10-15T20:35:00.000Z");
  assert.equal(parseCreated("2026-10-15T20:35:45-07:00"), "2026-10-16T03:35:45.000Z");
  assert.equal(parseCreated("Sun Oct 18 2026"), null);
  assert.equal(parseCreated(undefined), null);
});

test("mapSpecies maps the editable table case-insensitively and keeps unknown names", () => {
  assert.deepEqual(mapSpecies("Orca"), { scientificName: "Orcinus orca", vernacularName: "Orca", mapped: true });
  assert.equal(mapSpecies("killer  whale").scientificName, "Orcinus orca");
  assert.equal(mapSpecies("Gray Whale").scientificName, "Eschrichtius robustus");
  assert.equal(mapSpecies("Minke Whale").scientificName, "Balaenoptera acutorostrata");
  assert.equal(mapSpecies("Dall's Porpoise").scientificName, "Phocoenoides dalli");
  assert.equal(mapSpecies("Pacific White-sided Dolphin").scientificName, "Lagenorhynchus obliquidens");
  assert.deepEqual(mapSpecies("Steller Sea Lion"), { vernacularName: "Steller Sea Lion", mapped: false });
  assert.deepEqual(mapSpecies(""), { vernacularName: "Unknown", mapped: false });
});

test("roundTo snaps to the grid without float noise", () => {
  assert.equal(roundTo(38.94383, 0.1), 38.9);
  assert.equal(roundTo(-123.73272, 0.1), -123.7);
  assert.equal(roundTo(48.0436, 0.1), 48);
  assert.equal(roundTo(49.26594, 1), 49);
  assert.equal(roundTo(48.0436, 0.01), 48.04);
});

test("toWdx: human observation, no invented model or confidence, count, trusted flag, rounded position, pending licence", () => {
  const m = toWdx(row({ type: "Orca", no_sighted: "3", trusted: 1, latitude: "48.0815", longitude: "-122.55516" }))!;
  const e = m.event;
  assert.equal(m.mapped, true);
  assert.equal(e.wdx, "0.3");
  assert.equal(e.eventId, "acartia:3aee1aaa-0000-4000-8000-000000000001");
  assert.equal(e.eventStart, "2026-10-15T20:35:45.000Z");
  assert.equal(e.detection.observationMethod, "human");
  assert.equal(e.detection.confidence, undefined);
  assert.equal(e.detection.classifier, undefined);
  assert.equal(e.detection.individualCount, 3);
  assert.equal(e.detection.scientificName, "Orcinus orca");
  assert.equal(e.deployment.latitude, 48.1);
  assert.equal(e.deployment.longitude, -122.6);
  assert.ok(e.deployment.coordinateUncertaintyMeters! > 7000);
  assert.deepEqual(e.source, { system: "acartia", sourceRecordId: "3aee1aaa-0000-4000-8000-000000000001", provider: "Conserve.io", trusted: true });
  assert.equal(e.license, "unknown-pending");
  assert.ok(validateWdx(e).ok, validateWdx(e).errors?.join("; "));
});

test("toWdx rounds only killer whales by default (src/config/sources.json)", () => {
  const humpback = toWdx(row({ type: "Humpback" }))!.event.deployment;
  assert.deepEqual([humpback.latitude, humpback.longitude, humpback.coordinateUncertaintyMeters], [38.94383, -123.73272, undefined]);
  const orca = toWdx(row({ type: "Killer Whale" }))!.event.deployment;
  assert.deepEqual([orca.latitude, orca.longitude], [38.9, -123.7]);
  assert.equal(toWdx(row({ type: "Humpback" }), 1)!.event.deployment.latitude, 39, "an explicit step overrides the config");
});

test("toWdx keeps no personal or signature fields, no photo and no comments", () => {
  const json = JSON.stringify(toWdx(row())!.event);
  for (const leak of ["witness-username", "did:ethr", "0xabc", "A. Person", "Submitted by", "<br>", "example.org", "spotter", "SPOTTER", "signature"]) {
    assert.ok(!json.includes(leak), `leaked ${leak}`);
  }
  assert.equal(toWdx(row())!.event.source.trusted, false);
});

test("toWdx keeps unmapped types as unranked with the raw name, still valid WDX", () => {
  const m = toWdx(row({ type: "Northern Elephant Seal" }))!;
  assert.equal(m.mapped, false);
  assert.equal(m.event.detection.scientificName, undefined);
  assert.equal(m.event.detection.taxonRank, "unranked");
  assert.equal(m.event.detection.vernacularName, "Northern Elephant Seal");
  assert.ok(validateWdx(m.event).ok);
});

test("toWdx rejects rows without id, time or a usable position", () => {
  assert.equal(toWdx(row({ entry_id: "" })), null);
  assert.equal(toWdx(row({ created: "" })), null);
  assert.equal(toWdx(row({ latitude: "abc" })), null);
  assert.equal(toWdx(row({ latitude: 91 })), null);
  assert.equal(toWdx(row({ no_sighted: 0 }))!.event.detection.individualCount, undefined);
});

test("parseSightings lists unmapped names, drops bad rows and duplicate ids, and is deterministic (idempotent re-polls)", () => {
  const feed = [row(), row({ entry_id: "b", type: "Orca" }), row({ entry_id: "c", type: "Sea Otter" }), row({ entry_id: "d", type: "Sea Otter" }), row({ entry_id: "b", type: "Orca" }), row({ entry_id: "" }), null];
  const a = parseSightings(feed), b = parseSightings(structuredClone(feed));
  assert.deepEqual(a.events.map((e) => e.eventId), ["acartia:3aee1aaa-0000-4000-8000-000000000001", "acartia:b", "acartia:c", "acartia:d"]);
  assert.deepEqual(a.unmapped, { "Sea Otter": 2 });
  assert.equal(a.skipped, 3);
  assert.deepEqual(a, b, "same feed, same events and ids: upserts replace rather than add");
  assert.deepEqual(parseSightings({ error: "x" }), { events: [], unmapped: {}, skipped: 0 });
});

test("fetchSightings sends a WildNetwork User-Agent and fails on HTTP errors (mocked, never the live API)", async () => {
  let seen: { url: string; ua: string | null } | null = null;
  const ok = (async (u: string, init: RequestInit) => {
    seen = { url: u, ua: new Headers(init.headers).get("user-agent") };
    return new Response(JSON.stringify([row()]));
  }) as unknown as typeof fetch;
  assert.equal(((await fetchSightings(ok)) as unknown[]).length, 1);
  assert.equal(seen!.url, API);
  assert.match(seen!.ua!, /^WildNetwork\/.+https:\/\/wildnetwork\.arunrajiah\.com/);
  await assert.rejects(fetchSightings((async () => new Response("busy", { status: 503 })) as unknown as typeof fetch), /acartia 503/);
});

test("isPublicNow holds Acartia and Orcasound killer whale records back 24 hours and nothing else", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(isPublicNow("acartia", "2026-10-19T12:30:00Z", "Orcinus orca", now), false);
  assert.equal(isPublicNow("acartia", "2026-10-19T12:00:00Z", "Orcinus orca", now), true);
  assert.equal(isPublicNow("acartia", "2026-10-20T11:00:00Z", "Megaptera novaeangliae", now), true, "only killer whales are delayed");
  assert.equal(isPublicNow("orcasound", "2026-10-20T11:00:00Z", "Cetacea", now), false);
  assert.equal(isPublicNow("orcasound", "2026-10-19T11:00:00Z", "Cetacea", now), true);
  assert.equal(isPublicNow("gbif", "2026-10-20T11:59:00Z", "Orcinus orca", now), true);
});

test("isDue polls every 30 minutes and backs off after an error", () => {
  const now = new Date("2026-10-20T12:00:00Z"), ago = (m: number) => new Date(now.getTime() - m * 60_000);
  assert.equal(isDue(30, null, null, now), true);
  assert.equal(isDue(30, ago(10), null, now), false);
  assert.equal(isDue(30, ago(30), null, now), true);
  assert.equal(isDue(30, ago(60), "acartia 503", now), false);
  assert.equal(isDue(30, ago(120), "acartia 503", now), true);
  assert.equal(isDue(undefined, ago(1), null, now), true);
});

test("creditFor names Acartia and the contributing platform", () => {
  assert.deepEqual(creditFor("acartia", "Conserve.io"), { text: "Data: Acartia (acartia.io), via Conserve.io / Whale Alert", url: "https://acartia.io" });
  assert.equal(creditFor("acartia", "Orca Network")?.text, "Data: Acartia (acartia.io), via Orca Network");
  assert.equal(creditFor("acartia", null)?.text, "Data: Acartia (acartia.io)");
  assert.equal(creditFor("gbif", "x"), null);
});

// Idempotent upsert against a real database: runs only with TEST_DATABASE_URL (a local throwaway database), never in CI.
test("ingesting the same sightings twice inserts once, then updates", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const { ingestEvents } = await import("@/lib/wdx/ingest");
  const { sql } = await import("@/lib/db");
  const ids = [`test-${Date.now()}-1`, `test-${Date.now()}-2`];
  const events = parseSightings(ids.map((id, i) => row({ entry_id: id, created: "2026-10-15 20:35:45", no_sighted: i + 1 }))).events;
  try {
    const first = await ingestEvents(events, { keepRaw: false });
    const again = await ingestEvents(parseSightings(ids.map((id, i) => row({ entry_id: id, no_sighted: i + 2 }))).events, { keepRaw: false });
    const rows = await sql<{ n: number; c: number }[]>`SELECT count(*)::int AS n, sum(individual_count)::int AS c FROM events WHERE event_id = ANY(${events.map((e) => e.eventId)})`;
    assert.deepEqual([first.inserted, first.updated, again.inserted, again.updated], [2, 0, 0, 2]);
    assert.deepEqual(rows[0], { n: 2, c: 5 }, "two rows, counts taken from the newer poll");
    const [r] = await sql`SELECT confidence, classifier_name, observation_method, latitude FROM events WHERE event_id = ${events[0].eventId}`;
    assert.deepEqual({ ...r }, { confidence: null, classifier_name: null, observation_method: "human", latitude: 38.94383 });
  } finally {
    await sql`DELETE FROM events WHERE event_id = ANY(${events.map((e) => e.eventId)})`;
    await sql.end();
  }
});

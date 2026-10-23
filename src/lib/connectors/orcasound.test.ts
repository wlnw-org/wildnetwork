import { test } from "node:test";
import assert from "node:assert/strict";
import { getJson, parseDetections, speciesFromDescription, toStation, type OrcaDetection, type OrcaFeed } from "./orcasound";
import { validateWdx } from "@/lib/wdx/validate";

// Shaped like the live API (October 2026).
const feed: OrcaFeed = { id: "feed_bush", attributes: { name: "Bush Point", slug: "bush-point", lat_lng: { lat: 48.0336664, lng: -122.6040035 }, visible: true } };
const hidden: OrcaFeed = { id: "feed_x", attributes: { name: "Point Robinson", slug: "point-robinson", location_point: { coordinates: [-122.37267, 47.388383] }, visible: false } };
const det = (id: string, attributes: OrcaDetection["attributes"], feedId = "feed_bush"): OrcaDetection =>
  ({ id, attributes: { timestamp: "2026-10-20T18:05:19.000000Z", listener_count: 0, description: null, ...attributes }, relationships: { feed: { data: { id: feedId } } } });

test("machine whale detections: OrcaHello, version unknown, no invented score, Cetacea at order level, hydrophone position", () => {
  const { events, counts } = parseDetections({ data: [det("det_1", { category: "whale", source: "machine" })] }, [feed]);
  const e = events[0];
  assert.equal(counts.whale, 1);
  assert.equal(e.eventId, "orcasound:det_1");
  assert.equal(e.eventStart, "2026-10-20T18:05:19.000Z");
  assert.deepEqual(e.detection.classifier, { name: "OrcaHello", version: "unknown" });
  assert.equal(e.detection.confidence, undefined);
  assert.equal(e.detection.observationMethod, "machine");
  assert.deepEqual([e.detection.scientificName, e.detection.taxonRank], ["Cetacea", "order"]);
  assert.deepEqual([e.deployment.latitude, e.deployment.longitude], [48.0336664, -122.6040035], "fixed public site, not rounded");
  assert.deepEqual(e.source, { system: "orcasound", sourceRecordId: "det_1", provider: "Bush Point", providerUrl: "https://live.orcasound.net/listen/bush-point" });
  assert.equal(e.license, "unknown-pending");
  assert.ok(validateWdx(e).ok, validateWdx(e).errors?.join("; "));
});

test("human detections are human observations; a species only when the listener names it plainly", () => {
  const { events } = parseDetections({ data: [
    det("h1", { category: "whale", source: "human", description: "J pod calls, lots of them" }),
    det("h2", { category: "whale", source: "human", description: "Faint calls" }),
    det("h3", { category: "whale", source: "human", description: "orca?" }),
    det("h4", { category: "whale", source: "human", description: "Humpback song" }),
  ] }, [feed]);
  assert.deepEqual(events.map((e) => [e.detection.observationMethod, e.detection.scientificName, e.detection.classifier]), [
    ["human", "Orcinus orca", undefined], ["human", "Cetacea", undefined], ["human", "Cetacea", undefined], ["human", "Megaptera novaeangliae", undefined],
  ]);
  for (const e of events) assert.ok(validateWdx(e).ok);
});

test("speciesFromDescription never guesses", () => {
  assert.equal(speciesFromDescription("Southern Residents passing"), "Orcinus orca");
  assert.equal(speciesFromDescription("killer whale clicks"), "Orcinus orca");
  assert.equal(speciesFromDescription("maybe orcas"), null);
  assert.equal(speciesFromDescription("not orca, boat"), null);
  assert.equal(speciesFromDescription("calls"), null);
  assert.equal(speciesFromDescription(null), null);
});

test("vessel detections are counted, other and broken ones skipped, duplicates dropped (idempotent)", () => {
  const body = { data: [
    det("d1", { category: "whale", source: "machine" }), det("d1", { category: "whale", source: "machine" }),
    det("v1", { category: "vessel", source: "human", description: "Squeaky ship" }), det("o1", { category: "other", source: "human", description: "Train" }),
    det("n1", { category: "whale", source: "machine" }, "feed_missing"), det("t1", { category: "whale", source: "machine", timestamp: "soon" }),
  ] };
  const a = parseDetections(body, [feed]), b = parseDetections(structuredClone(body), [feed]);
  assert.deepEqual(a.events.map((e) => e.eventId), ["orcasound:d1"]);
  assert.deepEqual(a.counts, { whale: 1, vessel: 1, other: 1, invalid: 2 });
  assert.deepEqual(a, b, "same response, same ids: re-polls upsert");
});

test("feeds become stations; included feeds are used when /feeds misses one", () => {
  assert.deepEqual(toStation(hidden), { deploymentId: "point-robinson", name: "Point Robinson", latitude: 47.388383, longitude: -122.37267, sensorType: "acoustic-recorder", sensorModel: "Orcasound hydrophone" });
  const { events } = parseDetections({ data: [det("i1", { category: "whale", source: "machine" }, "feed_x")], included: [hidden] }, []);
  assert.equal(events[0].deployment.deploymentId, "point-robinson");
});

test("getJson retries server errors with backoff and sends a Wildlife Network User-Agent (mocked)", async () => {
  let calls = 0, ua = "";
  const flaky = (async (_u: string, init: RequestInit) => { calls++; ua = new Headers(init.headers).get("user-agent") ?? ""; return calls < 2 ? new Response("down", { status: 502 }) : new Response("{\"data\":[]}"); }) as unknown as typeof fetch;
  assert.deepEqual(await getJson("https://live.orcasound.net/api/json/feeds", flaky), { data: [] });
  assert.equal(calls, 2);
  assert.match(ua, /^WildlifeNetwork\//);
  let n = 0;
  await assert.rejects(getJson("https://live.orcasound.net/api/json/feeds", (async () => { n++; return new Response("no", { status: 404 }); }) as unknown as typeof fetch), /404/);
  assert.equal(n, 1, "client errors are not retried");
});

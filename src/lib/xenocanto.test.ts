import { test } from "node:test";
import assert from "node:assert/strict";
import { areaFor, buildQuery, creditLine, fetchClips, licenseInfo, parseLength, parseNear, parseResponse, pickNear, rankClips, XcError, type XcClip } from "./xenocanto";

const rec = (o: Record<string, unknown> = {}) => ({
  id: "100", gen: "Eudynamys", sp: "scolopaceus", status: "identified", rec: "A. Recordist", cnt: "India", loc: "Guindy, Chennai",
  type: "song", q: "A", length: "0:30", url: "https://xeno-canto.org/100", file: "https://xeno-canto.org/100/download",
  sono: { small: "https://xeno-canto.org/sounds/spectrograms/X/100/grey-small.png", med: "https://xeno-canto.org/sounds/spectrograms/X/100/grey-medium.png" },
  lic: "https://creativecommons.org/licenses/by-nc-sa/4.0/", ...o,
});
const page = (...recordings: unknown[]) => ({ numRecordings: String(recordings.length), numSpecies: "1", page: 1, numPages: 1, recordings });
const NAME = "Eudynamys scolopaceus";

test("buildQuery uses gen, sp, grp and quality A or B, plus area when given", () => {
  assert.equal(buildQuery(NAME, "avian", "asia"), 'gen:eudynamys sp:scolopaceus grp:birds q:">C" area:asia');
  assert.equal(buildQuery(NAME, null, null), 'gen:eudynamys sp:scolopaceus grp:birds q:">C"');
  assert.equal(buildQuery("Pipistrellus pipistrellus", "bat", null), 'gen:pipistrellus sp:pipistrellus grp:bats q:">C"');
  assert.equal(buildQuery("Eudynamys", "avian", null), null);
  assert.equal(buildQuery("Foo bar", "other", null), null);
  assert.equal(buildQuery('Foo "bar', "avian", null), null);
});

test("areaFor maps coordinates to XC world areas", () => {
  assert.equal(areaFor(80.27, 13.08), "asia"); // Chennai
  assert.equal(areaFor(-0.1, 51.5), "europe");
  assert.equal(areaFor(36.8, -1.3), "africa");
  assert.equal(areaFor(-74, 40.7), "america");
  assert.equal(areaFor(151.2, -33.9), "australia");
});

test("parseLength", () => {
  assert.equal(parseLength("4:08"), 248);
  assert.equal(parseLength("1:02:03"), 3723);
  assert.equal(parseLength("0:07"), 7);
  assert.equal(parseLength(""), null);
  assert.equal(parseLength("abc"), null);
});

test("licenseInfo names every CC variant and keeps the URL", () => {
  assert.deepEqual(licenseInfo("https://creativecommons.org/licenses/by-nc-sa/4.0/"), { name: "CC BY-NC-SA 4.0", url: "https://creativecommons.org/licenses/by-nc-sa/4.0/" });
  assert.equal(licenseInfo("//creativecommons.org/licenses/by-nc-nd/2.5/")?.name, "CC BY-NC-ND 2.5");
  assert.equal(licenseInfo("//creativecommons.org/licenses/by-nc-nd/2.5/")?.url, "https://creativecommons.org/licenses/by-nc-nd/2.5/");
  assert.equal(licenseInfo("https://creativecommons.org/licenses/by/4.0/")?.name, "CC BY 4.0");
  assert.equal(licenseInfo("https://creativecommons.org/licenses/by-sa/3.0/")?.name, "CC BY-SA 3.0");
  assert.equal(licenseInfo("https://creativecommons.org/licenses/by-nd/4.0/")?.name, "CC BY-ND 4.0");
  assert.equal(licenseInfo("https://creativecommons.org/publicdomain/zero/1.0/")?.name, "CC0 1.0");
  assert.equal(licenseInfo("https://example.com/all-rights-reserved"), null);
  assert.equal(licenseInfo(undefined), null);
});

test("creditLine joins recordist, place and country and skips blanks", () => {
  assert.equal(creditLine({ recordist: "A. Recordist", location: "Guindy, Chennai", country: "India" }), "A. Recordist, Guindy, Chennai, India");
  assert.equal(creditLine({ recordist: "A. Recordist", location: " ", country: "India" }), "A. Recordist, India");
});

test("parseResponse keeps playable, licensed, identified recordings of the right species", () => {
  const clips = parseResponse(page(
    rec(),
    rec({ id: "101", file: "", _meta: { redacted_fields: { file: "restricted_species" } } }),
    rec({ id: "102", status: "questioned" }),
    rec({ id: "103", sp: "other" }),
    rec({ id: "104", lic: "https://example.com/proprietary" }),
    rec({ id: "105", file: "https://evil.example/x.mp3" }),
    rec({ id: "106", file: "//xeno-canto.org/106/download", url: "//xeno-canto.org/106", sono: {} }),
  ), NAME);
  assert.deepEqual(clips.map((c) => c.id), ["100", "106"]);
  const [c, d] = clips;
  assert.equal(c.file, "https://xeno-canto.org/100/download");
  assert.equal(c.url, "https://xeno-canto.org/100");
  assert.equal(c.sonogram, "https://xeno-canto.org/sounds/spectrograms/X/100/grey-medium.png");
  assert.equal(c.seconds, 30);
  assert.equal(c.license.name, "CC BY-NC-SA 4.0");
  assert.equal(c.recordist, "A. Recordist");
  assert.equal(d.file, "https://xeno-canto.org/106/download");
  assert.equal(d.sonogram, null);
});

test("parseResponse handles empty and malformed payloads", () => {
  assert.deepEqual(parseResponse(page(), NAME), []);
  assert.deepEqual(parseResponse(null, NAME), []);
  assert.deepEqual(parseResponse({ error: "client_error" }, NAME), []);
  assert.deepEqual(parseResponse({ recordings: "nope" }, NAME), []);
});

const clip = (id: string, quality: string, type: string, seconds: number | null, recordist = `R${id}`): XcClip => ({
  id, quality, type, seconds, url: "", file: "", sonogram: null, recordist, location: "", country: "", license: { name: "CC BY 4.0", url: "" },
});

test("rankClips prefers two different recordists, but falls back to one", () => {
  assert.deepEqual(rankClips([clip("1", "A", "song", 30, "X"), clip("2", "A", "song", 30, "X"), clip("3", "A", "song", 50, "Y")], "avian").map((c) => c.id), ["1", "3"]);
  assert.deepEqual(rankClips([clip("1", "A", "song", 30, "X"), clip("2", "A", "song", 31, "X")], "avian").map((c) => c.id), ["1", "2"]);
});

test("rankClips: quality first, then type, then length", () => {
  const r = rankClips([clip("1", "B", "song", 20), clip("2", "A", "call", 20), clip("3", "A", "song", 300), clip("4", "A", "song", 20)], "avian", 4);
  assert.deepEqual(r.map((c) => c.id), ["4", "3", "2", "1"]);
  assert.deepEqual(rankClips([clip("1", "A", "alarm call", 20), clip("2", "A", "call, song", 20)], "avian").map((c) => c.id), ["2", "1"]);
  assert.deepEqual(rankClips([clip("1", "A", "song", 2), clip("2", "A", "song", 40)], "avian").map((c) => c.id), ["2", "1"]);
  assert.deepEqual(rankClips([clip("1", "A", "song", 5), clip("2", "A", "song", 6), clip("3", "A", "song", 25), clip("4", "A", "song", 50)], "avian").map((c) => c.id), ["3", "4"]);
  assert.deepEqual(rankClips([clip("1", "A", "social call", 10), clip("2", "A", "echolocation", 10)], "bat").map((c) => c.id), ["2", "1"]);
  assert.equal(rankClips([clip("1", "A", "song", 1), clip("2", "A", "song", 2), clip("3", "A", "song", 3)], "avian").length, 2);
});

/** Mock XC: answers by whether the query has an area tag. Records every URL so tests can check what was sent. */
function mockXc(byArea: unknown, anyArea: unknown, status = 200) {
  const urls: string[] = [];
  const f = (async (u: string) => {
    urls.push(u);
    const body = decodeURIComponent(u).includes("area:") ? byArea : anyArea;
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { f, urls };
}

test("fetchClips prefers the area and tops up from anywhere", async () => {
  const { f, urls } = mockXc(page(rec({ id: "1" })), page(rec({ id: "1" }), rec({ id: "2", q: "B" })));
  const clips = await fetchClips(NAME, "avian", "asia", "secret", f);
  assert.deepEqual(clips.map((c) => c.id), ["1", "2"]);
  assert.equal(urls.length, 2);
  assert.ok(urls[0].startsWith("https://xeno-canto.org/api/3/recordings?query="));
  assert.ok(urls[0].includes("key=secret") && urls[0].includes("per_page=100"));
  for (const u of urls) assert.ok(!/lat:|lon:|box:/.test(decodeURIComponent(u)), "never sends coordinates");
});

test("fetchClips skips the fallback when the area already has two", async () => {
  const { f, urls } = mockXc(page(rec({ id: "1" }), rec({ id: "2" })), page());
  assert.equal((await fetchClips(NAME, "avian", "asia", "k", f)).length, 2);
  assert.equal(urls.length, 1);
});

test("fetchClips without an area makes one call and returns [] when XC has nothing", async () => {
  const { f, urls } = mockXc(page(), page());
  assert.deepEqual(await fetchClips(NAME, "avian", null, "k", f), []);
  assert.equal(urls.length, 1);
  assert.ok(!decodeURIComponent(urls[0]).includes("area:"));
});

test("fetchClips throws XcError on XC errors and network failures, so they are not cached", async () => {
  await assert.rejects(fetchClips(NAME, "avian", null, "bad", mockXc({}, { error: "client_error", message: "Missing or invalid 'key'" }, 400).f), XcError);
  await assert.rejects(fetchClips(NAME, "avian", null, "k", mockXc({}, { error: { code: "server_error", message: "x" } }, 200).f), XcError);
  await assert.rejects(fetchClips(NAME, "avian", null, "k", (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch), XcError);
  await assert.rejects(fetchClips(NAME, "avian", null, "k", (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch), XcError);
});

test("fetchClips does not call XC for classes it does not cover", async () => {
  const { f, urls } = mockXc(page(), page());
  assert.deepEqual(await fetchClips("Foo bar", "other", "asia", "k", f), []);
  assert.equal(urls.length, 0);
});

test("parseResponse reads recording coordinates as numbers, accepting lon or lng and dropping bad values", () => {
  const [a, b, c] = parseResponse(page(
    rec({ id: "1", lat: "13.0067", lon: "80.2206" }),
    rec({ id: "2", lat: 14.5, lng: "121.0" }),
    rec({ id: "3", lat: "", lon: "999" }),
  ), NAME);
  assert.deepEqual([a.lat, a.lon], [13.0067, 80.2206]);
  assert.deepEqual([b.lat, b.lon], [14.5, 121]);
  assert.deepEqual([c.lat, c.lon], [null, null]);
});

test("parseNear rounds to whole degrees and rejects anything else", () => {
  assert.deepEqual(parseNear("13.08,80.27"), { lat: 13, lon: 80 });
  assert.deepEqual(parseNear("-33.9,151.2"), { lat: -34, lon: 151 });
  for (const bad of [null, "", "13", "91,0", "0,181", "13,80;drop", "abc,def"]) assert.equal(parseNear(bad), null);
});

/** A pooled clip with a country and coordinates, already in quality order. */
const at = (id: string, country: string, lat: number | null, lon: number | null, recordist = `R${id}`): XcClip =>
  ({ ...clip(id, "A", "song", 30), country, lat, lon, recordist });

test("pickNear puts the country of the nearest recording first (Chennai gets India, not the Philippines)", () => {
  const pool = [at("ph1", "Philippines", 14.6, 121.0), at("ph2", "Philippines", 15.0, 120.5), at("in1", "India", 12.97, 77.59), at("in2", "India", 19.07, 72.88)];
  assert.deepEqual(pickNear(pool, { lat: 13, lon: 80 }).map((c) => c.id), ["in1", "in2"]);
  assert.deepEqual(pickNear(pool, { lat: 15, lon: 121 }).map((c) => c.id), ["ph1", "ph2"]);
});

test("pickNear tops up from other countries and keeps pool order without a point or coordinates", () => {
  const pool = [at("ph1", "Philippines", 14.6, 121.0), at("in1", "India", 12.97, 77.59)];
  assert.deepEqual(pickNear(pool, { lat: 13, lon: 80 }).map((c) => c.id), ["in1", "ph1"]);
  assert.deepEqual(pickNear(pool, null).map((c) => c.id), ["ph1", "in1"]);
  const noCoords = [at("a", "Philippines", null, null), at("b", "India", null, null)];
  assert.deepEqual(pickNear(noCoords, { lat: 13, lon: 80 }).map((c) => c.id), ["a", "b"]);
  assert.deepEqual(pickNear([], { lat: 13, lon: 80 }), []);
});

test("pickNear still prefers two different recordists within the country", () => {
  const pool = [at("in1", "India", 13, 80, "Same"), at("in2", "India", 13.1, 80.1, "Same"), at("in3", "India", 12, 77, "Other")];
  assert.deepEqual(pickNear(pool, { lat: 13, lon: 80 }).map((c) => c.id), ["in1", "in3"]);
});

test("fetchClips with a pool size makes no extra XC call when the area already has two", async () => {
  const { f, urls } = mockXc(page(rec({ id: "1" }), rec({ id: "2" }), rec({ id: "3", rec: "B" })), page());
  const pool = await fetchClips(NAME, "avian", "asia", "secret", f, 4000, 24);
  assert.deepEqual(pool.map((c) => c.id).sort(), ["1", "2", "3"]);
  assert.equal(urls.length, 1);
});

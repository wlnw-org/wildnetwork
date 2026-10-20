import { test } from "node:test";
import assert from "node:assert/strict";
import { bbox, eventTimes, groupFor, licenceClass, nextRegion, pageUrl, parsePage, toWdx, type ObisRecord } from "./obis";
import { SOURCES } from "@/lib/sources";
import { validateWdx } from "@/lib/wdx/validate";

// Shaped like api.obis.org/v3/occurrence results (October 2026), India box.
const rec = (o: Partial<ObisRecord> = {}): ObisRecord => ({
  id: "0005a515-297b-4f85-896f-1b0a956b2ab4", occurrenceID: "urn:catalog:CMFRI:Fish:123", scientificName: "Sardinella longiceps",
  eventDate: "2026-03-04T17:47:00+05:30", date_start: 1772582400000, date_mid: 1772582400000, date_end: 1772582400000,
  decimalLatitude: 9.93456, decimalLongitude: 76.25912, basisOfRecord: "HumanObservation", license: "https://creativecommons.org/licenses/by/4.0/",
  dataset_id: "eaea291a-1e1d-4382-b86f-ac3cc15b8d5a", datasetName: "Fish landings of Kerala", institutionCode: "CMFRI", taxonRank: "Species",
  individualCount: 12, coordinateUncertaintyInMeters: 210, genus: "Sardinella", family: "Clupeidae", order: "Clupeiformes", class: "Teleostei",
  absence: false, dropped: false, ...o,
});
const none = () => false;

test("licenceClass routes CC0 and CC BY to open data, CC BY-NC to noncommercial, and rejects the rest", () => {
  assert.equal(licenceClass("https://creativecommons.org/publicdomain/zero/1.0/"), "cc0");
  assert.equal(licenceClass("https://creativecommons.org/licenses/by/4.0/"), "cc-by");
  assert.equal(licenceClass("CC-BY 4.0"), "cc-by");
  assert.equal(licenceClass("https://creativecommons.org/licenses/by-nc/4.0/"), "cc-by-nc");
  for (const l of ["https://creativecommons.org/licenses/by-sa/4.0/", "https://creativecommons.org/licenses/by-nc-sa/4.0/", "https://creativecommons.org/licenses/by-nd/4.0/", "All rights reserved", "", undefined]) assert.equal(licenceClass(l), null, String(l));
});

test("toWdx: human observation with dataset credit, dedupe ids and its own licence", () => {
  const m = toWdx(rec(), none);
  const e = m.event!;
  assert.equal(e.eventId, "obis:0005a515-297b-4f85-896f-1b0a956b2ab4");
  assert.equal(e.eventStart, "2026-03-04T12:17:00.000Z");
  assert.equal(e.detection.observationMethod, "human");
  assert.equal(e.detection.classifier, undefined);
  assert.equal(e.detection.confidence, undefined);
  assert.equal(e.detection.individualCount, 12);
  assert.equal(e.detection.taxonRank, "species");
  assert.deepEqual([e.deployment.latitude, e.deployment.longitude, e.deployment.coordinateUncertaintyMeters], [9.93456, 76.25912, 210]);
  assert.deepEqual(e.source, { system: "obis", sourceRecordId: "0005a515-297b-4f85-896f-1b0a956b2ab4", provider: "Fish landings of Kerala",
    providerUrl: "https://obis.org/dataset/eaea291a-1e1d-4382-b86f-ac3cc15b8d5a", occurrenceId: "urn:catalog:CMFRI:Fish:123", institutionCode: "CMFRI" });
  assert.equal(e.license, "https://creativecommons.org/licenses/by/4.0/");
  assert.equal(m.nc, false);
  assert.ok(validateWdx(e).ok, validateWdx(e).errors?.join("; "));
});

test("toWdx: MachineObservation is a machine record with an unspecified model, never an invented one", () => {
  const e = toWdx(rec({ basisOfRecord: "MachineObservation" }), none).event!;
  assert.equal(e.detection.observationMethod, "machine");
  assert.deepEqual(e.detection.classifier, { name: "unspecified", version: "unknown" });
  assert.equal(e.detection.confidence, undefined);
  assert.ok(validateWdx(e).ok);
});

test("toWdx: CC BY-NC kept and flagged; other licences, absences and incomplete records skipped", () => {
  const nc = toWdx(rec({ license: "https://creativecommons.org/licenses/by-nc/4.0/" }), none);
  assert.equal(nc.nc, true);
  assert.equal(nc.event!.license, "https://creativecommons.org/licenses/by-nc/4.0/");
  assert.equal(toWdx(rec({ license: "https://creativecommons.org/licenses/by-sa/4.0/" }), none).skipped, "licence");
  assert.equal(toWdx(rec({ absence: true }), none).skipped, "absence");
  assert.equal(toWdx(rec({ decimalLatitude: undefined }), none).skipped, "invalid");
  assert.equal(toWdx(rec({ eventDate: "", date_mid: undefined, date_start: undefined }), none).skipped, "invalid");
});

test("sensitive taxa (sea turtles, dugong, sawfishes) are rounded to 0.1 degree with an honest uncertainty", () => {
  const turtle = toWdx(rec({ scientificName: "Chelonia mydas", genus: "Chelonia", family: "Cheloniidae" })).event!;
  assert.deepEqual([turtle.deployment.latitude, turtle.deployment.longitude], [9.9, 76.3]);
  assert.ok(turtle.deployment.coordinateUncertaintyMeters! >= 7000);
  const sawfish = toWdx(rec({ scientificName: "Pristis zijsron", family: "Pristidae" })).event!;
  assert.equal(sawfish.deployment.latitude, 9.9);
  assert.equal(toWdx(rec()).event!.deployment.latitude, 9.93456, "a sardine is not sensitive");
});

test("eventTimes uses the published date-time, else the middle of a date range", () => {
  assert.deepEqual(eventTimes(rec()), { start: "2026-03-04T12:17:00.000Z" });
  assert.deepEqual(eventTimes(rec({ eventDate: "2025-01/2025-12", date_start: 1735689600000, date_mid: 1750000000000, date_end: 1764460800000 })),
    { start: new Date(1750000000000).toISOString(), end: new Date(1764460800000).toISOString() });
  assert.deepEqual(eventTimes(rec({ eventDate: "2026-03-04", date_mid: 1772582400000, date_end: 1772582400000, date_start: 1772582400000 })), { start: "2026-03-04T00:00:00.000Z" });
});

test("groupFor keeps seabirds as birds and puts other OBIS taxa in marine", () => {
  assert.equal(groupFor(rec({ class: "Aves" })), "avian");
  assert.equal(groupFor(rec({ class: "Mammalia" })), "marine");
  assert.equal(groupFor(rec({ class: undefined })), "marine");
});

test("nextRegion: India first, then global, restarting each day, stopping at the caps", () => {
  const cfg = { ...SOURCES.obis, maxRows: 100, regions: [{ name: "india", geometry: "POLYGON((76 5,85 5,85 16,76 16,76 5))", days: 365, maxRows: 40 }, { name: "global", geometry: null, days: 365, maxRows: 80 }] };
  const day = "2026-10-21";
  const pick = (cursor = {}, total = 0, india = 0, global = 0) => nextRegion(cfg, cursor, { total, byRegion: { india, global } }, day);
  assert.deepEqual(pick(), { region: cfg.regions[0], after: null });
  assert.deepEqual(pick({ india: { after: "x1", day, done: false } }), { region: cfg.regions[0], after: "x1" });
  assert.deepEqual(pick({ india: { after: "x1", day: "2026-10-20", done: true } }), { region: cfg.regions[0], after: null }, "a new day restarts the walk");
  assert.deepEqual(pick({ india: { after: "z", day, done: true } }), { region: cfg.regions[1], after: null });
  assert.deepEqual(pick({}, 40, 40, 0), { region: cfg.regions[1], after: null }, "region cap reached");
  assert.deepEqual(pick({}, 100, 40, 60), { stop: "row cap reached (100 of 100)" });
  assert.deepEqual(pick({ india: { after: "z", day, done: true }, global: { after: "y", day, done: true } }), { stop: "all regions done for today" });
});

test("pageUrl asks for the window, region, page and only the fields used", () => {
  const u = new URL(pageUrl(SOURCES.obis.regions[0], "abc", 1000, "2026-10-21"));
  assert.equal(u.origin + u.pathname, "https://api.obis.org/v3/occurrence");
  assert.equal(u.searchParams.get("startdate"), "2025-10-21");
  assert.equal(u.searchParams.get("geometry"), "POLYGON((76 5,85 5,85 16,76 16,76 5))");
  assert.equal(u.searchParams.get("after"), "abc");
  assert.ok(u.searchParams.get("fields")!.split(",").includes("license"));
  assert.equal(new URL(pageUrl(SOURCES.obis.regions[1], null, 1000, "2026-10-21")).searchParams.get("geometry"), null);
  assert.deepEqual(bbox("POLYGON((76 5,85 5,85 16,76 16,76 5))"), [76, 5, 85, 16]);
});

test("parsePage counts what it skips and is deterministic, so re-runs upsert the same ids", () => {
  const body = { total: 4, results: [rec(), rec({ id: "b", license: "https://creativecommons.org/licenses/by-nc/4.0/" }), rec({ id: "c", license: "x" }), rec({ id: "d", absence: true })] };
  const a = parsePage(body), b = parsePage(structuredClone(body));
  assert.deepEqual(a.events.map((e) => e.eventId), ["obis:0005a515-297b-4f85-896f-1b0a956b2ab4", "obis:b"]);
  assert.deepEqual(a.skipped, { licence: 1, absence: 1, invalid: 0 });
  assert.equal(a.nc, 1);
  assert.equal(a.lastId, "d");
  assert.deepEqual(a.events, b.events);
  assert.equal(parsePage({ results: [] }).lastId, null);
});

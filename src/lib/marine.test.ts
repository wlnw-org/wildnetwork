import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeKey, splitDuplicates } from "./dedupe";
import { isSensitiveTaxon, parseSensitiveTaxa } from "./sensitiveTaxa";
import { DELAYS, PENDING_SOURCES, SOURCES, creditFor, roundingFor } from "./sources";

test("dedupeKey matches iNaturalist observations across aggregators and other records on occurrenceID plus institution", () => {
  assert.equal(dedupeKey("inaturalist", "341241858"), "inaturalist:341241858");
  assert.equal(dedupeKey("obis", "x", "https://www.inaturalist.org/observations/341241858", "iNaturalist"), "inaturalist:341241858");
  assert.equal(dedupeKey("gbif", "1", "urn:catalog:CMFRI:Fish:123", "CMFRI"), dedupeKey("obis", "a", " URN:catalog:CMFRI:Fish:123 ", "cmfri"));
  assert.notEqual(dedupeKey("gbif", "1", "123", "A"), dedupeKey("obis", "a", "123", "B"), "same occurrenceID, different institution");
  assert.equal(dedupeKey("obis", "a", null, "CMFRI"), null);
  assert.equal(dedupeKey("acartia", "e1"), null);
});

test("splitDuplicates keeps one record per occurrence, never merging a source into itself", () => {
  const existing = new Map([["k1", { event_id: "gbif:1", source_system: "gbif" }], ["k2", { event_id: "obis:2", source_system: "obis" }]]);
  const rows = [
    { event_id: "obis:a", dedupe_key: "k1", source_system: "obis" },
    { event_id: "obis:2", dedupe_key: "k2", source_system: "obis" },
    { event_id: "obis:b", dedupe_key: null, source_system: "obis" },
  ];
  const { fresh, merged } = splitDuplicates(rows, existing);
  assert.deepEqual(fresh.map((r) => r.event_id), ["obis:2", "obis:b"], "re-polling OBIS updates its own row");
  assert.deepEqual(merged.map((m) => [m.row.event_id, m.into]), [["obis:a", "gbif:1"]]);
});

test("sensitive taxa match species, genus or family names", () => {
  const taxa = parseSensitiveTaxa("# x\nCheloniidae\nDermochelyidae\nDugong dugon\nPristidae\n");
  assert.ok(isSensitiveTaxon(["Chelonia mydas", "Chelonia", "Cheloniidae"], taxa));
  assert.ok(isSensitiveTaxon(["Dugong dugon"], taxa));
  assert.ok(isSensitiveTaxon(["Pristis pristis", null, "pristidae"], taxa));
  assert.ok(!isSensitiveTaxon(["Megaptera novaeangliae", "Megaptera", "Balaenopteridae"], taxa));
});

test("the shared config sets pending licences, delays and credits", () => {
  assert.deepEqual([...PENDING_SOURCES].sort(), ["acartia", "orcasound"]);
  assert.ok(!PENDING_SOURCES.includes("obis") && !PENDING_SOURCES.includes("birdweather"));
  assert.deepEqual(DELAYS.map(([s]) => s).sort(), ["acartia", "orcasound"]);
  assert.equal(roundingFor("acartia", "Orcinus orca"), 0.1);
  assert.equal(roundingFor("acartia", "Megaptera novaeangliae"), null);
  assert.equal(roundingFor("orcasound", "Cetacea"), null, "hydrophones are fixed public sites");
  assert.ok(SOURCES.obis.maxRows > 0 && SOURCES.obis.regions.some((r) => r.name === "india"));
  assert.deepEqual(creditFor("obis", "Indian Ocean fish survey", "https://obis.org/dataset/abc"), { text: "Data: OBIS (obis.org), dataset Indian Ocean fish survey", url: "https://obis.org/dataset/abc" });
  assert.deepEqual(creditFor("orcasound", "Bush Point", "https://live.orcasound.net/listen/bush-point"), { text: "Data: Orcasound (orcasound.net), Bush Point hydrophone", url: "https://live.orcasound.net/listen/bush-point" });
});

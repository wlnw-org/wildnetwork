import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedId, stationIdFromSlug, stationSlug, validTimeZone } from "./stationIds";

test("station slugs round trip", () => {
  for (const id of ["wildnetwork-base:29ab78f229b9", "orcasound:orcasound-lab", "birdnet-go:My Garden/2", "other:a~b:c"]) {
    assert.equal(stationIdFromSlug(stationSlug(id)), id);
    // The router may hand the segment over decoded or not: both parse.
    if (!id.includes("%")) assert.equal(stationIdFromSlug(decodeURIComponent(stationSlug(id))), id);
  }
  assert.equal(stationSlug("wildnetwork-base:29ab78f229b9"), "wildnetwork-base~29ab78f229b9");
  assert.equal(stationIdFromSlug("wildnetwork-base:29ab78f229b9"), "wildnetwork-base:29ab78f229b9");
  assert.equal(stationIdFromSlug("group"), null);
  assert.equal(stationIdFromSlug("~x"), null);
});

test("sources without station pages are refused", () => {
  for (const s of ["birdweather", "inaturalist", "gbif", "obis", "acartia"]) assert.equal(allowedId(`${s}:1`), false);
  assert.equal(allowedId("wildnetwork-base:1"), true);
});

test("time zones are validated", () => {
  assert.ok(validTimeZone("Asia/Kolkata"));
  assert.ok(!validTimeZone("Nowhere/Land"));
  assert.ok(!validTimeZone("UTC'; DROP"));
});

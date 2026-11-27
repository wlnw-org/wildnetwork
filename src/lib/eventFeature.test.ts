import { test } from "node:test";
import assert from "node:assert/strict";
import { toFeature } from "./eventFeature";
import { isSensitiveName } from "./sensitiveTaxa";

const row = (sci: string) => ({ event_id: "wdx:1", event_start: "2026-11-27T10:00:00Z", scientific_name: sci, latitude: 12.3456, longitude: 77.6543, source_system: "wdx-agent", deployment_id: "wdx-agent:cam07", n: 1 });

test("species in a listed family match through their genus", () => {
  assert.equal(isSensitiveName("Manis crassicaudata"), true);
  assert.equal(isSensitiveName("Chelonia mydas"), true);
  assert.equal(isSensitiveName("Panthera tigris"), true);
  assert.equal(isSensitiveName("Turdus merula"), false);
});

test("protected species are rounded to whole degrees with no station", () => {
  const f = toFeature(row("Manis crassicaudata"));
  assert.deepEqual(f.geometry.coordinates, [78, 12]);
  assert.equal(f.properties.deployment, undefined);
  assert.equal(f.properties.rounded, 1);
});

test("other species keep their position and station", () => {
  const f = toFeature(row("Axis axis"));
  assert.deepEqual(f.geometry.coordinates, [77.6543, 12.3456]);
  assert.equal(f.properties.deployment, "wdx-agent:cam07");
});

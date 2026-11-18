import { test } from "node:test";
import assert from "node:assert/strict";
import { eventRow } from "./ingest";
import { validateWdx } from "./validate";
import type { WdxEvent } from "./types";

// What wdx-agent builds from a current BirdNET-Go database (tables detections + labels + ai_models), as on a
// Wildlife Network Base: confidence, start and end, the clip file name, and the test flag at the top level.
const fromDetectionsLayout = {
  wdx: "0.2",
  eventId: "birdnet-go:wnb_test:4182",
  eventStart: "2026-11-19T05:41:12Z",
  eventEnd: "2026-11-19T05:41:15Z",
  deployment: { deploymentId: "wnb_test", latitude: 13.08, longitude: 80.27, sensorType: "acoustic-recorder", sensorModel: "wildnetwork-base" },
  detection: { scientificName: "Psittacula krameri", vernacularName: "Rose-ringed Parakeet", taxonRank: "species", confidence: 0.9132,
    classifier: { name: "BirdNET", version: "2.4" } },
  media: { mediaType: "audio", fileName: "psittacula_krameri_91p_20261119T054112Z.flac" },
  source: { system: "birdnet-go", systemVersion: "wdx-agent/0.4.3", sourceRecordId: "4182" },
  license: "CC-BY-4.0",
  test: true,
};

test("an event from BirdNET-Go's detections layout is accepted", () => {
  const v = validateWdx(fromDetectionsLayout);
  assert.equal(v.ok, true, (v.errors ?? []).join("; "));
});

test("no field from the detections layout is lost on the way into the events table", () => {
  const row = eventRow(fromDetectionsLayout as unknown as WdxEvent);
  assert.equal(row.confidence, 0.9132);
  assert.equal(row.event_start, "2026-11-19T05:41:12Z");
  assert.equal(row.event_end, "2026-11-19T05:41:15Z");
  assert.equal(row.media_file, "psittacula_krameri_91p_20261119T054112Z.flac");
  assert.equal(row.media_type, "audio");
  assert.equal(row.scientific_name, "Psittacula krameri");
  assert.equal(row.classifier_name, "BirdNET");
  assert.equal(row.deployment_id, "birdnet-go:wnb_test");
});

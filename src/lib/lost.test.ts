import { test } from "node:test";
import assert from "node:assert/strict";
import { listedNames, matchLost, nameKeys } from "./lostNames";

const names = new Map<string, number>([
  ["rhinoptilus bitorquatus", 1],          // a lost species
  ["aerodramus spodiopygius ingens", 2],   // a lost subspecies of a common species
]);

test("a lost species matches whatever the case and spacing", () => {
  assert.equal(matchLost("Rhinoptilus bitorquatus", names), 1);
  assert.equal(matchLost("  rhinoptilus   BITORQUATUS ", names), 1);
});

test("a subspecies record of a lost species counts as that species", () => {
  assert.equal(matchLost("Rhinoptilus bitorquatus foo", names), 1);
});

test("a lost subspecies never flags its common species", () => {
  assert.equal(matchLost("Aerodramus spodiopygius", names), null);
  assert.equal(matchLost("Aerodramus spodiopygius assimilis", names), null);
  assert.equal(matchLost("Aerodramus spodiopygius ingens", names), 2);
});

test("same genus, other species, and empty names are not flagged", () => {
  assert.equal(matchLost("Rhinoptilus africanus", names), null);
  assert.equal(matchLost("Rhinoptilus", names), null);
  assert.equal(matchLost(null, names), null);
  assert.equal(matchLost("", names), null);
});

test("name keys", () => {
  assert.deepEqual(nameKeys("Turdus merula"), ["turdus merula"]);
  assert.deepEqual(nameKeys("Turdus merula merula"), ["turdus merula merula", "turdus merula"]);
  assert.deepEqual(nameKeys(undefined), []);
});

test("list entries with an alternative name give both names", () => {
  assert.deepEqual(listedNames("Cabalus lafresnayanus (Gallirallus lafresnayanus)"), ["cabalus lafresnayanus", "gallirallus lafresnayanus"]);
  assert.deepEqual(listedNames("Chamaeleon monoceras, Furcifer monoceras"), ["chamaeleon monoceras", "furcifer monoceras"]);
  assert.deepEqual(listedNames("Rhinoptilus bitorquatus"), ["rhinoptilus bitorquatus"]);
});

test("kokako: North Island records are not the lost South Island kokako", async () => {
  process.env.DATABASE_URL ||= "postgres://test@localhost/test"; // lost.ts imports the database client; the rule never connects
  const { PLACE_RULES } = await import("./lost");
  const rule = PLACE_RULES["callaeas cinereus"];
  const rec = (lat: number, lon: number) => rule({ kind: "record", source: "gbif", lat, lon });
  assert.equal(rec(-36.61, 174.89), false); // Tawharanui, Auckland
  assert.equal(rec(-40.85, 174.93), false); // Kapiti Island
  assert.equal(rec(-41.29, 174.75), false); // Wellington
  assert.equal(rec(-41.27, 173.28), true);  // Nelson, South Island
  assert.equal(rec(-45.4, 167.7), true);    // Fiordland
  assert.equal(rule({ kind: "record", source: "gbif", lat: null, lon: null }), true); // no place: held to be safe
  // GBIF counts per 5 degree area: held only where the area has no North Island land.
  assert.equal(rule({ kind: "count", source: "gbif", lat: -37.5, lon: 172.5 }), false);
  assert.equal(rule({ kind: "count", source: "gbif", lat: -42.5, lon: 172.5 }), false);
  assert.equal(rule({ kind: "count", source: "gbif", lat: -42.5, lon: 167.5 }), true);
  // Acoustic counts are always held: classifiers name the North Island bird Callaeas wilsoni.
  assert.equal(rule({ kind: "count", source: "birdweather", lat: -37.5, lon: 172.5 }), true);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchLost, nameKeys } from "./lostNames";

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

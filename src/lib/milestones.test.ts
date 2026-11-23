import { test } from "node:test";
import assert from "node:assert/strict";
import { milestones, type WeekRow } from "./milestones";

const week = (i: number) => new Date(Date.parse("2026-01-05") + i * 7 * 86_400_000).toISOString().slice(0, 10);
const row = (i: number, sci: string, sensitive = false): WeekRow => ({ week: week(i), sci, name: sci.toUpperCase(), sensitive });

test("no data, no milestones", () => {
  const m = milestones([], []);
  assert.equal(m.species, 0);
  assert.deepEqual(m.badges, []);
  assert.deepEqual(m.next, [{ kind: "species", n: 10, have: 0 }, { kind: "weeks", n: 4, have: 0 }]);
  assert.equal(m.newest, null);
});

test("species and week steps are dated by when they were reached", () => {
  const rows: WeekRow[] = [];
  for (let i = 0; i < 6; i++) rows.push(row(0, `A a${i}`));
  for (let i = 0; i < 6; i++) rows.push(row(2, `B b${i}`)); // 12 species by week 2
  rows.push(row(3, "A a0"), row(5, "A a0"));
  const m = milestones(rows, []);
  assert.equal(m.species, 12);
  assert.equal(m.weeks, 4);
  assert.deepEqual(m.badges, [
    { kind: "first", n: 1, at: week(0) },
    { kind: "species", n: 10, at: week(2) },
    { kind: "weeks", n: 4, at: week(5) },
  ]);
  assert.deepEqual(m.next, [{ kind: "species", n: 25, have: 12 }, { kind: "weeks", n: 13, have: 4 }]);
});

test("newest species in the last week; sensitive ones counted, not named", () => {
  const m = milestones([row(0, "A a"), row(1, "A a"), row(1, "B b"), row(1, "C c", true)], []);
  assert.deepEqual(m.newest, { week: week(1), names: [{ sci: "B b", name: "B B" }], hidden: 1 });
  // A station's very first week is not "new this week".
  assert.equal(milestones([row(0, "A a")], []).newest, null);
});

test("early arrivals need a quiet spell before and at most 6 weeks before the area's date", () => {
  const rows = [row(0, "X x"), ...Array.from({ length: 20 }, (_, i) => row(i, "R r")), row(12, "S s"), row(13, "S s"), row(4, "L l")];
  const m = milestones(rows, [
    { sci: "S s", name: "Swallow", week: week(14) }, // heard 2 weeks before the area: early
    { sci: "R r", name: "Resident", week: week(14) }, // heard every week: not an arrival
    { sci: "L l", name: "Late", week: week(18) },     // 14 weeks before: too early to be this arrival
  ]);
  assert.deepEqual(m.early, [{ sci: "S s", name: "Swallow", week: week(12), weeksEarly: 2 }]);
});

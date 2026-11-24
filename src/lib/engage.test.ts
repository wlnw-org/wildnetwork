import { test } from "node:test";
import assert from "node:assert/strict";
import { cellOf, newest, openForGuess, score, watchDigest, worthSending } from "./engage";

test("cells are 5 degree squares", () => {
  assert.deepEqual(cellOf(13.08, 80.27), { cellLat: 10, cellLon: 80 });
  assert.deepEqual(cellOf(-33.9, -70.6), { cellLat: -35, cellLon: -75 });
});

test("new this week: first recorded in the latest week of data", () => {
  const s = (sci: string, first: string, last: string) => ({ sci, name: null, first, last, n: 1 });
  const r = newest([s("A a", "2026-01-05", "2026-11-16"), s("B b", "2026-11-16", "2026-11-16"), s("C c", "2026-11-09", "2026-11-09")]);
  assert.equal(r.week, "2026-11-16");
  assert.deepEqual(r.species.map((x) => x.sci), ["B b"]);
  assert.deepEqual(newest([]), { week: null, species: [] });
});

test("open for a guess: last season's arrival a year on, 1 to 34 weeks ahead, soonest first", () => {
  const a = (sci: string, week: string) => ({ sci, name: null, week, low: null, high: null });
  const open = openForGuess([a("Swallow", "2026-03-30"), a("Swift", "2026-04-27"), a("Soon", "2025-11-24"), a("Far", "2026-10-26")], "2026-11-23");
  assert.deepEqual(open.map((o) => o.sci), ["Swallow", "Swift"]);
  assert.equal(open[0].usual, "2027-03-29");
});

test("scoring waits for the new season, then compares with the middle of the arrival week", () => {
  assert.equal(score("2027-03-29", "2026-03-30", "2026-03-30"), null);
  assert.equal(score("2027-03-29", "2026-03-30", null), null);
  assert.deepEqual(score("2027-03-29", "2026-03-30", "2027-03-22"), { arrived: "2027-03-25", daysOff: 4, verdict: "spot-on" });
  assert.equal(score("2027-03-01", "2026-03-30", "2027-03-22")!.verdict, "not-bad");
  assert.equal(score("2027-05-01", "2026-03-30", "2027-03-22")!.verdict, "off");
});

test("migration watch: recent arrivals, candidates, and last season's dates due in the next three weeks", () => {
  const a = (sci: string, week: string, n = 10) => ({ sci, name: sci, week, n });
  const d = watchDigest(
    [a("Swallow", "2026-03-30"), a("Swift", "2026-04-27"), a("Wheatear", "2027-03-15", 50), a("Old", "2027-02-01"), a("Chiffchaff", "2026-03-09")],
    [a("Wheatear", "2027-03-15"), a("Sand Martin", "2027-03-22", 5), a("Stale", "2027-01-01")],
    "2027-03-24");
  assert.deepEqual(d.arrived.map((x) => [x.sci, x.possible ?? false]), [["Wheatear", false], ["Sand Martin", true]]);
  // Swallow due 2027-03-29 (5 days), Swift 2027-04-26 (33 days: too far), Chiffchaff 2027-03-08 (already past).
  assert.deepEqual(d.due.map((x) => [x.sci, x.date]), [["Swallow", "2027-03-29"]]);
  assert.ok(worthSending(d));
  assert.ok(!worthSending(watchDigest([a("Swift", "2026-04-27")], [], "2026-11-24")));
});

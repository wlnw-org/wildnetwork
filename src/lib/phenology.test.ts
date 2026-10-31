import { test } from "node:test";
import assert from "node:assert/strict";
import type { WeekPoint } from "./phenology";

// phenology.ts imports the database client, which only needs a URL to load; detectSeason itself never connects.
process.env.DATABASE_URL ??= "postgres://test/test";
const possible = async (s: WeekPoint[]) => (await import("./phenology")).detectPossibleArrival(s);
const detect = async (s: WeekPoint[]) => (await import("./phenology")).detectSeason(s);

const week = (i: number) => new Date(Date.UTC(2025, 9, 6) + i * 7 * 86400_000).toISOString().slice(0, 10);
const series = (quiet: (i: number) => number): WeekPoint[] => Array.from({ length: 40 }, (_, i) => {
  const n = i < 20 ? quiet(i) : 100;
  return { week: week(i), n, value: n };
});

test("a species absent before its season gets an arrival", async () => {
  assert.equal((await detect(series(() => 0)))?.arrival, week(20));
});

test("a stray record or two does not cancel a real arrival", async () => {
  assert.equal((await detect(series((i) => (i % 5 === 0 ? 1 : 0))))?.arrival, week(20));
});

test("a resident recorded right through its quiet weeks gets none", async () => {
  assert.equal((await detect(series(() => 5))), null);
});

test("constant low false positives below the level still allow an arrival", async () => {
  assert.equal((await detect(series(() => 1)))?.arrival, week(20));
});

test("a species that only appears when effort jumps gets no arrival", async () => {
  const s = Array.from({ length: 40 }, (_, i): WeekPoint => {
    const effort = i < 20 ? 1000 : 1_000_000, n = i < 20 ? 0 : 5000;
    return { week: week(i), n, value: (1000 * n) / effort, effort };
  });
  assert.equal(await detect(s), null);
});

test("ordinary seasonal changes in effort still allow an arrival", async () => {
  const s = Array.from({ length: 40 }, (_, i): WeekPoint => {
    const effort = i < 20 ? 500_000 : 1_000_000, n = i < 20 ? 0 : 5000;
    return { week: week(i), n, value: (1000 * n) / effort, effort };
  });
  assert.equal((await detect(s))?.arrival, week(20));
});

const lateReturn = (last: number) => Array.from({ length: 40 }, (_, i): WeekPoint => {
  const n = i < 15 ? 100 : i < 38 ? 0 : i === 38 ? last : last;
  return { week: week(i), n, value: n };
});

test("a strong newest week after an absence is a possible arrival", async () => {
  assert.equal((await possible(lateReturn(50)))?.week, week(38));
});

test("a weak newest week is not a possible arrival", async () => {
  assert.equal(await possible(lateReturn(15)), null);
});

test("a species with no earlier season here is not a possible arrival", async () => {
  const s = Array.from({ length: 40 }, (_, i): WeekPoint => { const n = i === 39 ? 300 : 0; return { week: week(i), n, value: n }; });
  assert.equal(await possible(s), null);
});

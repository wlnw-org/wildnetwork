import { test } from "node:test";
import assert from "node:assert/strict";

// gbif.ts imports the database client, which only needs a URL to load; refreshCycle never connects.
process.env.DATABASE_URL ??= "postgres://test/test";
const cycle = async () => (await import("./gbif")).refreshCycle();

test("the refresh reaches every week back a year", async () => {
  const c = await cycle();
  for (let w = 0; w <= 52; w++) assert.ok(c.includes(w), `week ${w}`);
});

test("recent weeks come round far more often than old ones", async () => {
  const c = await cycle();
  assert.equal(c.filter((w) => w === 0).length, 13);
  assert.equal(c.filter((w) => w === 30).length, 1);
});

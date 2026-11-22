import { test } from "node:test";
import assert from "node:assert/strict";
import { _resetMemo, every, memo } from "./memo";

test("fresh answers come from memory, stale ones refresh in the background", async () => {
  _resetMemo();
  let t = 0, calls = 0;
  const clock = () => t;
  const compute = async () => ++calls;
  assert.equal(await memo("k", 100, 100, compute, clock), 1);
  t = 50;
  assert.equal(await memo("k", 100, 100, compute, clock), 1);
  t = 150; // stale: old value now, one refresh behind the scenes
  assert.equal(await memo("k", 100, 100, compute, clock), 1);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2);
  assert.equal(await memo("k", 100, 100, compute, clock), 2);
  t = 1000; // too old: computed now
  assert.equal(await memo("k", 100, 100, compute, clock), 3);
});

test("callers at the same time share one computation, and failures are not kept", async () => {
  _resetMemo();
  let calls = 0;
  const slow = () => new Promise<number>((r) => setTimeout(() => r(++calls), 10));
  const [a, b] = await Promise.all([memo("s", 1000, 0, slow), memo("s", 1000, 0, slow)]);
  assert.equal(a, 1); assert.equal(b, 1); assert.equal(calls, 1);
  await assert.rejects(memo("f", 1000, 0, async () => { throw new Error("db down"); }));
  assert.equal(await memo("f", 1000, 0, async () => "ok"), "ok");
});

test("a gate opens at most once per interval", () => {
  _resetMemo();
  assert.ok(every("g", 60_000, 0));
  assert.ok(!every("g", 60_000, 30_000));
  assert.ok(every("g", 60_000, 61_000));
});

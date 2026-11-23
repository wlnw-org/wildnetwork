import { test } from "node:test";
import assert from "node:assert/strict";
import { answerOrder, chooseClip, makePuzzle, options, quizNumber, type Candidate } from "./quiz";
import type { XcClip } from "./xenocanto";

const cands: Candidate[] = [
  "Turdus merula", "Turdus philomelos", "Parus major", "Erithacus rubecula", "Fringilla coelebs", "Sylvia atricapilla",
  "Columba palumbus", "Corvus corone", "Sturnus vulgaris", "Passer domesticus",
].map((s, i) => ({ scientificName: s, name: s.split(" ")[1], n: 100 - i }));
const clip = (id: string, seconds: number | null, type = "song"): XcClip => ({
  id, url: `https://xeno-canto.org/${id}`, file: `https://xeno-canto.org/${id}/download`, sonogram: null, type, quality: "A",
  seconds, recordist: "R", location: "L", country: "C", license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
});

test("puzzle numbers count from the start day", () => {
  assert.equal(quizNumber("2026-11-23"), 1);
  assert.equal(quizNumber("2026-12-01"), 9);
});

test("the answer order is stable for a seed and skips recent answers", () => {
  assert.deepEqual(answerOrder(cands, [], 42), answerOrder(cands, [], 42));
  const order = answerOrder(cands, ["Parus major", "Turdus merula"], 7);
  assert.equal(order.length, cands.length - 2);
  assert.ok(!order.some((c) => c.scientificName === "Parus major"));
  // Everything recent: fall back to the full list rather than no puzzle.
  assert.equal(answerOrder(cands.slice(0, 4), cands.slice(0, 4).map((c) => c.scientificName), 1).length, 4);
});

test("options: four different genera including the answer, in a stable order", () => {
  const ans = cands[0];
  const o = options(ans, cands, 99);
  assert.equal(o.length, 4);
  assert.ok(o.some((x) => x.scientificName === ans.scientificName));
  assert.equal(new Set(o.map((x) => x.scientificName.split(" ")[0])).size, 4);
  assert.deepEqual(o, options(ans, cands, 99));
  // Not enough other genera: no options.
  assert.deepEqual(options(ans, cands.slice(0, 3), 1), []);
});

test("clips must be a usable length, songs and calls first", () => {
  assert.equal(chooseClip([clip("1", 2), clip("2", 300), clip("3", null)], 1), null);
  assert.equal(chooseClip([clip("1", 20, "flight sound"), clip("2", 30, "call")], 1)?.id, "2");
  const c = chooseClip([clip("9", 12)], 1)!;
  assert.equal((c as { quality?: string }).quality, undefined);
});

test("makePuzzle tries the next species when one has no usable recording", async () => {
  const asked: string[] = [];
  const p = await makePuzzle("2026-11-23", "europe", cands, [], async (name) => { asked.push(name); return asked.length === 1 ? [] : [clip("5", 15)]; });
  assert.ok(p);
  assert.equal(asked.length, 2);
  assert.equal(p.answer, asked[1]);
  assert.ok(p.options.some((o) => o.scientificName === p.answer));
  assert.equal(await makePuzzle("2026-11-23", "europe", cands.slice(0, 3), [], async () => [clip("5", 15)]), null);
});

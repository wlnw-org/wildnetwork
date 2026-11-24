import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASS, cleanCode, newCode, tally } from "./quizClassCode";

test("class codes use only easy-to-read characters and clean up typing", () => {
  let i = 0;
  const code = newCode(() => i++ % CLASS.ALPHABET.length);
  assert.equal(code, "ABCDEF");
  for (let k = 0; k < 50; k++) assert.ok(cleanCode(newCode()));
  assert.equal(cleanCode(" abc-def "), "ABCDEF");
  assert.equal(cleanCode("ABCDE0"), null); // 0 is never used
  assert.equal(cleanCode("ABCDE"), null);
  assert.equal(cleanCode(null), null);
});

test("tally counts answers and right answers", () => {
  assert.deepEqual(tally("2026-11-24", { "Turdus merula": 12, "Strix aluco": 3 }, "Turdus merula"),
    { day: "2026-11-24", answered: 15, right: 12, picks: { "Turdus merula": 12, "Strix aluco": 3 } });
  assert.equal(tally("2026-11-24", {}, null).answered, 0);
});

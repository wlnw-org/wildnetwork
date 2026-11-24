/** Pure parts of class mode for the daily bird sound (tested in quizClass.test.ts). */
import { randomInt } from "node:crypto";

export const CLASS = {
  /** Letters and digits that are hard to confuse when read off a projector (no 0/O, 1/I/L). */
  ALPHABET: "ABCDEFGHJKMNPQRSTUVWXYZ23456789",
  LENGTH: 6,
  /** Classes one address may create per day. */
  PER_DAY: 20,
  KEEP_DAYS: 180,
  /** Days of results the teacher view shows. */
  HISTORY_DAYS: 7,
};

export function newCode(rand: (n: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < CLASS.LENGTH; i++) s += CLASS.ALPHABET[rand(CLASS.ALPHABET.length)];
  return s;
}

/** A code as typed or pasted: upper case, spaces and dashes dropped. Null when it cannot be a class code. */
export function cleanCode(s: string | null | undefined): string | null {
  const c = (s ?? "").toUpperCase().replace(/[\s-]/g, "");
  return c.length === CLASS.LENGTH && [...c].every((ch) => CLASS.ALPHABET.includes(ch)) ? c : null;
}

export interface DayResult { day: string; answered: number; right: number; picks: Record<string, number> }

/** Totals for one day from the stored pick counts and that day's answer. */
export function tally(day: string, picks: Record<string, number>, answer: string | null): DayResult {
  const answered = Object.values(picks).reduce((a, b) => a + b, 0);
  return { day, answered, right: answer ? picks[answer] ?? 0 : 0, picks };
}


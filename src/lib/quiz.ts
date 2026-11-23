/**
 * Daily bird sound quiz (/quiz). One puzzle per day (UTC) and xeno-canto world area: a recording of a bird recorded a lot
 * in that area over the last four weeks, and four names to choose from. The same puzzle for everyone that day.
 * Puzzles are built once and stored in history_cache ("quiz|<day>|<area>"), so a day costs at most a few xeno-canto
 * requests per area, all through the same 7-day recording cache as the species panels (xcPool.ts).
 * The picking functions are pure (tested in quiz.test.ts); buildPuzzle/getPuzzle touch the database.
 */
import { rng, seedOf } from "./uncertainty";
import type { XcArea, XcClip } from "./xenocanto";

export const QUIZ = {
  /** Puzzle #1. */
  START: "2026-11-23",
  /** Most recorded birds of the area to draw from. */
  CANDIDATES: 40,
  /** An answer is not used again in an area within this many days. */
  NO_REPEAT_DAYS: 21,
  /** Recording length that is long enough to recognise and short enough to keep: seconds. */
  MIN_SECONDS: 5,
  MAX_SECONDS: 90,
  /** Species tried for a usable recording before the area gets no puzzle that day. */
  TRIES: 6,
};

export interface Candidate { scientificName: string; name: string; n: number }
export interface QuizClip {
  id: string; url: string; file: string; sonogram: string | null; type: string; seconds: number | null;
  recordist: string; location: string; country: string; license: { name: string; url: string };
}
export interface Puzzle {
  day: string; number: number; area: XcArea;
  clip: QuizClip;
  options: { scientificName: string; name: string }[];
  answer: string;
}

/** The puzzle day: the UTC date. */
export const quizDay = (d: Date = new Date()) => d.toISOString().slice(0, 10);
export const quizNumber = (day: string) => Math.round((Date.parse(day + "T00:00:00Z") - Date.parse(QUIZ.START + "T00:00:00Z")) / 86_400_000) + 1;

const genus = (s: string) => s.split(" ")[0];

/**
 * Answer order for a day: the candidates not used recently, shuffled with the day's seed. The caller tries them in order
 * until one has a usable recording.
 */
export function answerOrder(cands: Candidate[], recent: string[], seed: number): Candidate[] {
  const pool = cands.filter((c) => !recent.includes(c.scientificName));
  const list = pool.length ? pool : cands;
  const r = rng(seed);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Three other species from the list, not of the answer's genus and with different names, then all four shuffled. */
export function options(answer: Candidate, cands: Candidate[], seed: number): { scientificName: string; name: string }[] {
  const r = rng(seed ^ 0x9e3779b9);
  const others = cands.filter((c) => c.scientificName !== answer.scientificName && genus(c.scientificName) !== genus(answer.scientificName));
  const picked: Candidate[] = [];
  const left = [...others];
  while (picked.length < 3 && left.length) {
    const c = left.splice(Math.floor(r() * left.length), 1)[0];
    if (!picked.some((p) => p.name === c.name || genus(p.scientificName) === genus(c.scientificName))) picked.push(c);
  }
  if (picked.length < 3) return [];
  const all = [answer, ...picked].map((c) => ({ scientificName: c.scientificName, name: c.name }));
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

/** A clip of a usable length from the pool (best quality first), song or call preferred; null when none fits. */
export function chooseClip(pool: XcClip[], seed: number): QuizClip | null {
  const fits = pool.filter((c) => c.file && c.seconds != null && c.seconds >= QUIZ.MIN_SECONDS && c.seconds <= QUIZ.MAX_SECONDS);
  const voiced = fits.filter((c) => /song|call/i.test(c.type));
  const list = (voiced.length ? voiced : fits).slice(0, 5);
  if (!list.length) return null;
  const c = list[Math.floor(rng(seed ^ 0x85ebca6b)() * list.length)];
  return { id: c.id, url: c.url, file: c.file, sonogram: c.sonogram, type: c.type, seconds: c.seconds, recordist: c.recordist, location: c.location, country: c.country, license: c.license };
}

/**
 * Builds a day's puzzle from the area's candidates. `pool` returns the cached xeno-canto recordings of a species
 * (empty when there are none). Null when no candidate within QUIZ.TRIES has a usable recording.
 */
export async function makePuzzle(day: string, area: XcArea, cands: Candidate[], recent: string[], pool: (name: string) => Promise<XcClip[]>): Promise<Puzzle | null> {
  if (cands.length < 4) return null;
  const seed = seedOf(`quiz|${day}|${area}`);
  for (const answer of answerOrder(cands, recent, seed).slice(0, QUIZ.TRIES)) {
    const opts = options(answer, cands, seed);
    if (opts.length !== 4) continue;
    const clip = chooseClip(await pool(answer.scientificName), seed);
    if (clip) return { day, number: quizNumber(day), area, clip, options: opts, answer: answer.scientificName };
  }
  return null;
}

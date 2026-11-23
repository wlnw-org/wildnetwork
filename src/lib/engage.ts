/**
 * Pure logic for Your patch (/patch) and Guess the arrival (/guess). Both keep the visitor's own data in their browser;
 * the server only answers what was recorded (species_weekly) and when species arrive (phenology). Tests: engage.test.ts.
 */

const DAY = 86_400_000;
const parse = (d: string) => Date.parse(d.slice(0, 10) + "T00:00:00Z");
export const addDays = (d: string, n: number) => new Date(parse(d) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((parse(b) - parse(a)) / DAY);

/** The 5 degree area (cell) of a point, as used by the weekly tables. */
export const cellOf = (lat: number, lon: number) => ({ cellLat: Math.floor(lat / 5) * 5, cellLon: Math.floor(lon / 5) * 5 });

export interface PatchSpecies { sci: string; name: string | null; first: string; last: string; n: number }

/** Species first recorded in the area's latest week of data: "new this week". */
export function newest(list: PatchSpecies[]): { week: string | null; species: PatchSpecies[] } {
  const week = list.reduce<string | null>((m, s) => (!m || s.last > m ? s.last : m), null);
  return { week, species: week ? list.filter((s) => s.first === week) : [] };
}

/** Guess the arrival: a migrant is open for guessing when last season's arrival, a year on, is 1 to 34 weeks away. */
export const GUESS = { MIN_AHEAD_DAYS: 7, MAX_AHEAD_DAYS: 240, NEW_SEASON_DAYS: 180 };

export interface Arrival { sci: string; name: string | null; week: string; low: string | null; high: string | null }
export interface Open extends Arrival { usual: string; usualLow: string | null; usualHigh: string | null }

/** Migrants open for a guess today, soonest first: their usual date is last season's arrival plus a year (364 days, same weekday). */
export function openForGuess(arrivals: Arrival[], today: string): Open[] {
  return arrivals
    .map((a) => ({ ...a, usual: addDays(a.week, 364), usualLow: a.low ? addDays(a.low, 364) : null, usualHigh: a.high ? addDays(a.high, 364) : null }))
    .filter((a) => { const ahead = daysBetween(today, a.usual); return ahead >= GUESS.MIN_AHEAD_DAYS && ahead <= GUESS.MAX_AHEAD_DAYS; })
    .sort((a, b) => (a.usual < b.usual ? -1 : a.usual > b.usual ? 1 : a.sci < b.sci ? -1 : 1));
}

export type Verdict = "spot-on" | "close" | "not-bad" | "off";
export interface Score { arrived: string; daysOff: number; verdict: Verdict }

/**
 * Scores a guess once the new season's arrival is known: `current` is today's arrival week for the species and area,
 * `previous` the one when the guess was made. Arrival dates are weekly, so the middle of the week (Monday + 3) is the
 * date compared. Null while the new season has not been detected yet.
 */
export function score(guess: string, previous: string, current: string | null): Score | null {
  if (!current || daysBetween(previous, current) < GUESS.NEW_SEASON_DAYS) return null;
  const arrived = addDays(current, 3);
  const daysOff = Math.abs(daysBetween(guess, arrived));
  const verdict: Verdict = daysOff <= 7 ? "spot-on" : daysOff <= 14 ? "close" : daysOff <= 28 ? "not-bad" : "off";
  return { arrived, daysOff, verdict };
}

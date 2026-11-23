/**
 * Station milestones for /stations/mine: private to the station's owner, never shown on public pages.
 * They reward keeping a station running (species heard, weeks recording, hearing migrants early), never raw detection
 * counts, so there is no reason to lower thresholds or send more. Pure, tested in milestones.test.ts.
 * Input is the station's weekly species lists (station_weekly) and its area's arrival dates (phenology).
 */

export const SPECIES_STEPS = [10, 25, 50, 100, 150, 200, 300];
export const WEEK_STEPS = [4, 13, 26, 52, 104];
/** An early arrival: the station's first record of the season came at most this many weeks before the area's arrival... */
export const EARLY_MAX_WEEKS = 6;
/** ...after at least this many weeks without the species at the station (so residents do not count). */
export const QUIET_WEEKS = 8;

export interface WeekRow { week: string; sci: string; name: string | null; sensitive: boolean }
export interface AreaArrival { sci: string; name: string | null; week: string }
export interface Badge { kind: "first" | "species" | "weeks"; n: number; at: string }
export interface Goal { kind: "species" | "weeks"; n: number; have: number }
export interface Early { sci: string; name: string | null; week: string; weeksEarly: number }
export interface Milestones {
  species: number; weeks: number; firstWeek: string | null;
  badges: Badge[]; next: Goal[];
  /** Species first heard at the station in its latest week (sensitive species counted, not named). */
  newest: { week: string; names: { sci: string; name: string | null }[]; hidden: number } | null;
  early: Early[];
}

const DAY = 86_400_000;
const weeksBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / (7 * DAY));

export function milestones(rows: WeekRow[], arrivals: AreaArrival[]): Milestones {
  const weeks = [...new Set(rows.map((r) => r.week))].sort();
  const firstHeard = new Map<string, string>();
  const byWeek = new Map<string, WeekRow[]>();
  for (const r of [...rows].sort((a, b) => (a.week < b.week ? -1 : 1))) {
    if (!firstHeard.has(r.sci)) firstHeard.set(r.sci, r.week);
    (byWeek.get(r.week) ?? byWeek.set(r.week, []).get(r.week)!).push(r);
  }

  const badges: Badge[] = [];
  if (weeks.length) badges.push({ kind: "first", n: 1, at: weeks[0] });
  // When each species step was reached: the week the running total of species first passed it.
  const seen = new Set<string>();
  let si = 0;
  weeks.forEach((w, i) => {
    for (const r of byWeek.get(w) ?? []) seen.add(r.sci);
    while (si < SPECIES_STEPS.length && seen.size >= SPECIES_STEPS[si]) badges.push({ kind: "species", n: SPECIES_STEPS[si++], at: w });
    const wi = WEEK_STEPS.indexOf(i + 1);
    if (wi >= 0) badges.push({ kind: "weeks", n: WEEK_STEPS[wi], at: w });
  });

  const next: Goal[] = [];
  const ns = SPECIES_STEPS.find((n) => n > seen.size);
  if (ns) next.push({ kind: "species", n: ns, have: seen.size });
  const nw = WEEK_STEPS.find((n) => n > weeks.length);
  if (nw) next.push({ kind: "weeks", n: nw, have: weeks.length });

  let newest: Milestones["newest"] = null;
  const last = weeks.at(-1);
  if (last && weeks.length > 1) {
    const fresh = (byWeek.get(last) ?? []).filter((r) => firstHeard.get(r.sci) === last);
    if (fresh.length) newest = {
      week: last,
      names: fresh.filter((r) => !r.sensitive).map((r) => ({ sci: r.sci, name: r.name })),
      hidden: fresh.filter((r) => r.sensitive).length,
    };
  }

  // Heard at the station no later than the area's arrival date, after a quiet spell there.
  const early: Early[] = [];
  for (const a of arrivals) {
    const mine = rows.filter((r) => r.sci === a.sci && !r.sensitive).map((r) => r.week).sort();
    const w = mine.find((x) => weeksBetween(x, a.week) >= 0 && weeksBetween(x, a.week) <= EARLY_MAX_WEEKS);
    if (!w) continue;
    const quiet = weeks.length && weeksBetween(weeks[0], w) >= QUIET_WEEKS && !mine.some((x) => weeksBetween(x, w) > 0 && weeksBetween(x, w) <= QUIET_WEEKS);
    if (quiet) early.push({ sci: a.sci, name: a.name, week: w, weeksEarly: weeksBetween(w, a.week) });
  }
  early.sort((a, b) => b.weeksEarly - a.weeksEarly || (a.week < b.week ? 1 : -1));

  return { species: seen.size, weeks: weeks.length, firstWeek: weeks[0] ?? null, badges, next, newest, early: early.slice(0, 10) };
}

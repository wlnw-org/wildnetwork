import { sql } from "@/lib/db";
import { METHODS_VERSION, MIN_EFFORT_WEEK, OBSERVED, SMALL_CLASS, minEffortWeek } from "@/lib/methods";
import { BOOT, dispersion, interval, overdispersed, rng, seedOf } from "@/lib/uncertainty";

export interface WeekPoint { week: string; value: number; n: number; effort?: number }
export interface Season { arrival: string; departure: string | null; peak: string; peakValue: number; total: number; weeks: number; absentWeeks: number }

export const PHENOLOGY = {
  /** A week counts as "present" when the value reaches this fraction of the seasonal peak. */
  PRESENT_FRACTION: 0.1,
  /** An arrival needs at least this many consecutive absent weeks before it. */
  MIN_ABSENT_WEEKS: 6,
  /** and at least this many consecutive present weeks from the arrival on. */
  MIN_PRESENT_WEEKS: 2,
  MIN_WEEKS_OBSERVED: 26,
  MIN_TOTAL: 200,
  MIN_PEAK_N: 30,
  /** Not a real absence (methods 0.15): the species was still recorded in this share of the "absent" weeks, */
  RESIDENT_WEEK_SHARE: 0.7,
  /** at a mean level of at least this fraction of the seasonal peak. A resident that falls quiet looks like this; a migrant does not. */
  RESIDENT_LEVEL: 0.02,
  /** No date when the 90% interval is wider than this (methods 0.16): the redraws cannot agree on the season. */
  MAX_INTERVAL_WEEKS: 8,
  /** Absent weeks only count when their effort is at least this share of the arrival week's (methods 0.17): otherwise the watchers changed, not the birds. */
  MIN_COMPARABLE_EFFORT: 0.1,
};

const DAY = 86400_000;

/**
 * Find the seasonal arrival in a weekly series (observed weeks only, zeros included, sorted by week).
 * Returns null for residents, for series that are too thin, and when the cell was not watched in the week before arrival.
 * Pure function: the validation applies the same rule to an independent data source.
 */
export function detectSeason(series: WeekPoint[], limits = PHENOLOGY): Season | null {
  if (series.length < limits.MIN_WEEKS_OBSERVED) return null;
  const total = series.reduce((a, p) => a + p.n, 0);
  let peakI = 0;
  series.forEach((p, i) => { if (p.value > series[peakI].value) peakI = i; });
  if (total < limits.MIN_TOTAL || series[peakI].n < limits.MIN_PEAK_N) return null;
  const thr = series[peakI].value * limits.PRESENT_FRACTION;
  const present = series.map((p) => p.value >= thr && p.value > 0);

  let best: { i: number; run: number } | null = null;
  let run = 0;
  for (let i = 0; i < series.length; i++) {
    if (!present[i]) { run++; continue; }
    const runBefore = run;
    run = 0;
    if (runBefore < limits.MIN_ABSENT_WEEKS) continue;
    let ahead = 0;
    while (i + ahead < series.length && present[i + ahead]) ahead++;
    if (ahead < limits.MIN_PRESENT_WEEKS) continue;
    // The week before must have been observed, otherwise an outage would look like an arrival.
    if (i === 0 || Date.parse(series[i].week) - Date.parse(series[i - 1].week) > 8 * DAY) continue;
    // Still recorded through most of the "absence": a resident gone quiet, so this is song onset rather than an arrival.
    const gap = series.slice(i - runBefore, i);
    const recorded = gap.filter((p) => p.n > 0).length / runBefore;
    const level = gap.reduce((a, p) => a + p.value, 0) / runBefore;
    // The absence must have been watched about as hard as the arrival week: acoustic data starting in a cell is not an arrival.
    const here = series[i].effort;
    if (here !== undefined && gap.filter((p) => (p.effort ?? 0) >= here * limits.MIN_COMPARABLE_EFFORT).length < limits.MIN_ABSENT_WEEKS) continue;
    if (recorded >= limits.RESIDENT_WEEK_SHARE && level >= series[peakI].value * limits.RESIDENT_LEVEL) continue;
    if (!best || runBefore > best.run) best = { i, run: runBefore };
  }
  if (!best) return null;

  // Departure: the last present week before the next long absence, if the data reaches that far.
  let departure: string | null = null;
  let lastPresent = best.i, away = 0;
  for (let j = best.i; j < series.length; j++) {
    if (present[j]) { lastPresent = j; away = 0; } else if (++away >= limits.MIN_ABSENT_WEEKS) { departure = series[lastPresent].week; break; }
  }
  // Peak within the season that starts at the arrival.
  let seasonPeak = best.i;
  for (let j = best.i; j < series.length && (departure === null || series[j].week <= departure); j++) if (series[j].value > series[seasonPeak].value) seasonPeak = j;
  return { arrival: series[best.i].week, departure, peak: series[seasonPeak].week, peakValue: series[seasonPeak].value, total, weeks: series.length, absentWeeks: best.run };
}

/**
 * Seasonal timing per species and cell. Without `source`, all sources together against effort_weekly (the site's arrival dates).
 * With `source`, one source alone against its own effort (used for the open data release and the two-source comparison).
 * Streams rows, so memory stays small.
 */
export async function computeSeasons(source?: string): Promise<{ pairs: number; rows: Record<string, unknown>[] }> {
  const effort = new Map<string, Map<string, number>>(); // class|cell -> week -> detections
  const effortRows = source
    ? sql<{ week: string; cell_lat: number; cell_lon: number; grp: string; detections: number }[]>`
        SELECT e.week::text, e.cell_lat, e.cell_lon, e.grp, e.detections FROM effort_weekly_source e
        WHERE e.source_system = ${source} AND e.week <= CURRENT_DATE - 7
          AND e.detections >= (CASE WHEN e.grp = 'avian' THEN ${source === "birdweather" ? MIN_EFFORT_WEEK : OBSERVED.MIN_EFFORT_WEEK}::int
                                    ELSE ${source === "birdweather" ? SMALL_CLASS.MIN_EFFORT_WEEK : OBSERVED.SMALL_MIN_EFFORT_WEEK}::int END)
        ORDER BY e.week`
    : sql<{ week: string; cell_lat: number; cell_lon: number; grp: string; detections: number }[]>`
        SELECT e.week::text, e.cell_lat, e.cell_lon, e.grp, e.detections FROM effort_weekly e
        WHERE e.detections >= ${minEffortWeek()} AND e.week <= CURRENT_DATE - 7 ORDER BY e.week`;
  for (const e of await effortRows) {
    const k = `${e.grp}|${e.cell_lat},${e.cell_lon}`;
    if (!effort.has(k)) effort.set(k, new Map());
    effort.get(k)!.set(e.week, e.detections);
  }

  // Range check (methods 0.11): bird recordings GBIF says are far outside the species' range never become arrival dates.
  // The GBIF-only computation is not filtered: GBIF records are the reference.
  const outliers = new Set(source === "gbif" ? [] : (await sql<{ k: string }[]>`
    SELECT scientific_name || '|' || cell_lat || ',' || cell_lon AS k FROM range_outliers
    UNION
    -- Expert review (methods 0.13): at least two signed-in researchers call it a misidentification or a resident, and they
    -- outnumber those who call it correct.
    SELECT scientific_name || '|' || cell_lat || ',' || cell_lon FROM arrival_reviews GROUP BY scientific_name, cell_lat, cell_lon
    HAVING COUNT(*) FILTER (WHERE verdict IN ('misid', 'resident')) >= 2
       AND COUNT(*) FILTER (WHERE verdict IN ('misid', 'resident')) > COUNT(*) FILTER (WHERE verdict = 'correct')`).map((r) => r.k));

  const out: Record<string, unknown>[] = [];
  let pairs = 0;
  let key = "", name = "", vern: string | null = null, cell = "", grp = "avian", counts = new Map<string, number>();
  // Classes with few sensors need lower minimums, scaled the same way as the other measures.
  const small = { ...PHENOLOGY, MIN_TOTAL: Math.ceil(PHENOLOGY.MIN_TOTAL * SMALL_CLASS.SCALE), MIN_PEAK_N: Math.ceil(PHENOLOGY.MIN_PEAK_N * SMALL_CLASS.SCALE), MIN_WEEKS_OBSERVED: 16 };
  const flush = () => {
    if (!key) return;
    pairs++;
    if (outliers.has(key)) return;
    const weeks = effort.get(`${grp}|${cell}`);
    if (!weeks) return;
    const effs = [...weeks.entries()];
    const series: WeekPoint[] = effs.map(([week, eff]) => { const n = counts.get(week) ?? 0; return { week, n, value: (1000 * n) / eff, effort: eff }; });
    const limits = grp === "avian" ? PHENOLOGY : small;
    const s = detectSeason(series, limits);
    if (!s) return;
    // Uncertainty: redraw every weekly count with the series' own overdispersion and detect again (see /methods#uncertainty).
    const r = rng(seedOf(`${key}|${source ?? "all"}`));
    const phi = dispersion(series.map((p) => p.n));
    const found: number[] = [];
    for (let b = 0; b < BOOT.B_ARRIVAL; b++) {
      const alt = effs.map(([week, eff], i): WeekPoint => { const n = overdispersed(series[i].n, phi, r); return { week, n, value: (1000 * n) / eff, effort: eff }; });
      const sb = detectSeason(alt, limits);
      if (sb) found.push(Date.parse(sb.arrival));
    }
    const ci = interval(found, BOOT.LEVEL_ARRIVAL, 10);
    // The redraws do not agree when the season starts, or the estimate itself falls outside them: no usable date.
    if (ci && (ci[1] - ci[0] > PHENOLOGY.MAX_INTERVAL_WEEKS * 7 * DAY || Date.parse(s.arrival) < ci[0] || Date.parse(s.arrival) > ci[1])) return;
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    const [lat, lon] = cell.split(",").map(Number);
    out.push({ scientific_name: name, vernacular_name: vern, cell_lat: lat, cell_lon: lon, arrival_week: s.arrival, departure_week: s.departure, peak_week: s.peak,
      peak_index: s.peakValue, total_n: s.total, weeks_observed: s.weeks, absent_weeks: s.absentWeeks, methods_version: METHODS_VERSION,
      arrival_low: ci ? day(ci[0]) : null, arrival_high: ci ? day(ci[1]) : null, arrival_support: Math.round((found.length / BOOT.B_ARRIVAL) * 100) / 100 });
  };
  await sql<{ scientific_name: string; vernacular_name: string | null; grp: string; cell_lat: number; cell_lon: number; week: string; n: number }[]>`
    SELECT s.scientific_name, MIN(s.vernacular_name) AS vernacular_name, g.grp, s.cell_lat, s.cell_lon, s.week::text, SUM(s.count)::int AS n
    FROM species_weekly s JOIN species_group g USING (scientific_name)
    WHERE s.week <= CURRENT_DATE - 7 AND g.is_species ${source ? sql`AND s.source_system = ${source}` : sql``}
    GROUP BY s.scientific_name, g.grp, s.cell_lat, s.cell_lon, s.week
    ORDER BY s.scientific_name, s.cell_lat, s.cell_lon, s.week
  `.cursor(20000, (rows) => {
    for (const r of rows) {
      const k = `${r.scientific_name}|${r.cell_lat},${r.cell_lon}`;
      if (k !== key) { flush(); key = k; name = r.scientific_name; vern = r.vernacular_name; grp = r.grp; cell = `${r.cell_lat},${r.cell_lon}`; counts = new Map(); }
      counts.set(r.week, r.n);
    }
  });
  flush();
  return { pairs, rows: out };
}

/** Recompute the phenology table (all sources) that the site's arrival dates come from. */
export async function recomputePhenology(): Promise<{ pairs: number; seasons: number }> {
  const { pairs, rows: out } = await computeSeasons();
  await sql.begin(async (tx) => {
    await tx`TRUNCATE phenology`;
    for (let i = 0; i < out.length; i += 2000) await tx`INSERT INTO phenology ${tx(out.slice(i, i + 2000))}`;
  });
  return { pairs, seasons: out.length };
}

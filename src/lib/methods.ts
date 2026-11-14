import { sql } from "@/lib/db";

/** Version of the published methods. Bump when a measure changes, and add a line to the changelog on /methods. */
export const METHODS_VERSION = "0.24";

/** A cell-day needs this many detections of all species before it counts as observed. */
export const MIN_EFFORT_DAY = 200;
/** Same for a cell-week. */
export const MIN_EFFORT_WEEK = 1000;

/** A species needs this many detections in a cell and period before that cell counts toward its range centre. */
export const MIN_CELL_DETECTIONS = 5;

/** Coarse continent from a 5-degree cell, so a range centre is never a mix of hemispheres. */
export const REGION = sql`CASE
  WHEN cell_lon < -30 AND cell_lat >= 10 THEN 'North America'
  WHEN cell_lon < -30 THEN 'South America'
  WHEN cell_lon < 60 AND cell_lat >= 35 THEN 'Europe'
  WHEN cell_lon < 60 THEN 'Africa'
  WHEN cell_lon >= 110 AND cell_lat < -10 THEN 'Oceania'
  ELSE 'Asia' END`;

/** Taxon classes. Effort is corrected within a class: a bat is compared with other bats, heard by the same ultrasonic stations. */
export const GROUPS = ["avian", "bat", "amphibian", "insect", "mammal", "marine", "other"] as const;
export type Group = (typeof GROUPS)[number];

/** Non-bird classes have far fewer sensors and detections, so their minimums are lower. */
export const SMALL_CLASS = { MIN_EFFORT_DAY: 30, MIN_EFFORT_WEEK: 150, SCALE: 0.2 };

/** Class of a rollup row: the stored class, else birds for BirdWeather rows and "other" for everything else. */
export const GRP = (g = sql`g`, s = sql`s`) => sql`COALESCE(${g}.grp, CASE WHEN ${s}.source_system = 'birdweather' THEN 'avian' ELSE 'other' END)`;
/** Minimum effort for a cell and period to count as observed, by class. */
export const minEffortDay = (e = sql`e`) => sql`(CASE WHEN ${e}.grp = 'avian' THEN ${MIN_EFFORT_DAY}::int ELSE ${SMALL_CLASS.MIN_EFFORT_DAY}::int END)`;
export const minEffortWeek = (e = sql`e`) => sql`(CASE WHEN ${e}.grp = 'avian' THEN ${MIN_EFFORT_WEEK}::int ELSE ${SMALL_CLASS.MIN_EFFORT_WEEK}::int END)`;
/** Scales a count threshold down for the small classes. */
export const scaled = (n: number, grp = sql`grp`) => sql`(CASE WHEN ${grp} = 'avian' THEN ${n}::int ELSE ${Math.ceil(n * SMALL_CLASS.SCALE)}::int END)`;

/**
 * Human records (GBIF) come in far smaller numbers than acoustic detections, so a cell-week counts as watched by
 * observers at a lower total. Used only where the two sources are compared or published separately.
 */
export const OBSERVED = { MIN_EFFORT_WEEK: 100, SMALL_MIN_EFFORT_WEEK: 20 };
export const minObservedWeek = (grp: string) => (grp === "avian" ? OBSERVED.MIN_EFFORT_WEEK : OBSERVED.SMALL_MIN_EFFORT_WEEK);
export const minAcousticWeek = (grp: string) => (grp === "avian" ? MIN_EFFORT_WEEK : SMALL_CLASS.MIN_EFFORT_WEEK);

/** Range check (methods 0.11): a bird recorded only by sound is left out of arrival dates in a cell where GBIF, with every
 * licence counted, has almost never recorded it in that cell or the eight around it, provided the area is well surveyed.
 * Catches repeated misidentifications by acoustic classifiers (for example Eurasian Curlew around Boston). */
export const RANGE = { MIN_AREA_RECORDS: 1_000_000, MAX_SHARE: 1e-6, SINCE_YEAR: 2000, RECHECK_DAYS: 180 };

/** Contributed datasets (methods 0.21). An uploaded detection is "passed" when the species was recorded by another source in
 * the same 5 degree cell or the eight around it, within WEEK_WINDOW weeks of the same time of year; "flagged" when it was not
 * although those cells and weeks were watched (other sources' class effort >= MIN_EFFORT_FACTOR x the weekly minimum);
 * "unchecked" when the area is too thinly watched to judge. More than BURST_PER_MINUTE detections at one site in one minute
 * are flagged as a possible test playback. Flagged records stay out of every measure until a reviewer confirms them.
 * A contributor's first TRUSTED_AFTER datasets are reviewed by a person; later ones go live by themselves when at most
 * AUTO_LIVE_MAX_FLAGGED of their records are flagged. */
export const UPLOAD_CHECK = { WEEK_WINDOW: 4, MIN_EFFORT_FACTOR: 3, BURST_PER_MINUTE: 100, TRUSTED_AFTER: 2, AUTO_LIVE_MAX_FLAGGED: 0.2 };

/**
 * Year-round species (methods 0.23): left out of "Arriving around now" on the regional arrivals pages. Over the last 52 weeks, in the
 * species' own cells of the region, its effort-corrected share per calendar month is compared with its busiest month. When the
 * quieter months (the 25th percentile month) still reach this fraction of the busiest, it is recorded all year and is not a migrant
 * arriving. Checked on 18 European species on 10 Nov 2026: migrants scored 0 to 0.007, residents 0.011 to 0.47.
 */
export const YEAR_ROUND_Q25 = 0.01;

import { after } from "next/server";
import { sql } from "@/lib/db";
import { driftIntervals, moverIntervals } from "@/lib/insightsCi";
import { overview } from "@/lib/story";
import { regionOf } from "@/lib/regions";
import { GROUPS, METHODS_VERSION, MIN_CELL_DETECTIONS, REGION, minEffortDay, scaled, type Group } from "@/lib/methods";

/**
 * What is changing, effort corrected within each taxon class. See /methods for the definitions.
 * ?group=bat limits the lists to one class (avian, bat, amphibian, insect, mammal).
 * Every measure uses a species' share of its class's detections in a cell, never a raw count,
 * so more stations, or more ultrasonic stations, do not look like more animals.
 */
/** Lists within this many degrees of the visitor's cell count as "near"; within AREA.REGION as "your region". */
const AREA = { NEAR: 10, REGION: 25, MIN_ITEMS: 4 } as const;
type Scope = "near" | "region" | "world";

/** Normalised inputs: class and the visitor's 5 degree cell (or the world). Shared by the stored copy's key and compute(). */
function inputs(params: URLSearchParams) {
  const g = params.get("group");
  const group = GROUPS.includes(g as Group) ? (g as Group) : null;
  const la = Number(params.get("lat")), lo = Number(params.get("lon"));
  const here = params.has("lat") && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180
    ? { cellLat: Math.floor(la / 5) * 5, cellLon: Math.floor(lo / 5) * 5 } : null;
  return { group, here, key: `insights|${group ?? "all"}|${here ? `${here.cellLat},${here.cellLon}` : "world"}` };
}

/**
 * Working the lists out takes several seconds (bootstrap intervals over the daily tables), and the CDN caches each region
 * separately, so a cold answer used to keep a visitor waiting about 8 s. Each answer is stored in history_cache once; later
 * requests get the stored copy at once, and a copy older than FRESH_MS (4 h; each recompute costs ~2 s of CPU) is recomputed after the response is sent.
 */
const FRESH_MS = 4 * 60 * 60 * 1000, KEEP_DAYS = 7;
const headers = { "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" };
const BACKGROUND_WRITES = process.env.VERCEL_ENV !== "preview";

async function store(key: string, data: unknown) {
  await sql`INSERT INTO history_cache (key, data, computed_at) VALUES (${key}, ${sql.json(data as never)}, now())
    ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, computed_at = now()`;
}

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const { key } = inputs(params);
  const [row] = await sql<{ data: unknown; age_ms: number }[]>`
    SELECT data, (extract(epoch FROM now() - computed_at) * 1000)::float AS age_ms FROM history_cache WHERE key = ${key}`.catch(() => []);
  if (row) {
    if (row.age_ms > FRESH_MS && BACKGROUND_WRITES) after(async () => {
      // Claim the refresh (one request per stale copy), then recompute.
      const claimed = await sql`UPDATE history_cache SET computed_at = now() - make_interval(secs => ${(FRESH_MS - 5 * 60_000) / 1000})
        WHERE key = ${key} AND computed_at < now() - make_interval(secs => ${FRESH_MS / 1000}) RETURNING key`;
      if (!claimed.length) return;
      await store(key, await compute(params)).catch((e) => console.error("insights refresh", e));
      await sql`DELETE FROM history_cache WHERE key LIKE 'insights|%' AND computed_at < now() - make_interval(days => ${KEEP_DAYS})`;
    });
    return Response.json(row.data, { headers });
  }
  const data = await compute(params);
  if (BACKGROUND_WRITES) await store(key, data).catch((e) => console.error("insights store", e));
  return Response.json(data, { headers });
}

async function compute(params: URLSearchParams) {
  const g = params.get("group");
  const group = GROUPS.includes(g as Group) ? (g as Group) : null;
  const only = group ? sql`AND g.grp = ${group}` : sql``;
  // Visitor's area (?lat&lon, whole degrees from /api/v1/near), snapped to its 5 degree cell so the CDN can share answers.
  const la = Number(params.get("lat")), lo = Number(params.get("lon"));
  const here = params.has("lat") && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180
    ? { cellLat: Math.floor(la / 5) * 5, cellLon: Math.floor(lo / 5) * 5 } : null;
  // Distance in degrees (the larger of latitude and wrapped longitude) from a row's cell centre to the visitor's cell centre.
  const dist = (t: string) => here
    ? sql`GREATEST(ABS(${sql(t)}.cell_lat - ${here.cellLat}), ABS(MOD((${sql(t)}.cell_lon - ${here.cellLon} + 540)::numeric, 360) - 180))`
    : sql`0`;
  const within = (t: string, r: number) => here ? sql`AND ${dist(t)} <= ${r}` : sql``;

  // Area-aware lists. With a radius, rows carry d (degrees from the visitor) and the nearest area is preferred.
  const seasonalQ = (r: number | null) => sql`
      SELECT DISTINCT ON (p.scientific_name) p.scientific_name, p.vernacular_name, g.grp, p.cell_lat, p.cell_lon, p.arrival_week::text AS week, p.total_n::int AS n, ${dist("p")}::float AS d
      FROM phenology p JOIN species_group g USING (scientific_name)
      WHERE p.arrival_week >= CURRENT_DATE - 120 AND g.is_species ${only} ${r == null ? sql`` : within("p", r)}
      ORDER BY p.scientific_name, (${dist("p")} <= ${AREA.NEAR}) DESC, p.arrival_week DESC`;
  const possibleQ = (r: number | null) => sql`
      SELECT DISTINCT ON (p.scientific_name) p.scientific_name, p.vernacular_name, g.grp, p.cell_lat, p.cell_lon, p.week::text AS week, p.n, p.support, ${dist("p")}::float AS d
      FROM arrival_candidates p JOIN species_group g USING (scientific_name)
      WHERE g.is_species ${group ? only : sql`AND g.grp = 'avian'`} ${r == null ? sql`` : within("p", r)}
      ORDER BY p.scientific_name, (${dist("p")} <= ${AREA.NEAR}) DESC, p.week DESC, p.n DESC`;
  const commonQ = (r: number | null) => sql`
      SELECT s.scientific_name, MIN(s.vernacular_name) AS vernacular_name, g.grp, SUM(s.count)::int AS n, COUNT(DISTINCT (s.cell_lat, s.cell_lon))::int AS cells
      FROM species_weekly s JOIN species_group g USING (scientific_name)
      WHERE s.week > (SELECT MAX(week) FROM species_weekly WHERE count >= 3) - 28 AND g.is_species ${only} ${r == null ? sql`` : within("s", r)}
      GROUP BY 1, 3 ORDER BY 4 DESC LIMIT 15`;
  const arrivalsQ = (r: number | null) =>
    sql`
      WITH recent AS (
        SELECT sd.scientific_name, MIN(sd.vernacular_name) AS vernacular_name, g.grp, sd.cell_lat, sd.cell_lon, SUM(sd.count) AS n
        FROM species_daily sd JOIN species_group g USING (scientific_name)
        WHERE sd.day >= CURRENT_DATE - 1 AND g.is_species ${only} ${r == null ? sql`` : within("sd", r)} GROUP BY 1, 3, 4, 5
      ), watched AS (
        SELECT e.cell_lat, e.cell_lon, e.grp FROM effort_daily e
        WHERE e.day >= CURRENT_DATE - 13 AND e.day < CURRENT_DATE - 1 AND e.detections >= ${minEffortDay()}
        GROUP BY 1, 2, 3 HAVING COUNT(*) >= 8
      )
      SELECT r.scientific_name, r.vernacular_name, r.grp, r.cell_lat, r.cell_lon, r.n::int AS n, ${dist("r")}::float AS d
      FROM recent r JOIN watched w USING (cell_lat, cell_lon, grp)
      WHERE r.n >= (CASE WHEN r.grp = 'avian' THEN 20 ELSE 10 END) AND NOT EXISTS (
        SELECT 1 FROM species_daily p
        WHERE p.scientific_name = r.scientific_name AND p.cell_lat = r.cell_lat AND p.cell_lon = r.cell_lon
          AND p.day < CURRENT_DATE - 1 AND p.day >= CURRENT_DATE - 13
      )
      ORDER BY (${dist("r")} <= ${AREA.NEAR}) DESC, r.n DESC
      LIMIT 12
    `;

  const [seasonalR, possibleR, commonR, movers, drift, arrivalsR, meta, commonRegionR] = await Promise.all([
    // From the weekly history (sources that publish with a delay, such as GBIF): each species' most recent arrival week.
    seasonalQ(here ? AREA.REGION : null),
    // Possibly arriving: one strong recent week, not yet confirmed by a second (see /methods). Birds only unless a class is chosen.
    possibleQ(here ? AREA.REGION : null),
    // Most recorded over the latest four weeks that have data.
    commonQ(here ? AREA.NEAR : null),
    // Surging and fading: share of the class's detections yesterday against the mean share of the 7 days before.
    sql`
      WITH e AS (
        SELECT e.day, e.grp, SUM(e.detections)::float AS tot FROM effort_daily e
        WHERE e.day >= CURRENT_DATE - 8 AND e.day < CURRENT_DATE AND e.detections >= ${minEffortDay()} GROUP BY 1, 2
      ), d AS (
        SELECT sd.scientific_name, MIN(sd.vernacular_name) AS vernacular_name, g.grp, sd.day, SUM(sd.count) AS n
        FROM species_daily sd JOIN species_group g USING (scientific_name)
        JOIN effort_daily e ON e.day = sd.day AND e.cell_lat = sd.cell_lat AND e.cell_lon = sd.cell_lon AND e.grp = g.grp
        WHERE sd.day >= CURRENT_DATE - 8 AND sd.day < CURRENT_DATE AND e.detections >= ${minEffortDay()} AND g.is_species ${only}
        GROUP BY 1, 3, 4
      ), s AS (SELECT d.*, d.n / e.tot AS share FROM d JOIN e USING (day, grp)),
      last AS (SELECT * FROM s WHERE day = CURRENT_DATE - 1),
      base AS (SELECT scientific_name, AVG(share) AS share, AVG(n) AS avg_n, COUNT(*) AS days FROM s WHERE day < CURRENT_DATE - 1 GROUP BY 1)
      SELECT l.scientific_name, l.vernacular_name, l.grp, l.n::int AS yesterday, ROUND(b.avg_n)::int AS avg7, l.share / NULLIF(b.share, 0) AS ratio
      FROM last l JOIN base b USING (scientific_name)
      WHERE b.days >= 5 AND b.avg_n >= ${scaled(100, sql`l.grp`)} AND l.n >= ${scaled(100, sql`l.grp`)}
      ORDER BY ABS(LN(l.share / NULLIF(b.share, 0))) DESC
      LIMIT 25
    `,
    // Moving: shift of the share-weighted range centre within one continent, last 3 days against days 8 to 10 ago,
    // using only cells observed for that class in both periods.
    sql`
      WITH obs AS (
        SELECT sd.scientific_name, MIN(sd.vernacular_name) AS vernacular_name, g.grp, sd.cell_lat, sd.cell_lon,
               (sd.day >= CURRENT_DATE - 3) AS recent, SUM(sd.count) AS n
        FROM species_daily sd JOIN species_group g USING (scientific_name)
        WHERE sd.day < CURRENT_DATE AND (sd.day >= CURRENT_DATE - 3 OR (sd.day >= CURRENT_DATE - 10 AND sd.day < CURRENT_DATE - 7))
          AND g.is_species ${only}
        GROUP BY 1, 3, 4, 5, 6
        HAVING SUM(sd.count) >= (CASE WHEN g.grp = 'avian' THEN ${MIN_CELL_DETECTIONS}::int ELSE 2 END)
      ), eff AS (
        SELECT e.cell_lat, e.cell_lon, e.grp,
               SUM(e.detections) FILTER (WHERE e.day >= CURRENT_DATE - 3)::float AS e_recent,
               SUM(e.detections) FILTER (WHERE e.day < CURRENT_DATE - 7)::float AS e_earlier
        FROM effort_daily e
        WHERE e.day < CURRENT_DATE AND (e.day >= CURRENT_DATE - 3 OR (e.day >= CURRENT_DATE - 10 AND e.day < CURRENT_DATE - 7))
        GROUP BY 1, 2, 3
        HAVING COALESCE(SUM(e.detections) FILTER (WHERE e.day >= CURRENT_DATE - 3), 0) >= 3 * ${minEffortDay()}
           AND COALESCE(SUM(e.detections) FILTER (WHERE e.day < CURRENT_DATE - 7), 0) >= 3 * ${minEffortDay()}
      ), r AS (
        SELECT o.scientific_name, MIN(o.vernacular_name) AS vernacular_name, grp, ${REGION} AS region, o.recent,
               SUM(o.n) AS n, COUNT(*) AS cells,
               SUM(o.n / (CASE WHEN o.recent THEN e.e_recent ELSE e.e_earlier END) * (cell_lat + 2.5))
                 / SUM(o.n / (CASE WHEN o.recent THEN e.e_recent ELSE e.e_earlier END)) AS lat
        FROM obs o JOIN eff e USING (cell_lat, cell_lon, grp)
        GROUP BY 1, 3, 4, 5
      )
      SELECT a.scientific_name, a.vernacular_name, a.grp, a.region, ROUND((a.lat - b.lat)::numeric, 1) AS drift_deg,
             ROUND(a.lat::numeric, 1) AS lat_now, a.n::int AS n, LEAST(a.cells, b.cells)::int AS cells
      FROM r a JOIN r b ON b.scientific_name = a.scientific_name AND b.region = a.region AND a.recent AND NOT b.recent
      WHERE a.n >= ${scaled(300, sql`a.grp`)} AND b.n >= ${scaled(300, sql`a.grp`)}
        AND a.cells >= (CASE WHEN a.grp = 'avian' THEN 3 ELSE 2 END) AND b.cells >= (CASE WHEN a.grp = 'avian' THEN 3 ELSE 2 END)
        AND ABS(a.lat - b.lat) >= 1
      ORDER BY ABS(a.lat - b.lat) DESC
      LIMIT 25
    `,
    // New arrivals: present in the last 2 days, absent for the 12 days before,
    // in a cell that was observed for that class on at least 8 of those 12 days.
    arrivalsQ(here ? AREA.REGION : null),
    sql`
      SELECT MIN(sd.day)::text AS first_day, MAX(sd.day)::text AS last_day, COUNT(DISTINCT sd.scientific_name) AS species, SUM(sd.count) AS detections
      FROM species_daily sd ${group ? sql`JOIN species_group g ON g.scientific_name = sd.scientific_name AND g.grp = ${group}` : sql``}`,
    here ? commonQ(AREA.REGION) : Promise.resolve([]),
  ]);
  // Near first, then the wider region, then the world when an area has too little data.
  const scope: Record<"seasonal" | "possible" | "common" | "arrivals", Scope> = { seasonal: "world", possible: "world", common: "world", arrivals: "world" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = Record<string, any>;
  async function pick(key: "seasonal" | "possible" | "arrivals", rows: readonly Row[], world: () => Promise<readonly Row[]>) {
    if (!here) return rows;
    const near = rows.filter((r) => Number(r.d) <= AREA.NEAR);
    if (near.length >= AREA.MIN_ITEMS) { scope[key] = "near"; return near; }
    if (rows.length >= AREA.MIN_ITEMS || ((key === "possible" || key === "arrivals") && rows.length)) { scope[key] = "region"; return rows; }
    const w = await world();
    if (key === "possible" || key === "arrivals") scope[key] = "region";
    return w;
  }
  const [seasonal, possible, arrivals] = await Promise.all([
    pick("seasonal", seasonalR, () => seasonalQ(null)),
    // Early signals far away mean nothing to a local visitor: show none rather than another continent's.
    pick("possible", possibleR, async () => []),
    pick("arrivals", arrivalsR, async () => []),
  ]);
  let common: readonly Row[] = commonR;
  if (here) {
    if (commonR.length >= AREA.MIN_ITEMS) scope.common = "near";
    else if (commonRegionR.length >= AREA.MIN_ITEMS) { scope.common = "region"; common = commonRegionR; }
    else common = await commonQ(null);
  }
  const homeRegion = here ? regionOf(here.cellLat, here.cellLon) : null;
  const driftAll = drift.map((r) => ({ scientificName: r.scientific_name as string, vernacularName: r.vernacular_name as string | null, group: r.grp as string, region: r.region as string, driftDeg: Number(r.drift_deg), latNow: Number(r.lat_now), n: r.n as number, cells: r.cells as number }));
  const moversAll = movers.map((r) => ({ scientificName: r.scientific_name as string, vernacularName: r.vernacular_name as string | null, group: r.grp as string, yesterday: r.yesterday as number, avg7: r.avg7 as number, ratio: Number(r.ratio) }));
  // 95% intervals by resampling cells; a change is listed only when its interval excludes "no change" (see /methods#uncertainty).
  const [driftCi, moverCi] = await Promise.all([driftIntervals(driftAll), moverIntervals(moversAll)]);
  const driftOut = driftAll
    .map((d) => { const ci = driftCi.get(`${d.scientificName}|${d.region}`) ?? null; return { ...d, driftLow: ci ? Math.round(ci[0] * 10) / 10 : null, driftHigh: ci ? Math.round(ci[1] * 10) / 10 : null }; })
    .filter((d) => d.driftLow != null && d.driftHigh != null && (d.driftLow > 0 || d.driftHigh < 0))
    .sort((a, b) => Number(b.region === homeRegion) - Number(a.region === homeRegion))
    .slice(0, 12);
  const moversOut = moversAll
    .map((m) => { const ci = moverCi.get(m.scientificName) ?? null; return { ...m, ratioLow: ci ? Math.round(ci[0] * 100) / 100 : null, ratioHigh: ci ? Math.round(ci[1] * 100) / 100 : null }; })
    .filter((m) => m.ratioLow != null && m.ratioHigh != null && (m.ratioLow > 1 || m.ratioHigh < 1))
    .slice(0, 12);
  return {
    methods: METHODS_VERSION,
    group: group ?? "all",
    area: here ? { cellLat: here.cellLat, cellLon: here.cellLon, region: homeRegion, scope } : null,
    coverage: { from: meta[0].first_day, to: meta[0].last_day, species: Number(meta[0].species), detections: Number(meta[0].detections ?? 0) },
    // Within one class, "most of the drops are bats" would be trivially true, so that part is skipped.
    summary: overview(driftOut, group ? [] : moversOut, homeRegion),
    seasonal: [...seasonal].sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : b.n - a.n)).slice(0, 12).map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, group: r.grp, cellLat: r.cell_lat, cellLon: r.cell_lon, week: r.week, n: r.n })),
    possible: [...possible].sort((a, b) => (a.week < b.week ? 1 : a.week > b.week ? -1 : b.n - a.n)).slice(0, 12).map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, group: r.grp, cellLat: r.cell_lat, cellLon: r.cell_lon, week: r.week, n: r.n, support: r.support })),
    common: common.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, group: r.grp, n: r.n, cells: r.cells })),
    movers: moversOut,
    drift: driftOut,
    arrivals: arrivals.map((r) => ({ scientificName: r.scientific_name, vernacularName: r.vernacular_name, group: r.grp, cellLat: r.cell_lat, cellLon: r.cell_lon, n: r.n })),
  };
}

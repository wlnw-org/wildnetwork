import { sql } from "@/lib/db";

/**
 * Night migration from European weather radars. Aloft (aloftdata.eu; ENRAM / BALTRAD, CC BY 4.0) publishes a vertical
 * profile of birds every 5 minutes per radar, one CSV per radar per UTC day, about two days late. For each profile in
 * darkness (sun below -6 degrees) we integrate over height: VID = sum(dens x 0.2 km) birds per km2, MTR = sum(dens x ground
 * speed x 0.2 km) birds crossing 1 km per hour, and a traffic-weighted mean direction. The band below 200 m is left out
 * (ground clutter). A gap flag means the velocity is missing, not the density, so gap bands count for density but not for
 * speed or direction. Bins whose radial velocity spread (sd_vvp) is below its threshold count as no birds (insects or rain).
 */
export const ALOFT = "https://aloftdata.s3-eu-west-1.amazonaws.com";
export const RADAR = { BIN_KM: 0.2, MIN_HEIGHT_M: 200, SUN_DARK: -6, MAX_VID: 3000, MIN_PROFILES: 24, KEEP_DAYS: 200, NORMAL_NIGHTS: 14,
  // Unusual night: at least RATIO times the radar's median of the nights before (NORMAL_NIGHTS window, MIN_NORMAL of them
  // reporting) and at least MIN_VID birds/km2. Radars whose median night over everything kept is above CLUTTER_MEDIAN
  // birds/km2 read interference (Romania, autumn 2026), not birds: drawn grey and never called unusual.
  UNUSUAL_RATIO: 3, UNUSUAL_MIN_VID: 20, MIN_NORMAL: 7, CLUTTER_MEDIAN: 150 };

/**
 * US NEXRAD (scripts/nexrad.mts): a few Level II scans per radar and night through vol2bird instead of Aloft's 5-minute
 * profiles. Scans at local solar 22:00, 00:00, 02:00 and 04:00 (the sun filter in parseVpts drops any still in twilight);
 * each counts as SCAN_WEIGHT five-minute profiles (2 hours) so the night means and RADAR.MIN_PROFILES apply unchanged.
 * Contiguous US radars only (K codes). LAG_DAYS 2 keeps the newest night in step with Aloft's.
 */
export const NEXRAD = { BUCKET: "https://unidata-nexrad-level2.s3.amazonaws.com", HOURS: [22, 24, 26, 28], SCAN_WEIGHT: 24, MIN_SCANS: 2,
  MAX_GAP_MS: 20 * 60_000, SITE: /^K[A-Z]{3}$/, DEFAULT_LON: -95, LAG_DAYS: 2 };

/** UTC times (ms) of the scans wanted for a night (local evening date) at a radar's longitude. */
export function nexradTargets(night: string, lon: number): number[] {
  const base = Date.parse(night + "T00:00:00Z");
  return NEXRAD.HOURS.map((h) => base + (h - lon / 15) * 3_600_000);
}

export function solarElevation(t: Date, lat: number, lon: number): number {
  const start = Date.UTC(t.getUTCFullYear(), 0, 0);
  const day = (t.getTime() - start) / 86_400_000;
  const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + day)) / 365);
  const solarHour = t.getUTCHours() + t.getUTCMinutes() / 60 + lon / 15;
  const ha = ((solarHour - 12) * 15 * Math.PI) / 180, la = (lat * Math.PI) / 180;
  return (Math.asin(Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha)) * 180) / Math.PI;
}

/** Night key: the local (solar) date of the evening the night began. */
export function nightOf(t: Date, lon: number): string {
  const local = new Date(t.getTime() + (lon / 15) * 3_600_000);
  if (local.getUTCHours() < 12) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}

export type Part = { night: string; n: number; vid: number; mtr: number; mtrMax: number; u: number; v: number };

/** Parse one vpts CSV into per-night parts plus the radar position. Pure, for tests. */
export function parseVpts(csv: string): { lat: number; lon: number; parts: Part[] } | null {
  const lines = csv.split("\n");
  const head = lines[0]?.split(",") ?? [];
  const c = (name: string) => head.indexOf(name);
  const I = { h: c("height"), dt: c("datetime"), dens: c("dens"), ff: c("ff"), u: c("u"), v: c("v"), gap: c("gap"), sd: c("sd_vvp"), thr: c("sd_vvp_threshold"), lat: c("radar_latitude"), lon: c("radar_longitude") };
  if (Object.values(I).some((i) => i < 0)) return null;
  let lat = NaN, lon = NaN;
  const profiles = new Map<string, { vid: number; mtr: number; u: number; v: number }>();
  for (let k = 1; k < lines.length; k++) {
    const f = lines[k].split(",");
    if (f.length < head.length) continue;
    if (Number.isNaN(lat)) { lat = Number(f[I.lat]); lon = Number(f[I.lon]); }
    const p = profiles.get(f[I.dt]) ?? { vid: 0, mtr: 0, u: 0, v: 0 };
    profiles.set(f[I.dt], p);
    if (Number(f[I.h]) < RADAR.MIN_HEIGHT_M) continue;
    const gap = f[I.gap] === "TRUE";
    const dens = Number(f[I.dens]), sd = Number(f[I.sd]), thr = Number(f[I.thr]);
    if (!Number.isFinite(dens) || dens <= 0 || (Number.isFinite(thr) && Number.isFinite(sd) && sd < thr)) continue;
    const ff = Number(f[I.ff]), u = Number(f[I.u]), v = Number(f[I.v]);
    p.vid += dens * RADAR.BIN_KM;
    if (gap) continue;
    if (Number.isFinite(ff)) p.mtr += dens * ff * 3.6 * RADAR.BIN_KM;
    if (Number.isFinite(u) && Number.isFinite(v)) { p.u += dens * u; p.v += dens * v; }
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const parts = new Map<string, Part>();
  for (const [dt, p] of profiles) {
    const t = new Date(dt);
    if (Number.isNaN(t.getTime()) || solarElevation(t, lat, lon) > RADAR.SUN_DARK || p.vid > RADAR.MAX_VID) continue;
    const night = nightOf(t, lon);
    const q = parts.get(night) ?? { night, n: 0, vid: 0, mtr: 0, mtrMax: 0, u: 0, v: 0 };
    q.n++; q.vid += p.vid; q.mtr += p.mtr; q.mtrMax = Math.max(q.mtrMax, p.mtr); q.u += p.u; q.v += p.v;
    parts.set(night, q);
  }
  return { lat, lon, parts: [...parts.values()] };
}

/** Download and store one radar-day. Returns false when Aloft has no file (yet). */
export async function importRadarDay(radar: string, day: string): Promise<boolean> {
  const url = `${ALOFT}/baltrad/daily/${radar}/${day.slice(0, 4)}/${radar}_vpts_${day.replaceAll("-", "")}.csv`;
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { "user-agent": "WildlifeNetwork/0.1" } });
  if (r.status === 404 || r.status === 403) {
    await sql`INSERT INTO radar_files (radar, file_day, status) VALUES (${radar}, ${day}, 'missing') ON CONFLICT (radar, file_day) DO UPDATE SET status = 'missing'`;
    return false;
  }
  if (!r.ok) throw new Error(`${radar} ${day}: HTTP ${r.status}`);
  const parsed = parseVpts(await r.text());
  await sql.begin(async (tx) => {
    await tx`DELETE FROM radar_part WHERE radar = ${radar} AND file_day = ${day}`;
    if (parsed) {
      await tx`INSERT INTO radar_sites (radar, lat, lon) VALUES (${radar}, ${parsed.lat}, ${parsed.lon}) ON CONFLICT (radar) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon`;
      for (const p of parsed.parts) await tx`INSERT INTO radar_part (radar, night, file_day, n, vid_sum, mtr_sum, mtr_max, u_sum, v_sum)
        VALUES (${radar}, ${p.night}, ${day}, ${p.n}, ${p.vid}, ${p.mtr}, ${p.mtrMax}, ${p.u}, ${p.v})`;
    }
    await tx`INSERT INTO radar_files (radar, file_day, status) VALUES (${radar}, ${day}, 'ok') ON CONFLICT (radar, file_day) DO UPDATE SET status = 'ok'`;
  });
  return true;
}

export async function listRadars(): Promise<string[]> {
  const r = await fetch(`${ALOFT}/?list-type=2&prefix=baltrad/daily/&delimiter=/`, { signal: AbortSignal.timeout(30_000) });
  return [...(await r.text()).matchAll(/<Prefix>baltrad\/daily\/([a-z0-9]+)\/<\/Prefix>/g)].map((m) => m[1]);
}

export type RadarNight = { radar: string; lat: number; lon: number; vid: number; mtr: number; mtrMax: number; dir: number | null; normal: number | null; profiles: number; unusual: boolean; clutter: boolean };

/** Nights with enough radars reporting, newest first, and the radars for one night with their 14-night normal. */
export async function radarNight(night?: string) {
  const nights = await sql<{ night: string; radars: number }[]>`
    SELECT night::text, COUNT(*)::int AS radars FROM (
      SELECT radar, night FROM radar_part GROUP BY 1, 2 HAVING SUM(n) >= ${RADAR.MIN_PROFILES}) x
    GROUP BY 1 HAVING COUNT(*) >= 20 ORDER BY 1 DESC LIMIT 60`;
  const pick = night && nights.some((n) => n.night === night) ? night : nights[0]?.night;
  if (!pick) return { night: null, nights: [], radars: [] as RadarNight[] };
  const [rows, clutter] = await Promise.all([nightRows(pick, pick), clutterRadars()]);
  const radars = rows.map((r) => toNight(r, clutter));
  return { night: pick, nights: nights.map((n) => n.night), radars };
}

type Row = { radar: string; night: string; lat: number; lon: number; vid: number; mtr: number; mtr_max: number; u: number; v: number; n: number; normal: number | null; k: number };

/** Radar nights from `from` to `to`, each with the median and count of its own previous NORMAL_NIGHTS nights. */
async function nightRows(from: string, to: string, onlyUnusual = false) {
  return sql<Row[]>`
    WITH nights AS (
      SELECT radar, night, SUM(n)::int AS n, SUM(vid_sum) / SUM(n) AS vid, SUM(mtr_sum) / SUM(n) AS mtr, MAX(mtr_max) AS mtr_max,
             SUM(u_sum) AS u, SUM(v_sum) AS v
      FROM radar_part WHERE night BETWEEN ${from}::date - ${RADAR.NORMAL_NIGHTS}::int AND ${to}::date
      GROUP BY 1, 2 HAVING SUM(n) >= ${RADAR.MIN_PROFILES}),
    rated AS (
      SELECT t.*, b.normal, b.k FROM nights t, LATERAL (
        SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY p.vid) AS normal, COUNT(*)::int AS k FROM nights p
        WHERE p.radar = t.radar AND p.night < t.night AND p.night >= t.night - ${RADAR.NORMAL_NIGHTS}::int) b
      WHERE t.night >= ${from}::date)
    SELECT r.radar, r.night::text, s.lat, s.lon, r.vid, r.mtr, r.mtr_max, r.u, r.v, r.n, r.normal, r.k
    FROM rated r JOIN radar_sites s USING (radar)
    WHERE NOT ${onlyUnusual} OR (r.k >= ${RADAR.MIN_NORMAL} AND r.vid >= ${RADAR.UNUSUAL_MIN_VID}
      AND r.vid >= ${RADAR.UNUSUAL_RATIO} * GREATEST(r.normal, 1))`;
}

/** Radars whose median night is implausibly high for birds over everything kept: interference. */
async function clutterRadars(): Promise<Set<string>> {
  const rows = await sql<{ radar: string }[]>`
    SELECT radar FROM (SELECT radar, night, SUM(vid_sum) / SUM(n) AS vid FROM radar_part GROUP BY 1, 2 HAVING SUM(n) >= ${RADAR.MIN_PROFILES}) x
    GROUP BY 1 HAVING percentile_cont(0.5) WITHIN GROUP (ORDER BY vid) > ${RADAR.CLUTTER_MEDIAN}`;
  return new Set(rows.map((r) => r.radar));
}

function toNight(r: Row, clutter: Set<string>): RadarNight {
  const isClutter = clutter.has(r.radar);
  return {
    radar: r.radar, lat: r.lat, lon: r.lon, vid: Math.round(r.vid * 10) / 10, mtr: Math.round(r.mtr), mtrMax: Math.round(r.mtr_max), profiles: r.n,
    dir: r.vid > 1 && (r.u || r.v) ? Math.round(((Math.atan2(r.u, r.v) * 180) / Math.PI + 360) % 360) : null,
    normal: r.normal == null ? null : Math.round(r.normal * 10) / 10, clutter: isClutter,
    unusual: !isClutter && r.k >= RADAR.MIN_NORMAL && r.vid >= RADAR.UNUSUAL_MIN_VID && r.vid >= RADAR.UNUSUAL_RATIO * Math.max(r.normal ?? 0, 1),
  };
}

/** Unusual migration nights in the last `days` nights, newest first, each with its unusual radars (interference excluded). */
const unusualMemo = new Map<number, { at: number; data: Awaited<ReturnType<typeof computeUnusual>> }>();
export async function unusualNights(days = 60) {
  const hit = unusualMemo.get(days);
  if (hit && Date.now() - hit.at < 3600_000) return hit.data;
  const data = await computeUnusual(days);
  unusualMemo.set(days, { at: Date.now(), data });
  return data;
}

async function computeUnusual(days: number) {
  const last = await sql<{ night: string }[]>`SELECT MAX(night)::text AS night FROM radar_part`;
  const to = last[0]?.night;
  if (!to) return { from: null as string | null, to: null as string | null, nights: [] as { night: string; radars: RadarNight[] }[] };
  const from = new Date(Date.parse(to + "T00:00:00Z") - (days - 1) * 86400_000).toISOString().slice(0, 10);
  const [rows, clutter] = await Promise.all([nightRows(from, to, true), clutterRadars()]);
  const by = new Map<string, RadarNight[]>();
  for (const r of rows) {
    const n = toNight(r, clutter);
    if (!n.unusual) continue;
    by.set(r.night, [...(by.get(r.night) ?? []), n]);
  }
  const nights = [...by].map(([night, radars]) => ({ night, radars: radars.sort((a, b) => b.vid / Math.max(b.normal ?? 1, 1) - a.vid / Math.max(a.normal ?? 1, 1)) }))
    .sort((a, b) => b.night.localeCompare(a.night));
  return { from, to, nights };
}

export async function pruneRadar() {
  await sql`DELETE FROM radar_part WHERE night < CURRENT_DATE - ${RADAR.KEEP_DAYS}::int`;
  await sql`DELETE FROM radar_files WHERE file_day < CURRENT_DATE - ${RADAR.KEEP_DAYS}::int`;
}

/** Great-circle distance in km. */
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Radars cover roughly 100 km around themselves; a place further than this from every radar gets no night summary. */
export const NEAR_RADAR_KM = 150;
let nearMemo: { at: number; data: Awaited<ReturnType<typeof radarNight>> } | null = null;

/** The latest night at the closest working radar (interference radars and empty nights left out), for place pages. */
export async function radarNear(lat: number, lon: number) {
  if (!nearMemo || Date.now() - nearMemo.at > 3600_000) nearMemo = { at: Date.now(), data: await radarNight() };
  const { night, radars } = nearMemo.data;
  if (!night) return null;
  let best: (RadarNight & { km: number }) | null = null;
  for (const r of radars) {
    if (r.clutter) continue;
    const d = km({ lat, lon }, r);
    if (d <= NEAR_RADAR_KM && (!best || d < best.km)) best = { ...r, km: Math.round(d) };
  }
  return best ? { night, ...best } : null;
}

/** Compass word for a direction of movement in degrees ("towards the south-west"). */
export function compass(deg: number): string {
  return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

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
export const RADAR = { BIN_KM: 0.2, MIN_HEIGHT_M: 200, SUN_DARK: -6, MAX_VID: 3000, MIN_PROFILES: 24, KEEP_DAYS: 200, NORMAL_NIGHTS: 14 };

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

export type RadarNight = { radar: string; lat: number; lon: number; vid: number; mtr: number; mtrMax: number; dir: number | null; normal: number | null; profiles: number };

/** Nights with enough radars reporting, newest first, and the radars for one night with their 14-night normal. */
export async function radarNight(night?: string) {
  const nights = await sql<{ night: string; radars: number }[]>`
    SELECT night::text, COUNT(*)::int AS radars FROM (
      SELECT radar, night FROM radar_part GROUP BY 1, 2 HAVING SUM(n) >= ${RADAR.MIN_PROFILES}) x
    GROUP BY 1 HAVING COUNT(*) >= 20 ORDER BY 1 DESC LIMIT 60`;
  const pick = night && nights.some((n) => n.night === night) ? night : nights[0]?.night;
  if (!pick) return { night: null, nights: [], radars: [] as RadarNight[] };
  const rows = await sql<{ radar: string; lat: number; lon: number; vid: number; mtr: number; mtr_max: number; u: number; v: number; n: number; normal: number | null }[]>`
    WITH nights AS (
      SELECT radar, night, SUM(n)::int AS n, SUM(vid_sum) / SUM(n) AS vid, SUM(mtr_sum) / SUM(n) AS mtr, MAX(mtr_max) AS mtr_max,
             SUM(u_sum) AS u, SUM(v_sum) AS v
      FROM radar_part WHERE night BETWEEN ${pick}::date - ${RADAR.NORMAL_NIGHTS}::int AND ${pick}::date
      GROUP BY 1, 2 HAVING SUM(n) >= ${RADAR.MIN_PROFILES})
    SELECT t.radar, s.lat, s.lon, t.vid, t.mtr, t.mtr_max, t.u, t.v, t.n,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY p.vid) FROM nights p WHERE p.radar = t.radar AND p.night < t.night) AS normal
    FROM nights t JOIN radar_sites s USING (radar) WHERE t.night = ${pick}`;
  const radars: RadarNight[] = rows.map((r) => ({
    radar: r.radar, lat: r.lat, lon: r.lon, vid: Math.round(r.vid * 10) / 10, mtr: Math.round(r.mtr), mtrMax: Math.round(r.mtr_max), profiles: r.n,
    dir: r.vid > 1 && (r.u || r.v) ? Math.round(((Math.atan2(r.u, r.v) * 180) / Math.PI + 360) % 360) : null,
    normal: r.normal == null ? null : Math.round(r.normal * 10) / 10,
  }));
  return { night: pick, nights: nights.map((n) => n.night), radars };
}

export async function pruneRadar() {
  await sql`DELETE FROM radar_part WHERE night < CURRENT_DATE - ${RADAR.KEEP_DAYS}::int`;
  await sql`DELETE FROM radar_files WHERE file_day < CURRENT_DATE - ${RADAR.KEEP_DAYS}::int`;
}

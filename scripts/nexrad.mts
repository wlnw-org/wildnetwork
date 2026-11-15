// Night bird migration over the US from NEXRAD weather radars (NOAA open data on AWS, no account), into radar_part
// next to the European Aloft radars. Per radar and night, SCANS Level II volumes spread through the night are processed
// with vol2bird (scripts/nexrad.R, needs R + vol2birdR on the server) and summarised with the same parseVpts as Europe.
// Usage: tsx scripts/nexrad.mts [nights back = 3] [concurrency = 1] [max radars]. Skips radar-nights already stored.
// Run daily by wlnw-nexrad.timer, as the wlnw user.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "../src/lib/db";
import { NEXRAD, nexradTargets, parseVpts, pruneRadar } from "../src/lib/radar";

const run = promisify(execFile);
const back = Number(process.argv[2] ?? 3), conc = Number(process.argv[3] ?? 1), maxRadars = Number(process.argv[4] ?? 1e9);
const UA = { "user-agent": "WildlifeNetwork/0.1" };
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

async function list(prefix: string, delimiter = false): Promise<string[]> {
  const out: string[] = [];
  let token = "";
  for (;;) {
    const u = `${NEXRAD.BUCKET}/?list-type=2&prefix=${prefix}${delimiter ? "&delimiter=/" : ""}${token ? `&continuation-token=${encodeURIComponent(token)}` : ""}`;
    const body = await (await fetch(u, { headers: UA, signal: AbortSignal.timeout(60_000) })).text();
    out.push(...[...body.matchAll(delimiter ? /<Prefix>([^<]+)<\/Prefix>/g : /<Key>([^<]+)<\/Key>/g)].map((m) => m[1]));
    const m = body.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    if (!m) return out;
    token = m[1];
  }
}

/** Scan time from a key like 2026/11/13/KBOX/KBOX20261113_000254_V06. */
const keyTime = (k: string) => { const m = k.match(/(\d{8})_(\d{6})/); return m ? Date.parse(`${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}T${m[2].slice(0, 2)}:${m[2].slice(2, 4)}:${m[2].slice(4)}Z`) : NaN; };

async function radarNight(code: string, night: string, lon: number): Promise<"ok" | "missing"> {
  const targets = nexradTargets(night, lon);
  const days = [...new Set(targets.map(day))];
  const keys = (await Promise.all(days.map((d) => list(`${d.replaceAll("-", "/")}/${code}/`)))).flat().filter((k) => /_V\d+$/.test(k));
  const pick = [...new Set(targets.map((t) => {
    let best: string | null = null, gap = NEXRAD.MAX_GAP_MS;
    for (const k of keys) { const g = Math.abs(keyTime(k) - t); if (g < gap) { gap = g; best = k; } }
    return best;
  }).filter((k): k is string => !!k))];
  if (pick.length < NEXRAD.MIN_SCANS) return "missing";
  const dir = await mkdtemp(join(tmpdir(), "nexrad-"));
  try {
    const files: string[] = [];
    for (const k of pick) {
      const r = await fetch(`${NEXRAD.BUCKET}/${k}`, { headers: UA, signal: AbortSignal.timeout(120_000) });
      if (!r.ok) continue;
      const f = join(dir, k.split("/").pop()!);
      await writeFile(f, Buffer.from(await r.arrayBuffer()));
      files.push(f);
    }
    const out = join(dir, "vpts.csv");
    try { await run("Rscript", [join(import.meta.dirname, "nexrad.R"), out, ...files], { timeout: 30 * 60_000 }); } catch { return "missing"; }
    const parsed = parseVpts(await readFile(out, "utf8"));
    const part = parsed?.parts.find((p) => p.night === night);
    if (!parsed || !part || part.n < NEXRAD.MIN_SCANS) return "missing";
    // Each scan stands for SCAN_WEIGHT five-minute profiles, so night means and RADAR.MIN_PROFILES work as for Europe.
    const w = NEXRAD.SCAN_WEIGHT, radar = code.toLowerCase();
    await sql.begin(async (tx) => {
      await tx`INSERT INTO radar_sites (radar, lat, lon) VALUES (${radar}, ${parsed.lat}, ${parsed.lon}) ON CONFLICT (radar) DO UPDATE SET lat = EXCLUDED.lat, lon = EXCLUDED.lon`;
      await tx`DELETE FROM radar_part WHERE radar = ${radar} AND file_day = ${night}`;
      await tx`INSERT INTO radar_part (radar, night, file_day, n, vid_sum, mtr_sum, mtr_max, u_sum, v_sum)
        VALUES (${radar}, ${night}, ${night}, ${part.n * w}, ${part.vid * w}, ${part.mtr * w}, ${part.mtrMax}, ${part.u * w}, ${part.v * w})`;
    });
    return "ok";
  } finally { await rm(dir, { recursive: true, force: true }); }
}

const today = Date.now();
const nights: string[] = [];
for (let d = NEXRAD.LAG_DAYS; d < NEXRAD.LAG_DAYS + back; d++) nights.push(day(today - d * 86_400_000));
const codes = (await list(`${day(today - 86_400_000).replaceAll("-", "/")}/`, true))
  .map((p) => p.split("/")[3]).filter((c) => NEXRAD.SITE.test(c)).slice(0, maxRadars);
const sites = new Map((await sql<{ radar: string; lon: number }[]>`SELECT radar, lon FROM radar_sites`).map((r) => [r.radar, r.lon]));
const done = new Set((await sql<{ k: string }[]>`
  SELECT radar || '|' || file_day::text AS k FROM radar_files WHERE file_day >= ${nights[nights.length - 1]}`).map((r) => r.k));
const jobs = codes.flatMap((c) => nights.map((n) => [c, n] as const)).filter(([c, n]) => !done.has(`${c.toLowerCase()}|${n}`));
console.log(`${codes.length} radars, ${nights.length} nights, ${jobs.length} to process`);
let ok = 0, missing = 0, failed = 0, i = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: conc }, async () => {
  while (i < jobs.length) {
    const [c, n] = jobs[i++];
    try {
      const s = await radarNight(c, n, sites.get(c.toLowerCase()) ?? NEXRAD.DEFAULT_LON);
      if (s === "ok") ok++; else missing++;
      await sql`INSERT INTO radar_files (radar, file_day, status) VALUES (${c.toLowerCase()}, ${n}, ${s}) ON CONFLICT (radar, file_day) DO UPDATE SET status = EXCLUDED.status`;
    } catch (e) { failed++; console.error(c, n, String(e)); }
    const k = ok + missing + failed;
    if (k % 20 === 0) console.log(`${k}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}));
await pruneRadar();
console.log(`done: ${ok} stored, ${missing} missing, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
await sql.end();

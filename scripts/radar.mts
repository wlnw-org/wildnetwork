// Import night migration profiles from Aloft (European weather radars, CC BY 4.0) into radar_part.
// Usage: tsx scripts/radar.mts [days back = 5] [concurrency = 4]. Skips radar-days already stored; a day is retried
// while it is missing and younger than 5 days (Aloft publishes about two days late). Run daily by wlnw-radar.timer.
import { sql } from "../src/lib/db";
import { importRadarDay, listRadars, pruneRadar } from "../src/lib/radar";

const days = Number(process.argv[2] ?? 5), conc = Number(process.argv[3] ?? 4);
const radars = await listRadars();
const today = new Date();
const want: string[] = [];
for (let d = 2; d <= days + 1; d++) want.push(new Date(today.getTime() - d * 86_400_000).toISOString().slice(0, 10));
const done = new Set((await sql<{ k: string }[]>`
  SELECT radar || '|' || file_day::text AS k FROM radar_files
  WHERE file_day >= ${want[want.length - 1]} AND (status = 'ok' OR file_day < CURRENT_DATE - 5)`).map((r) => r.k));
const jobs = radars.flatMap((r) => want.map((d) => [r, d] as const)).filter(([r, d]) => !done.has(`${r}|${d}`));
console.log(`${radars.length} radars, ${want.length} days, ${jobs.length} to fetch`);
let ok = 0, missing = 0, failed = 0, i = 0;
const t0 = Date.now();
await Promise.all(Array.from({ length: conc }, async () => {
  while (i < jobs.length) {
    const [r, d] = jobs[i++];
    try { if (await importRadarDay(r, d)) ok++; else missing++; } catch (e) { failed++; console.error(String(e)); }
    if ((ok + missing + failed) % 200 === 0) console.log(`${ok + missing + failed}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)} s)`);
  }
}));
await pruneRadar();
console.log(`done: ${ok} stored, ${missing} missing, ${failed} failed, ${Math.round((Date.now() - t0) / 1000)} s`);
await sql.end();

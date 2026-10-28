import { after } from "next/server";
import { pullAll } from "@/lib/connectors";
import { sql } from "@/lib/db";
import { refreshRange } from "@/lib/range";
import { recomputePhenology } from "@/lib/phenology";
import { refreshRollups } from "@/lib/rollups";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";
import { refreshGbifWeekly } from "@/lib/gbif";
import { refreshSourceEffort } from "@/lib/rollups";
import { refreshOptins } from "@/lib/optin";
import { weeklyReindex } from "@/lib/storage";
import { ALERTS_ENABLED, checkAlerts } from "@/lib/alerts";
import { warmHistory } from "@/lib/history";
import { sendDigests } from "@/lib/studies";

export const maxDuration = 300;

/** Live health: last connector runs and totals, for the top-bar status dot. */
// Preview deployments share the production database: they read it, but never pull, roll up or recompute, so unmerged
// connector code cannot write to production (or publish records the merged code would hold back).
const BACKGROUND_WRITES = process.env.VERCEL_ENV !== "preview";

export async function GET() {
  const [pulls, totals] = await Promise.all([
    sql`SELECT connector, last_run_at, last_count, last_error FROM pull_state WHERE connector NOT LIKE '!_%' ESCAPE '!' ${BIRDWEATHER_PAUSED ? sql`AND connector <> 'birdweather'` : sql``} ORDER BY connector`,
    sql`SELECT (SELECT COUNT(*) FROM events WHERE event_start > now() - interval '1 hour') AS events_1h,
               (SELECT COUNT(*) FROM deployments) AS sensors,
               (SELECT SUM(count) FROM species_daily) AS detections,
               (SELECT COUNT(DISTINCT scientific_name) FROM species_daily) AS species`,
  ]);
  const newest = pulls.reduce<number>((m, p) => Math.max(m, p.last_run_at ? new Date(p.last_run_at).getTime() : 0), 0);
  // Self-healing ingest: if no scheduler has pulled recently, a visit triggers one in the background.
  // The conditional UPDATE is the lock, so concurrent visitors start at most one pull.
  if (BACKGROUND_WRITES && newest < Date.now() - 4 * 60_000) {
    after(async () => {
      const claimed = await sql`
        INSERT INTO pull_state (connector, last_run_at) VALUES ('_visit_lock', now())
        ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '4 minutes'
        RETURNING connector`;
      if (claimed.length) await pullAll();
    });
  }
  // Hourly rollups ride on the same trigger, with their own lock, so any uptime pinger keeps insights fresh.
  if (BACKGROUND_WRITES) after(async () => {
    const claimed = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_rollup_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '55 minutes'
      RETURNING connector`;
    if (claimed.length) await refreshRollups();
    // Arrival dates are recomputed once a day from the weekly history.
    const daily = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_phenology_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '23 hours'
      RETURNING connector`;
    if (daily.length) { await refreshRange(60_000).catch(() => null); await recomputePhenology(); }
    // GBIF weekly history: the last 3 weeks, once every 6 hours, within the function's time budget.
    const gb = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_gbif_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '6 hours'
      RETURNING connector`;
    if (gb.length) { await refreshGbifWeekly(3, 200_000); await refreshSourceEffort("28"); }
    // Index bloat from all-day upserts is most of the database's growth: rebuilt online once a week (src/lib/storage.ts).
    const rx = await weeklyReindex().catch(() => null);
    if (rx) console.log(`weekly reindex: ${rx.beforeMb} MB -> ${rx.afterMb} MB`);
  });
  // Opted-in BirdWeather stations: their own daily counts, every 30 minutes, in their own background task.
  if (BACKGROUND_WRITES) after(async () => {
    const oi = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_optin_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '30 minutes'
      RETURNING connector`;
    if (oi.length) await refreshOptins(90_000);
    // Species arrival emails, every 6 hours (src/lib/alerts.ts).
    const al = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_alerts_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '6 hours'
      RETURNING connector`;
    if (al.length) {
      const r = await checkAlerts(60_000).catch((e) => { console.error("alerts", e); return null; });
      if (r?.sent) console.log(`alerts: ${r.sent} sent of ${r.checked} due`);
      // Study-area digests ride on the same 6-hourly slot; each study gets at most one a week (src/lib/studies.ts).
      const dg = await sendDigests(60_000).catch((e) => { console.error("digests", e); return 0; });
      if (dg) console.log(`study digests: ${dg} sent`);
    }
  });
  // Past-period map summaries (7d / 30d / 12m per class): hourly check, each summary renewed after 3.5 hours (src/lib/history.ts).
  if (BACKGROUND_WRITES) after(async () => {
    const hl = await sql`
      INSERT INTO pull_state (connector, last_run_at) VALUES ('_history_lock', now())
      ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '1 hour'
      RETURNING connector`;
    if (hl.length) {
      const n = await warmHistory(240_000).catch((e) => { console.error("history warm", e); return 0; });
      console.log(`history: ${n} summaries refreshed`);
    }
  });
  return Response.json({
    ask: process.env.ASK_ENABLED === "true" && !BIRDWEATHER_PAUSED,
    alerts: ALERTS_ENABLED && !BIRDWEATHER_PAUSED,
    paused: BIRDWEATHER_PAUSED ? ["birdweather"] : [],
    live: newest > Date.now() - 15 * 60_000,
    lastPullAt: newest ? new Date(newest).toISOString() : null,
    connectors: pulls.map((p) => ({ name: p.connector, lastRunAt: p.last_run_at, lastCount: p.last_count, error: p.last_error })),
    events1h: Number(totals[0].events_1h), sensors: Number(totals[0].sensors), detections: Number(totals[0].detections ?? 0), species: Number(totals[0].species),
  }, { headers: { "cache-control": "public, s-maxage=30" } });
}

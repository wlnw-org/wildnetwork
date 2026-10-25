import { sql } from "@/lib/db";

/**
 * Keeps the database well under Neon's storage cap (1 GB per project on the free plan; over it, writes fail).
 *
 * Most growth is not data: the rollup tables are rewritten by upserts all day, so their indexes bloat. Rebuilding
 * them online once a week took the database from 673 MB to 529 MB on 2026-10-26 without removing a row.
 * Above EMERGENCY_MB the live windows are also shortened until there is room again.
 */
export const STORAGE = { CAP_MB: 1024, WARN_MB: 850, EMERGENCY_MB: 950 };
const REINDEX_TABLES = ["species_daily", "species_weekly", "events", "species_group", "deployments", "effort_weekly_source", "effort_weekly", "effort_daily"];

export async function databaseMb(): Promise<number> {
  const [row] = await sql<{ mb: number }[]>`SELECT (pg_database_size(current_database()) / 1048576)::int AS mb`;
  return row.mb;
}

/** Weekly online index rebuild (REINDEX CONCURRENTLY: reads and writes carry on). Takes seconds per table. */
export async function weeklyReindex(): Promise<{ beforeMb: number; afterMb: number } | null> {
  const claimed = await sql`
    INSERT INTO pull_state (connector, last_run_at) VALUES ('_reindex_lock', now())
    ON CONFLICT (connector) DO UPDATE SET last_run_at = now() WHERE pull_state.last_run_at < now() - interval '7 days'
    RETURNING connector`;
  if (!claimed.length) return null;
  const beforeMb = await databaseMb();
  for (const t of REINDEX_TABLES) {
    // Table names come from the constant above, never from input.
    await sql.unsafe(`REINDEX TABLE CONCURRENTLY ${t}`).catch((e) => console.error("reindex", t, e));
  }
  return { beforeMb, afterMb: await databaseMb() };
}

/**
 * Emergency brake, run after every prune: above EMERGENCY_MB, iNaturalist and GBIF events keep 3 days instead of 7 and
 * daily rollups 21 days instead of 28 (the 30-day charts then start a week later). Weekly history is never touched.
 */
export async function emergencyTrim(): Promise<boolean> {
  if ((await databaseMb()) < STORAGE.EMERGENCY_MB) return false;
  console.warn(`database above ${STORAGE.EMERGENCY_MB} MB: shortening live windows`);
  await sql`DELETE FROM events WHERE source_system IN ('inaturalist', 'gbif') AND event_start < now() - interval '3 days'`;
  await sql`DELETE FROM species_daily WHERE day < CURRENT_DATE - 21`;
  return true;
}

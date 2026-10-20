// First OBIS backfill: runs the connector repeatedly (India box first, then the global sample) until every region's walk is
// done or the row cap in src/config/sources.json is reached. Logs row counts and database size after each run.
// Usage: pnpm backfill:obis [maxRuns=40]   (prod: pnpm exec tsx --env-file=.env.production.local scripts/backfill-obis.mts)
import { prune, runConnector } from "../src/lib/connectors";
import { obis } from "../src/lib/connectors/obis";
import { sql } from "../src/lib/db";

const maxRuns = Number(process.argv[2] ?? 40);
for (let i = 1; i <= maxRuns; i++) {
  await sql`UPDATE pull_state SET last_run_at = NULL, last_error = NULL WHERE connector = 'obis'`;
  const r = await runConnector(obis);
  const [{ n, size }] = await sql<{ n: number; size: string }[]>`
    SELECT (SELECT count(*) FROM events WHERE source_system = 'obis')::int AS n, pg_size_pretty(pg_database_size(current_database())) AS size`;
  console.log(`run ${i}: +${r.inserted} new, ${r.updated} updated${r.error ? `, error ${r.error}` : ""}; obis rows ${n}; database ${size}`);
  for (const note of r.notes ?? []) console.log("   ", note);
  if (r.error || (r.notes ?? []).some((x) => /cap reached|all regions done/.test(x))) break;
}
await prune();
await sql.end();

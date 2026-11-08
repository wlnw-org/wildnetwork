import { hashIp } from "@/lib/auth";
import { sql } from "@/lib/db";

/** Desktop and other app usage, counted on wlnw.org without identifying anyone: daily totals per version and system, and a
 * keyed hash of the IP address per day (kept 35 days) to count distinct installs. See drizzle/0036_app_usage.sql and /privacy#apps. */
const tidy = (s: string | null | undefined, max = 24) => (s ?? "").toLowerCase().replace(/[^a-z0-9.\-_]/g, "").slice(0, max);

export async function recordUse(req: Request, app: string, event: string, version?: string | null, os?: string | null): Promise<void> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const v = tidy(version), o = tidy(os);
  try {
    await sql`INSERT INTO app_usage (day, app, event, version, os, n) VALUES (${day}, ${app}, ${event}, ${v}, ${o}, 1)
      ON CONFLICT (day, app, event, version, os) DO UPDATE SET n = app_usage.n + 1`;
    await sql`INSERT INTO app_seen (day, app, event, key_hash) VALUES (${day}, ${app}, ${event}, ${hashIp("app", ip).slice(0, 32)})
      ON CONFLICT DO NOTHING`;
    if (Math.random() < 0.02) await sql`DELETE FROM app_seen WHERE day < CURRENT_DATE - 35`;
  } catch (e) { console.error("app usage", e); } // counting must never break an update check or a download
}

export interface UsageDay { day: string; event: string; n: number; unique: number }
export interface UsageSplit { event: string; key: string; n: number }

export async function usageStats(app: string, days = 30) {
  const daily = await sql<UsageDay[]>`
    SELECT u.day::text AS day, u.event, u.n, COALESCE(s.unique, 0)::int AS unique
    FROM (SELECT day, event, SUM(n)::int AS n FROM app_usage WHERE app = ${app} AND day > CURRENT_DATE - ${days}::int GROUP BY day, event) u
    LEFT JOIN (SELECT day, event, COUNT(*) AS unique FROM app_seen WHERE app = ${app} GROUP BY day, event) s USING (day, event)
    ORDER BY u.day DESC, u.event`;
  const versions = await sql<UsageSplit[]>`SELECT event, version AS key, SUM(n)::int AS n FROM app_usage
    WHERE app = ${app} AND day > CURRENT_DATE - ${days}::int GROUP BY event, version ORDER BY n DESC`;
  const systems = await sql<UsageSplit[]>`SELECT event, os AS key, SUM(n)::int AS n FROM app_usage
    WHERE app = ${app} AND day > CURRENT_DATE - ${days}::int GROUP BY event, os ORDER BY n DESC`;
  const distinct = async (d: number) => (await sql<{ n: number }[]>`SELECT COUNT(DISTINCT key_hash)::int AS n FROM app_seen
    WHERE app = ${app} AND event = 'check' AND day > CURRENT_DATE - ${d}::int`)[0].n;
  return { daily, versions, systems, active7: await distinct(7), active30: await distinct(30) };
}

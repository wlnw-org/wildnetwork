/**
 * Class mode for the daily bird sound. Pure helpers (tested in quizClass.test.ts) plus the small database part.
 * Only anonymous counts are kept per class and day; classes are deleted CLASS.KEEP_DAYS after they were made.
 */
import { sql } from "@/lib/db";
import { isArea, type XcArea } from "@/lib/xenocanto";
import { CLASS, newCode } from "@/lib/quizClassCode";
export { CLASS, cleanCode, newCode, tally, type DayResult } from "@/lib/quizClassCode";

export async function createClass(area: XcArea, ipHash: string): Promise<{ code: string } | { error: string }> {
  const [{ n }] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM quiz_classes WHERE ip_hash = ${ipHash} AND created_at > now() - interval '1 day'`;
  if (n >= CLASS.PER_DAY) return { error: "Too many classes from this address today. Please try again tomorrow." };
  await sql`DELETE FROM quiz_classes WHERE created_at < now() - make_interval(days => ${CLASS.KEEP_DAYS})`;
  await sql`DELETE FROM quiz_class_answers a WHERE NOT EXISTS (SELECT 1 FROM quiz_classes c WHERE c.code = a.code)`;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    const [row] = await sql<{ code: string }[]>`
      INSERT INTO quiz_classes (code, area, ip_hash) VALUES (${code}, ${area}, ${ipHash}) ON CONFLICT DO NOTHING RETURNING code`;
    if (row) return { code };
  }
  return { error: "Could not make a class code. Please try again." };
}

export async function getClass(code: string): Promise<{ code: string; area: XcArea; created: string } | null> {
  const [row] = await sql<{ code: string; area: string; created: Date }[]>`SELECT code, area, created_at AS created FROM quiz_classes WHERE code = ${code}`;
  return row && isArea(row.area) ? { code: row.code, area: row.area, created: row.created.toISOString() } : null;
}

export async function addAnswer(code: string, day: string, pick: string): Promise<void> {
  await sql`INSERT INTO quiz_class_answers (code, day, pick, n) VALUES (${code}, ${day}, ${pick}, 1)
    ON CONFLICT (code, day, pick) DO UPDATE SET n = quiz_class_answers.n + 1`;
}

/** Pick counts per day for the last CLASS.HISTORY_DAYS days, newest first. */
export async function classPicks(code: string): Promise<Record<string, Record<string, number>>> {
  const rows = await sql<{ day: string; pick: string; n: number }[]>`
    SELECT day::text AS day, pick, n FROM quiz_class_answers
    WHERE code = ${code} AND day > CURRENT_DATE - ${CLASS.HISTORY_DAYS}::int ORDER BY day DESC`;
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.day] ??= {})[r.pick] = r.n;
  return out;
}

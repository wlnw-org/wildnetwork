import { sql } from "@/lib/db";
import { memo } from "@/lib/memo";
import { makePuzzle, QUIZ, quizDay, type Candidate, type Puzzle } from "@/lib/quiz";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { xcPool } from "@/lib/xcPool";
import { XcError, type XcArea } from "@/lib/xenocanto";

/** xeno-canto world area of a 5 degree cell, by its centre (mirrors areaFor in xenocanto.ts). */
const CELL_AREA = sql`CASE
  WHEN s.cell_lon + 2.5 < -30 THEN 'america'
  WHEN s.cell_lon + 2.5 < 60 AND s.cell_lat + 2.5 >= 35 THEN 'europe'
  WHEN s.cell_lon + 2.5 < 60 THEN 'africa'
  WHEN s.cell_lon + 2.5 >= 110 AND s.cell_lat + 2.5 < -10 THEN 'australia'
  ELSE 'asia' END`;

/** The area's most recorded birds over the last four weeks of weekly data, with English names. Sensitive taxa left out. */
async function candidates(area: XcArea): Promise<Candidate[]> {
  const rows = await sql<{ scientific_name: string; name: string; n: number }[]>`
    SELECT s.scientific_name, MIN(s.vernacular_name) AS name, SUM(s.count)::int AS n
    FROM species_weekly s JOIN species_group g USING (scientific_name)
    WHERE s.week > (SELECT MAX(week) FROM species_weekly WHERE count >= 3) - 28
      AND g.is_species AND g.grp = 'avian' AND ${CELL_AREA} = ${area}
    GROUP BY 1 HAVING MIN(s.vernacular_name) IS NOT NULL
    ORDER BY 3 DESC LIMIT ${QUIZ.CANDIDATES * 2}`;
  return rows
    .filter((r) => /^[A-Z][a-z-]+ [a-z-]+$/.test(r.scientific_name) && !isSensitiveTaxon([r.scientific_name, r.scientific_name.split(" ")[0]]))
    .slice(0, QUIZ.CANDIDATES)
    .map((r) => ({ scientificName: r.scientific_name, name: r.name, n: r.n }));
}

async function build(day: string, area: XcArea): Promise<Puzzle | null> {
  const key = process.env.XENO_CANTO_API_KEY;
  if (!key) return null;
  const recent = await sql<{ a: string }[]>`
    SELECT data->>'answer' AS a FROM history_cache
    WHERE key LIKE ${`quiz|%|${area}`} AND key < ${`quiz|${day}|${area}`} AND computed_at > now() - make_interval(days => ${QUIZ.NO_REPEAT_DAYS})`;
  const puzzle = await makePuzzle(day, area, await candidates(area), recent.map((r) => r.a), async (name) => {
    try { return (await xcPool(name, area, key)) ?? []; } catch (e) { if (e instanceof XcError) return []; throw e; }
  });
  if (!puzzle) return null;
  // Both app copies may build at once: the first stored puzzle wins, so everyone gets the same one.
  await sql`INSERT INTO history_cache (key, data) VALUES (${`quiz|${day}|${area}`}, ${sql.json(puzzle as never)}) ON CONFLICT (key) DO NOTHING`;
  await sql`DELETE FROM history_cache WHERE key LIKE 'quiz|%' AND computed_at < now() - interval '60 days'`;
  const [stored] = await sql<{ data: Puzzle }[]>`SELECT data FROM history_cache WHERE key = ${`quiz|${day}|${area}`}`;
  return stored?.data ?? puzzle;
}

/** Today's puzzle for an area (built on first request), or null when none could be made. */
export async function getPuzzle(area: XcArea, day = quizDay()): Promise<Puzzle | null> {
  return memo(`quiz|${day}|${area}`, 10 * 60_000, 0, async () => {
    const [row] = await sql<{ data: Puzzle }[]>`SELECT data FROM history_cache WHERE key = ${`quiz|${day}|${area}`}`;
    return row?.data ?? build(day, area);
  });
}

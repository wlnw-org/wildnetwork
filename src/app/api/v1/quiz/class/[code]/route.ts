import { quizDay } from "@/lib/quiz";
import { addAnswer, classPicks, cleanCode, getClass, tally } from "@/lib/quizClass";
import { getPuzzle, storedPuzzle } from "@/lib/quizStore";

type Ctx = { params: Promise<{ code: string }> };

/**
 * GET -> the class (its area), today's puzzle and anonymous results for the last 7 days (answered, right, picks per name).
 * Read by the teacher view every few seconds and by pupils' pages to lock the area.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const code = cleanCode((await params).code);
  const c = code ? await getClass(code) : null;
  if (!c) return Response.json({ error: "No class with that code." }, { status: 404, headers: { "cache-control": "no-store" } });
  const day = quizDay();
  const puzzle = await getPuzzle(c.area, day).catch(() => null);
  const picks = await classPicks(c.code);
  // Past puzzles of the area, for the right answer of earlier days (stored in history_cache, so no new xeno-canto requests).
  const days = await Promise.all(Object.keys(picks).map(async (d) => {
    const p = d === day ? puzzle : await storedPuzzle(c.area, d).catch(() => null);
    return { ...tally(d, picks[d], p?.answer ?? null), answer: p?.answer ?? null, names: p ? Object.fromEntries(p.options.map((o) => [o.scientificName, o.name])) : {} };
  }));
  return Response.json({ code: c.code, area: c.area, day, puzzle, results: days }, { headers: { "cache-control": "no-store" } });
}

/** POST {pick} -> counts one pupil's answer to today's sound (anonymous; each browser sends once a day). */
export async function POST(req: Request, { params }: Ctx) {
  const code = cleanCode((await params).code);
  const c = code ? await getClass(code) : null;
  if (!c) return Response.json({ error: "No class with that code." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const day = quizDay();
  const puzzle = await getPuzzle(c.area, day).catch(() => null);
  if (!puzzle || !puzzle.options.some((o) => o.scientificName === body?.pick)) return Response.json({ error: "Not one of today's names." }, { status: 400 });
  await addAnswer(c.code, day, body.pick);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}

import { quizDay } from "@/lib/quiz";
import { getPuzzle } from "@/lib/quizStore";
import { isArea } from "@/lib/xenocanto";

/**
 * ?area=europe -> today's sound quiz for that xeno-canto world area: { puzzle } or { puzzle: null }.
 * Answers are checked in the browser; the quiz is for fun and keeps no scores on the server.
 */
export async function GET(req: Request) {
  const area = new URL(req.url).searchParams.get("area");
  if (!isArea(area)) return Response.json({ error: "area must be africa, america, asia, australia or europe" }, { status: 400 });
  const day = quizDay();
  try {
    const puzzle = await getPuzzle(area, day);
    // Until the next UTC midnight at most, so nobody is served yesterday's puzzle.
    const left = Math.max(60, Math.floor((Date.parse(day + "T00:00:00Z") + 86_400_000 - Date.now()) / 1000));
    const age = Math.min(600, left);
    return Response.json({ day, puzzle }, { headers: { "cache-control": `public, max-age=${age}, s-maxage=${age}` } });
  } catch (e) {
    console.error("quiz", e);
    return Response.json({ day, puzzle: null }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

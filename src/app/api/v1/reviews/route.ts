import { sql } from "@/lib/db";
import { getSession, sameOrigin } from "@/lib/orcid";

const VERDICTS = ["correct", "misid", "resident", "unsure"];

/**
 * Review one arrival estimate. Body: { species, cellLat, cellLon, verdict: correct|misid|resident|unsure|null, note? }.
 * One current verdict per researcher; verdict null withdraws it. Reviews are public with the reviewer's name and ORCID iD.
 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Forbidden" }, { status: 403 });
  const me = await getSession();
  if (!me) return Response.json({ error: "Sign in with ORCID to review." }, { status: 401 });
  let b: { species?: string; cellLat?: number; cellLon?: number; verdict?: string | null; note?: string };
  try { b = await req.json(); } catch { return Response.json({ error: "Body must be JSON." }, { status: 400 }); }
  const lat = Number(b.cellLat), lon = Number(b.cellLon);
  const [p] = await sql`SELECT 1 FROM phenology WHERE scientific_name = ${b.species ?? ""} AND cell_lat = ${lat} AND cell_lon = ${lon}`;
  if (!p) return Response.json({ error: "No such arrival estimate." }, { status: 404 });
  if (b.verdict == null) {
    await sql`DELETE FROM arrival_reviews WHERE scientific_name = ${b.species!} AND cell_lat = ${lat} AND cell_lon = ${lon} AND orcid = ${me.orcid}`;
    return Response.json({ ok: true });
  }
  if (!VERDICTS.includes(b.verdict)) return Response.json({ error: "Unknown verdict." }, { status: 400 });
  const [{ today }] = await sql<{ today: number }[]>`SELECT COUNT(*)::int AS today FROM arrival_reviews WHERE orcid = ${me.orcid} AND created_at > now() - interval '1 day'`;
  if (today >= 500) return Response.json({ error: "That is a lot of reviews for one day. Please continue tomorrow." }, { status: 429 });
  await sql`INSERT INTO arrival_reviews (scientific_name, cell_lat, cell_lon, orcid, verdict, note)
    VALUES (${b.species!}, ${lat}, ${lon}, ${me.orcid}, ${b.verdict}, ${(b.note ?? "").trim().slice(0, 500) || null})
    ON CONFLICT (scientific_name, cell_lat, cell_lon, orcid) DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note, created_at = now()`;
  return Response.json({ ok: true });
}

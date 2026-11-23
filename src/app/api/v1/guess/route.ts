import { sql } from "@/lib/db";
import { cellOf, openForGuess, type Arrival } from "@/lib/engage";
import { memo } from "@/lib/memo";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";

const OPEN_MAX = 40;

/**
 * Guess the arrival.
 * GET /api/v1/guess?lat=51.5&lon=-0.1 -> { open: migrants due in the area in the next 1 to 34 weeks (last season's
 *   arrival plus a year), arrivals: every current arrival date in the area }. The browser keeps the guesses and scores them
 *   when an arrival date for the new season appears (src/lib/engage.ts score()).
 * Same arrival rules as /api/v1/arrivals: arrival_support >= 0.5. Sensitive species are left out.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (!p.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  }
  const { cellLat, cellLon } = cellOf(lat, lon);
  const today = new Date().toISOString().slice(0, 10);
  const data = await memo(`guess|${cellLat}|${cellLon}|${today}`, 6 * 3_600_000, 6 * 3_600_000, async () => {
    // Birds only, most recorded first: the game is about migrants people know.
    const rows = await sql<{ sci: string; name: string | null; week: string; low: string | null; high: string | null; n: number }[]>`
      SELECT p.scientific_name AS sci, COALESCE(p.vernacular_name, t.name) AS name, p.arrival_week::text AS week,
             p.arrival_low::text AS low, p.arrival_high::text AS high, p.total_n AS n
      FROM phenology p JOIN species_group g USING (scientific_name)
      LEFT JOIN LATERAL (SELECT vernacular_name AS name FROM gbif_taxa x WHERE x.scientific_name = p.scientific_name AND x.vernacular_name IS NOT NULL LIMIT 1) t ON true
      WHERE p.cell_lat = ${cellLat} AND p.cell_lon = ${cellLon} AND g.is_species AND g.grp = 'avian' AND COALESCE(p.arrival_support, 1) >= 0.5
      ORDER BY p.total_n DESC`;
    const arrivals: Arrival[] = rows.filter((r) => !isSensitiveTaxon([r.sci, r.sci.split(" ")[0]]));
    const rank = new Map(rows.map((r, i) => [r.sci, i]));
    const open = openForGuess(arrivals, today).sort((a, b) => rank.get(a.sci)! - rank.get(b.sci)!).slice(0, OPEN_MAX)
      .sort((a, b) => (a.usual < b.usual ? -1 : a.usual > b.usual ? 1 : 0))
      .map(({ sci, name, week, usual, usualLow, usualHigh }) => ({ sci, name, week, usual, usualLow, usualHigh }));
    return { cell: { lat: cellLat, lon: cellLon }, today, open, arrivals: Object.fromEntries(arrivals.map((a) => [a.sci, a.week])) };
  });
  return Response.json(data, { headers: { "cache-control": "public, max-age=3600, s-maxage=21600" } });
}

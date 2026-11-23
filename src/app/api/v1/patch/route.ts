import { sql } from "@/lib/db";
import { cellOf, newest, type PatchSpecies } from "@/lib/engage";
import { memo } from "@/lib/memo";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";

const GROUPS = ["avian", "bat", "amphibian", "insect", "mammal"];

/**
 * GET /api/v1/patch?lat=13.08&lon=80.27[&group=avian] -> the species recorded this calendar year in the 5 degree area
 * around a point (all sources, weekly rows; display only), with the week each was first and last recorded, and the
 * species first recorded in the area's latest week. Sensitive species are counted, not named.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  if (!p.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat and lon required" }, { status: 400 });
  }
  const group = GROUPS.includes(p.get("group") ?? "") ? p.get("group")! : "avian";
  const { cellLat, cellLon } = cellOf(lat, lon);
  const year = new Date().getUTCFullYear();
  const data = await memo(`patch|${cellLat}|${cellLon}|${group}|${year}`, 6 * 3_600_000, 6 * 3_600_000, async () => {
    const rows = await sql<{ sci: string; name: string | null; first: string; last: string; n: number }[]>`
      WITH y AS (
        SELECT s.scientific_name AS sci, MIN(s.vernacular_name) AS name, MIN(s.week)::text AS first, MAX(s.week)::text AS last, SUM(s.count)::int AS n
        FROM species_weekly s JOIN species_group g USING (scientific_name)
        WHERE s.cell_lat = ${cellLat} AND s.cell_lon = ${cellLon} AND s.week >= make_date(${year}, 1, 1) AND g.is_species AND g.grp = ${group}
        GROUP BY 1)
      SELECT y.sci, COALESCE(y.name, t.name) AS name, y.first, y.last, y.n FROM y
      LEFT JOIN LATERAL (SELECT vernacular_name AS name FROM gbif_taxa x WHERE x.scientific_name = y.sci AND x.vernacular_name IS NOT NULL LIMIT 1) t ON true
      ORDER BY y.first DESC, y.n DESC`;
    const sensitive = (s: string) => isSensitiveTaxon([s, s.split(" ")[0]]);
    const species: PatchSpecies[] = rows.filter((r) => !sensitive(r.sci));
    const n = newest(species);
    return { year, cell: { lat: cellLat, lon: cellLon }, group, species, hidden: rows.length - species.length, latestWeek: n.week, newThisWeek: n.species.map((s) => s.sci) };
  });
  return Response.json(data, { headers: { "cache-control": "public, max-age=3600, s-maxage=21600" } });
}

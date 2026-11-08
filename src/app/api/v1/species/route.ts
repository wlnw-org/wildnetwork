import { sql } from "@/lib/db";
import { delayFilter } from "@/lib/delay";

/** Lists within this many degrees of the visitor's cell count as "near"; within REGION as "your region" (as in /api/v1/insights). */
const AREA = { NEAR: 10, REGION: 25, MIN_ITEMS: 4 } as const;

/**
 * Species seen in the window, ranked by count. ?hours=24 ?q=robin
 * ?lat&lon (whole degrees, snapped to the 5 degree cell) ranks the live list near that place first: near (10 degrees),
 * then the region (25 degrees), then the world when too few species are near. The scope used is in the x-wn-scope header.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const hours = Math.min(Number(p.get("hours") ?? 24), 24 * 30);
  const q = p.get("q");
  const group = p.get("group");
  const la = Number(p.get("lat")), lo = Number(p.get("lon"));
  const here = !q && p.has("lat") && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180
    ? { lat: Math.floor(la / 5) * 5 + 2.5, lon: Math.floor(lo / 5) * 5 + 2.5 } : null;
  // Distance in degrees from an event to the visitor's cell centre (the larger of latitude and wrapped longitude).
  const d = here ? sql`GREATEST(ABS(e.latitude - ${here.lat}), ABS(MOD((e.longitude - ${here.lon} + 540)::numeric, 360) - 180))` : sql`0`;
  // A search looks through every species in the daily history, not only what was heard in the live window.
  const rows = q
    ? await sql`
        SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, SUM(count) AS n, COUNT(DISTINCT (cell_lat, cell_lon)) AS deployments
        FROM (SELECT scientific_name, vernacular_name, count, cell_lat, cell_lon FROM species_daily
              UNION ALL SELECT scientific_name, vernacular_name, count, cell_lat, cell_lon FROM species_weekly WHERE week >= CURRENT_DATE - 60) x
        WHERE scientific_name ILIKE ${"%" + q + "%"} OR vernacular_name ILIKE ${"%" + q + "%"}
        GROUP BY scientific_name
        ORDER BY (MIN(vernacular_name) ILIKE ${q + "%"}) DESC, n DESC
        LIMIT 30
      `
    : await sql`
        SELECT e.scientific_name, MIN(e.vernacular_name) AS vernacular_name,
               COUNT(*) AS n, COUNT(DISTINCT e.deployment_id) AS deployments,
               COUNT(*) FILTER (WHERE ${d} <= ${AREA.NEAR}) AS n_near, COUNT(*) FILTER (WHERE ${d} <= ${AREA.REGION}) AS n_region
        FROM events e ${group ? sql`JOIN species_group g ON g.scientific_name = e.scientific_name AND g.grp = ${group}` : sql``}
        WHERE e.event_start > now() - (${hours} || ' hours')::interval
          AND e.scientific_name IS NOT NULL AND e.review_status <> 'rejected' ${delayFilter("e")}
        GROUP BY e.scientific_name
        ORDER BY n DESC
        LIMIT ${here ? 2000 : 200}
      `;
  let list = rows.map((r) => ({
    scientificName: r.scientific_name as string, vernacularName: r.vernacular_name as string | null, count: Number(r.n),
    deployments: Number(r.deployments), near: Number(r.n_near ?? 0), region: Number(r.n_region ?? 0),
  }));
  let scope = "world";
  if (here) {
    const near = list.filter((r) => r.near > 0), region = list.filter((r) => r.region > 0);
    if (near.length >= AREA.MIN_ITEMS) { scope = "near"; list = near.map((r) => ({ ...r, count: r.near })); }
    else if (region.length >= AREA.MIN_ITEMS) { scope = "region"; list = region.map((r) => ({ ...r, count: r.region })); }
    list = list.sort((a, b) => b.count - a.count).slice(0, 200);
  }
  return Response.json(
    list.map(({ scientificName, vernacularName, count, deployments }) => ({ scientificName, vernacularName, count, deployments })),
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300", ...(here ? { "x-wn-scope": scope } : {}) } },
  );
}

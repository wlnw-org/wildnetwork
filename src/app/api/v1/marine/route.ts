import { sql } from "@/lib/db";
import { delayFilter } from "@/lib/delay";
import { toFeature } from "@/lib/eventFeature";

const MARINE = ["obis", "orcasound", "acartia"];

/**
 * Marine records for the map's marine layer: OBIS, Orcasound and Acartia, newest first, at most `perCell` per cell so a busy
 * region (European surveys) cannot crowd out a quiet one (Indian coasts). Cells are 5 degrees for the world view and 1 degree
 * inside ?bbox=w,s,e,n (the map sends its view when zoomed in). Delayed records stay hidden (delayFilter).
 * ?days=365 ?perCell=40 ?bbox=76,5,85,16 ?species=Orcinus+orca ?source=obis
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const days = Math.max(1, Math.min(Math.trunc(Number(p.get("days") ?? 365)) || 365, 400));
  const perCell = Math.max(1, Math.min(Math.trunc(Number(p.get("perCell") ?? 40)) || 40, 500));
  const species = p.get("species");
  const sources = p.get("source") ? MARINE.filter((s) => s === p.get("source")) : MARINE;
  const bbox = p.get("bbox")?.split(",").map(Number);
  const box = bbox?.length === 4 && bbox.every(Number.isFinite) ? bbox : null;
  const cell = box ? 1 : 5;
  const rows = await sql`
    SELECT * FROM (
      SELECT e.event_id, e.event_start, e.scientific_name, e.vernacular_name, e.taxon_rank, e.confidence, e.latitude, e.longitude,
             e.source_system, e.deployment_id, e.media_url, e.media_type, e.review_status, e.observation_method, e.individual_count,
             e.source_provider, e.source_provider_url, e.source_trusted, e.also_credit, e.license, e.classifier_name,
             CASE WHEN g.grp = 'avian' THEN 'Aves' WHEN g.grp = 'marine' THEN 'Marine' WHEN g.grp = 'mammal' THEN 'Mammalia' ELSE 'Marine' END AS grp,
             row_number() OVER (PARTITION BY floor(e.latitude / ${cell}), floor(e.longitude / ${cell}) ORDER BY e.event_start DESC) AS k
      FROM events e LEFT JOIN species_group g ON g.scientific_name = e.scientific_name
      WHERE e.source_system = ANY(${sources}) AND e.event_start > now() - make_interval(days => ${days})
        AND e.review_status <> 'rejected' ${delayFilter("e")}
        ${species ? sql`AND e.scientific_name = ${species}` : sql``}
        ${box ? sql`AND e.longitude BETWEEN ${box[0]} AND ${box[2]} AND e.latitude BETWEEN ${box[1]} AND ${box[3]}` : sql``}
    ) x WHERE k <= ${perCell}
    ORDER BY event_start DESC
    LIMIT 20000
  `;
  return Response.json({ type: "FeatureCollection", features: rows.map(toFeature) },
    { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=3600" } });
}

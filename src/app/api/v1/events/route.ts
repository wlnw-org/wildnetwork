import { memo } from "@/lib/memo";
import { authenticate } from "@/lib/auth";
import { sql } from "@/lib/db";
import { delayFilter } from "@/lib/delay";
import { HIDDEN_DEPLOYMENT_SOURCES } from "@/lib/sources";
import { toFeature } from "@/lib/eventFeature";
import { ingestEvents } from "@/lib/wdx/ingest";
import { divertTestEvents, linkDeviceDeployment, ownerTestEvents } from "@/lib/baseDevices";
import type { WdxEvent } from "@/lib/wdx/types";
import { parseEventsBody, validateWdx } from "@/lib/wdx/validate";

const MAX_BATCH = 5000;

/** Push WDX events. Body: one JSON object, a JSON array, or NDJSON. */
export async function POST(req: Request) {
  const key = await authenticate(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });

  if (Number(req.headers.get("content-length") ?? 0) > 10_000_000) return Response.json({ error: "body larger than 10 MB" }, { status: 413 });
  let items: unknown[];
  try {
    items = parseEventsBody(await req.text());
  } catch {
    return Response.json({ error: "body is not valid JSON or NDJSON" }, { status: 400 });
  }
  if (items.length > MAX_BATCH) {
    return Response.json({ error: `max ${MAX_BATCH} events per request` }, { status: 413 });
  }

  const valid: WdxEvent[] = [];
  const rejected: { index: number; errors: string[] }[] = [];
  items.forEach((item, index) => {
    const v = validateWdx(item);
    if (!v.ok) return rejected.push({ index, errors: v.errors ?? [] });
    const ev = item as WdxEvent;
    if (key.sourceSystem && ev.source.system !== key.sourceSystem) {
      return rejected.push({ index, errors: [`key is restricted to source.system=${key.sourceSystem}`] });
    }
    valid.push(ev);
  });

  // Test stations' detections are kept apart (src/lib/baseDevices.ts) and never reach the public tables.
  const { events: publicEvents, test } = await divertTestEvents(key.deviceId, valid);
  await linkDeviceDeployment(key.deviceId, valid);
  const result = await ingestEvents(publicEvents);
  return Response.json({ ...result, received: valid.length, ...(test ? { test } : {}), rejected: rejected.length, rejectedDetails: rejected.slice(0, 20) });
}

/**
 * Query events for the map.
 * ?bbox=w,s,e,n  ?from=ISO ?to=ISO ?species=Scientific+name ?source=birdweather ?group=bat ?minConfidence=0.7 ?limit=5000
 * ?deployment=<source:deploymentId> one station's detections (delay rules apply as usual). With that station's own device
 * key (Authorization: Bearer), a test station's detections are added, marked test: true; nobody else ever sees them.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const limit = Math.max(1, Math.min(Math.trunc(Number(p.get("limit") ?? 5000)) || 5000, 20000));
  // Round the window start to the minute so identical requests share one CDN cache entry.
  const to = p.get("to") ? new Date(p.get("to")!) : new Date();
  const from = p.get("from") ? new Date(p.get("from")!) : new Date(to.getTime() - 24 * 3600 * 1000);
  const species = p.get("species");
  const source = p.get("source");
  const group = p.get("group");
  const deployment = p.get("deployment")?.trim().slice(0, 200) || null;
  // BirdWeather and hidden-position sources never expose station identity, so they cannot be asked for by station either.
  if (deployment && ["birdweather", ...HIDDEN_DEPLOYMENT_SOURCES].includes(deployment.split(":")[0])) return Response.json({ error: "this source does not publish stations" }, { status: 400 });
  const minConf = Number(p.get("minConfidence") ?? 0) || 0;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return Response.json({ error: "from and to must be ISO dates" }, { status: 400 });
  const bbox = p.get("bbox")?.split(",").map(Number);
  const hasBbox = bbox?.length === 4 && bbox.every((n) => Number.isFinite(n));

  // ?merge=1 (used by the map): BirdWeather detections share 1 degree positions, so the same species in the same place within
  // 15 minutes becomes one point with a count n, the latest time and the highest confidence. Other sources stay one point each.
  const merge = p.get("merge") === "1";
  const authed = !!(deployment && (req.headers.get("authorization") || req.headers.get("x-api-key")));
  const query = async () => {
  const rows = merge ? await sql`
    WITH base AS (
    SELECT e.event_id, 1 AS n, e.event_start, e.scientific_name, e.vernacular_name, e.confidence,
           e.latitude, e.longitude, e.source_system, e.deployment_id, e.media_url, e.media_type, e.review_status,
           e.observation_method, e.individual_count, e.source_provider, e.source_trusted, e.source_provider_url, e.also_credit, e.license, e.taxon_rank, e.classifier_name,
           CASE WHEN e.media_type IN ('image', 'video') AND e.source_system NOT IN ('inaturalist') THEN 'camera'
                WHEN g.grp = 'marine' THEN 'Marine' WHEN g.grp = 'bat' OR e.classifier_name ILIKE '%bat%' THEN 'bat' WHEN g.grp = 'avian' THEN 'Aves' WHEN g.grp = 'amphibian' THEN 'Amphibia' WHEN g.grp = 'insect' THEN 'Insecta' WHEN g.grp = 'mammal' THEN 'Mammalia'
                ELSE COALESCE(NULLIF(m.iconic, 'Unknown'), CASE WHEN e.source_system = 'birdweather' THEN 'Aves' END, 'Unknown') END AS grp
    FROM events e LEFT JOIN species_media m ON m.scientific_name = e.scientific_name
    LEFT JOIN species_group g ON g.scientific_name = e.scientific_name
    WHERE event_start >= ${from} AND event_start <= ${to}
      AND (${minConf} = 0 OR confidence >= ${minConf})
      AND review_status <> 'rejected'
      ${delayFilter("e")}
      ${species ? sql`AND e.scientific_name = ${species}` : sql``}
      ${source ? sql`AND source_system = ${source}` : sql``}
      ${group ? sql`AND g.grp = ${group}` : sql``}
      ${deployment ? sql`AND e.deployment_id = ${deployment}` : sql``}
      ${hasBbox ? sql`AND geom && ST_MakeEnvelope(${bbox![0]}, ${bbox![1]}, ${bbox![2]}, ${bbox![3]}, 4326)::geography` : sql``}
    )
    SELECT * FROM (
      SELECT * FROM base WHERE source_system <> 'birdweather'
      UNION ALL
      SELECT NULL AS event_id, count(*)::int AS n, max(event_start), scientific_name, max(vernacular_name), max(confidence),
             latitude, longitude, 'birdweather', NULL, NULL, NULL, 'unreviewed', 'machine', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, max(grp)
      FROM base WHERE source_system = 'birdweather'
      GROUP BY latitude, longitude, scientific_name, floor(extract(epoch FROM event_start) / 900)
    ) x
    ORDER BY event_start DESC
    LIMIT ${limit}
  ` : await sql`
    SELECT e.event_id, 1 AS n, e.event_start, e.scientific_name, e.vernacular_name, e.confidence,
           e.latitude, e.longitude, e.source_system, e.deployment_id, e.media_url, e.media_type, e.review_status,
           e.observation_method, e.individual_count, e.source_provider, e.source_trusted, e.source_provider_url, e.also_credit, e.license, e.taxon_rank, e.classifier_name,
           CASE WHEN e.media_type IN ('image', 'video') AND e.source_system NOT IN ('inaturalist') THEN 'camera'
                WHEN g.grp = 'marine' THEN 'Marine' WHEN g.grp = 'bat' OR e.classifier_name ILIKE '%bat%' THEN 'bat' WHEN g.grp = 'avian' THEN 'Aves' WHEN g.grp = 'amphibian' THEN 'Amphibia' WHEN g.grp = 'insect' THEN 'Insecta' WHEN g.grp = 'mammal' THEN 'Mammalia'
                ELSE COALESCE(NULLIF(m.iconic, 'Unknown'), CASE WHEN e.source_system = 'birdweather' THEN 'Aves' END, 'Unknown') END AS grp
    FROM events e LEFT JOIN species_media m ON m.scientific_name = e.scientific_name
    LEFT JOIN species_group g ON g.scientific_name = e.scientific_name
    WHERE event_start >= ${from} AND event_start <= ${to}
      AND (${minConf} = 0 OR confidence >= ${minConf})
      AND review_status <> 'rejected'
      ${delayFilter("e")}
      ${species ? sql`AND e.scientific_name = ${species}` : sql``}
      ${source ? sql`AND source_system = ${source}` : sql``}
      ${group ? sql`AND g.grp = ${group}` : sql``}
      ${deployment ? sql`AND e.deployment_id = ${deployment}` : sql``}
      ${hasBbox ? sql`AND geom && ST_MakeEnvelope(${bbox![0]}, ${bbox![1]}, ${bbox![2]}, ${bbox![3]}, 4326)::geography` : sql``}
    ORDER BY event_start DESC
    LIMIT ${limit}
  `;

  return rows.map(toFeature);
  };
  // Public answers (no owner key) are shared for a minute: the map asks this every time it loads. Without from/to the
  // window ends now, so a cached answer is at most a minute (plus a short stale refresh) behind.
  const pub = new URLSearchParams([...p.entries()].sort(([x], [y]) => x.localeCompare(y))).toString();
  const features: ReturnType<typeof toFeature>[] = authed ? await query() : [...await memo(`events|${pub}`, 60_000, 60_000, query)];
  // The owner's test-station detections: only with a deployment filter and that device's own key, never cached.
  const key = authed ? await authenticate(req) : null;
  if (key?.deviceId) {
    const test = await ownerTestEvents(key.deviceId, deployment!, from, to, limit);
    if (test.length) {
      features.push(...test);
      features.sort((a, b) => new Date(b.properties.t as string).getTime() - new Date(a.properties.t as string).getTime());
      features.splice(limit);
    }
  }
  return Response.json({ type: "FeatureCollection", features }, {
    headers: { "cache-control": key ? "private, no-store" : "public, s-maxage=300, stale-while-revalidate=600" },
  });
}

import { sql } from "@/lib/db";
import { delayFilter } from "@/lib/delay";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { rules } from "@/lib/sources";
import { FEED_LIMIT, GROUP_MAX, NO_STATION_PAGE, allowedId, sourceOf, stationSlug, validTimeZone } from "@/lib/stationIds";

export { GROUP_MAX, stationIdFromSlug, stationSlug } from "@/lib/stationIds";

/** Days of detections we keep for a source: its keepDays, else 30 for devices pushing to us (prune() in connectors/index.ts). */
export const keptDays = (source: string) => rules(source)?.keepDays ?? 30;


/**
 * Public station pages (/stations/<slug>, /stations/group?ids=). A station is a deployment ("<source>:<deploymentId>").
 * Shown: owner-given name, kind, position rounded to 0.01 degree (about 1 km; devices round before sending), detections
 * from the live events window with the same delay and review rules as GET /api/v1/events, and when it was last heard from.
 * Never shown: BirdWeather or hidden-position stations, observer sources, test stations, device health, sensitive taxa names.
 * Every query filters on events.source_system first so it reads events_source_idx (source_system, event_start DESC).
 */

/** A station's position is close to exact, so sensitive taxa are counted but never named against it (as in site reports). */
export const nameable = (sci: string | null) => !sci || !isSensitiveTaxon([sci, sci.split(" ")[0]]);

export interface Station {
  id: string; slug: string; source: string; name: string | null; sensorType: string | null; sensorModel: string | null;
  lat: number; lon: number; timezone: string | null; keepDays: number;
  firstKept: string | null; lastKept: string | null; lastHeard: string | null; total: number;
}

/**
 * Stations that may be shown, with their kept range. Test stations (the device that sends to this station, or before it has
 * sent with its key, a device of the same source and name, in test mode) and
 * stations with nothing kept that have not reported within the kept window are left out.
 */
export async function loadStations(ids: string[]): Promise<Station[]> {
  const ok = [...new Set(ids)].filter(allowedId).slice(0, GROUP_MAX);
  if (!ok.length) return [];
  const sources = [...new Set(ok.map(sourceOf))];
  const rows = await sql<{ id: string; source_system: string; name: string | null; sensor_type: string | null; sensor_model: string | null; lat: number; lon: number; timezone: string | null; last_seen: Date; test: boolean | null; last_status_at: Date | null; first: Date | null; last: Date | null; n: number }[]>`
    SELECT d.id, d.source_system, d.name, d.sensor_type, d.sensor_model,
           ROUND(d.latitude::numeric, 2)::float AS lat, ROUND(d.longitude::numeric, 2)::float AS lon, d.timezone, d.last_seen,
           v.test, v.last_status_at, s.first, s.last, COALESCE(s.n, 0)::int AS n
    FROM deployments d
    LEFT JOIN LATERAL (SELECT bool_or(test) AS test, MAX(last_status_at) AS last_status_at FROM devices
                       WHERE deployment_id = d.id
                          OR (deployment_id IS NULL AND source_system = d.source_system AND name = d.name)) v ON true
    LEFT JOIN (
      SELECT e.deployment_id, MIN(e.event_start) AS first, MAX(e.event_start) AS last, COUNT(*) AS n FROM events e
      WHERE e.source_system = ANY(${sources}) AND e.deployment_id = ANY(${ok}) AND e.review_status <> 'rejected' ${delayFilter("e")}
      GROUP BY 1
    ) s ON s.deployment_id = d.id
    WHERE d.id = ANY(${ok})`;
  return rows
    .filter((r) => !r.test && !NO_STATION_PAGE.has(r.source_system))
    .filter((r) => r.n > 0 || r.last_seen.getTime() > Date.now() - keptDays(r.source_system) * 86400_000)
    .map((r) => {
      const heard = [r.last, r.last_status_at].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
      return {
        id: r.id, slug: stationSlug(r.id), source: r.source_system, name: r.name, sensorType: r.sensor_type, sensorModel: r.sensor_model,
        lat: r.lat, lon: r.lon, timezone: r.timezone, keepDays: keptDays(r.source_system),
        firstKept: r.first?.toISOString() ?? null, lastKept: r.last?.toISOString() ?? null, lastHeard: heard?.toISOString() ?? null, total: r.n,
      };
    })
    .sort((a, b) => ok.indexOf(a.id) - ok.indexOf(b.id));
}

/** English common names (GBIF's, as on the map) for scientific names missing one. */
async function commonNames(list: string[]): Promise<Record<string, string>> {
  if (!list.length) return {};
  const rows = await sql<{ scientific_name: string; vernacular_name: string }[]>`
    SELECT DISTINCT ON (scientific_name) scientific_name, vernacular_name FROM gbif_taxa
    WHERE scientific_name = ANY(${list}) AND vernacular_name IS NOT NULL`.catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.scientific_name, r.vernacular_name]));
}

export interface FeedRow { t: string; sci: string | null; common: string | null; grp: string | null; conf: number | null; station: string; sensitive?: true }

/** Newest detections of these (already checked) stations, sensitive taxa unnamed. */
export async function stationFeed(stations: Pick<Station, "id" | "source">[], limit = FEED_LIMIT): Promise<FeedRow[]> {
  if (!stations.length) return [];
  const rows = await sql<{ event_start: Date; scientific_name: string | null; vernacular_name: string | null; grp: string | null; confidence: number | null; deployment_id: string }[]>`
    SELECT e.event_start, e.scientific_name, e.vernacular_name, g.grp, e.confidence, e.deployment_id
    FROM events e LEFT JOIN species_group g ON g.scientific_name = e.scientific_name
    WHERE e.source_system = ANY(${[...new Set(stations.map((s) => s.source))]}) AND e.deployment_id = ANY(${stations.map((s) => s.id)})
      AND e.review_status <> 'rejected' ${delayFilter("e")}
    ORDER BY e.event_start DESC LIMIT ${limit}`;
  const names = await commonNames([...new Set(rows.filter((r) => !r.vernacular_name && r.scientific_name && nameable(r.scientific_name)).map((r) => r.scientific_name!))]);
  return rows.map((r) => nameable(r.scientific_name)
    ? { t: r.event_start.toISOString(), sci: r.scientific_name, common: r.vernacular_name ?? (r.scientific_name ? names[r.scientific_name] ?? null : null), grp: r.grp, conf: r.confidence == null ? null : Math.round(r.confidence * 100) / 100, station: r.deployment_id }
    : { t: r.event_start.toISOString(), sci: null, common: null, grp: r.grp, conf: null, station: r.deployment_id, sensitive: true });
}

export interface SpeciesCount { sci: string | null; common: string | null; grp: string | null; day: number; week: number; month: number; stations: number; sensitive?: true }

/** Species with counts over the last 24 hours, 7 days and 30 days (within what is kept); sensitive taxa pooled per group. */
export async function stationSpecies(stations: Pick<Station, "id" | "source">[]): Promise<SpeciesCount[]> {
  if (!stations.length) return [];
  const rows = await sql<{ scientific_name: string | null; vernacular_name: string | null; grp: string | null; day: number; week: number; month: number; stations: number }[]>`
    SELECT e.scientific_name, MIN(e.vernacular_name) AS vernacular_name, MIN(g.grp) AS grp,
           COUNT(*) FILTER (WHERE e.event_start > now() - interval '1 day')::int AS day,
           COUNT(*) FILTER (WHERE e.event_start > now() - interval '7 days')::int AS week,
           COUNT(*)::int AS month, COUNT(DISTINCT e.deployment_id)::int AS stations
    FROM events e LEFT JOIN species_group g ON g.scientific_name = e.scientific_name
    WHERE e.source_system = ANY(${[...new Set(stations.map((s) => s.source))]}) AND e.deployment_id = ANY(${stations.map((s) => s.id)})
      AND e.event_start > now() - interval '30 days' AND e.review_status <> 'rejected' ${delayFilter("e")}
    GROUP BY 1 ORDER BY month DESC, 1`;
  const names = await commonNames(rows.filter((r) => !r.vernacular_name && r.scientific_name && nameable(r.scientific_name)).map((r) => r.scientific_name!));
  const out: SpeciesCount[] = [];
  const pooled = new Map<string, SpeciesCount>();
  for (const r of rows) {
    if (nameable(r.scientific_name)) { out.push({ sci: r.scientific_name, common: r.vernacular_name ?? (r.scientific_name ? names[r.scientific_name] ?? null : null), grp: r.grp, day: r.day, week: r.week, month: r.month, stations: r.stations }); continue; }
    const k = r.grp ?? "other";
    const p = pooled.get(k) ?? { sci: null, common: null, grp: k, day: 0, week: 0, month: 0, stations: 0, sensitive: true as const };
    p.day += r.day; p.week += r.week; p.month += r.month; p.stations = Math.max(p.stations, r.stations);
    pooled.set(k, p);
  }
  return [...out, ...pooled.values()];
}

/** Detections per hour of day over the kept window, in the given time zone (validated by the caller). */
export async function stationHours(st: Pick<Station, "id" | "source">, tz: string): Promise<number[]> {
  const rows = await sql<{ h: number; n: number }[]>`
    SELECT extract(hour FROM e.event_start AT TIME ZONE ${tz})::int AS h, COUNT(*)::int AS n FROM events e
    WHERE e.source_system = ${st.source} AND e.deployment_id = ${st.id} AND e.review_status <> 'rejected' ${delayFilter("e")}
    GROUP BY 1`;
  const out = Array<number>(24).fill(0);
  for (const r of rows) out[r.h] = r.n;
  return out;
}

/** The station's own time zone, else Open-Meteo's for its position (cached 30 days), else null (shown in UTC). */
export async function stationTimeZone(st: Pick<Station, "lat" | "lon" | "timezone">): Promise<string | null> {
  if (validTimeZone(st.timezone)) return st.timezone;
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${st.lat.toFixed(1)}&longitude=${st.lon.toFixed(1)}&timezone=auto&forecast_days=1&daily=sunrise`;
  const r = await fetch(u, { signal: AbortSignal.timeout(5000), headers: { "user-agent": "WildlifeNetwork/0.1" }, next: { revalidate: 30 * 86400 } }).catch(() => null);
  const tz = r?.ok ? ((await r.json().catch(() => null)) as { timezone?: string } | null)?.timezone : null;
  return validTimeZone(tz) && tz !== "GMT" ? tz : null;
}

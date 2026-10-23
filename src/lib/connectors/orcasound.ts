import type { WdxEvent } from "@/lib/wdx/types";
import { PENDING_LICENCE, SOURCES } from "@/lib/sources";
import { SPECIES } from "./acartia";
import type { PullConnector, Station } from "./types";

/**
 * Orcasound (orcasound.net) hydrophone detections in Puget Sound and the San Juan Islands, plus one in Norway.
 * JSON:API at https://live.orcasound.net/api/json: /detections (newest first) and /feeds (the hydrophones).
 * source "machine" = the OrcaHello model (no version or score published, so none are recorded); "human" = a listener.
 * category "whale" = Cetacea at order level, unless the listener's description names a species. "vessel" is counted in the
 * run log and kept off the wildlife map; "other" is skipped. Positions are the hydrophones' public sites.
 */
export const BASE = "https://live.orcasound.net/api/json";
const UA = "WildlifeNetwork/0.1 (+https://wlnw.org; https://github.com/wlnw-org/wildnetwork)";
const PAGE = 200; // about a week of detections in October 2026

export interface OrcaFeed { id: string; attributes: { name?: string; slug?: string; lat_lng?: { lat: number; lng: number } | null; location_point?: { coordinates?: [number, number] } | null; visible?: boolean } }
export interface OrcaDetection {
  id: string;
  attributes: { timestamp?: string; category?: string | null; source?: string | null; description?: string | null; listener_count?: number | null };
  relationships?: { feed?: { data?: { id: string } | null } };
}

export function feedPosition(f: OrcaFeed): { lat: number; lon: number } | null {
  const ll = f.attributes.lat_lng, pt = f.attributes.location_point?.coordinates;
  const lat = ll?.lat ?? pt?.[1], lon = ll?.lng ?? pt?.[0];
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat: lat!, lon: lon! } : null;
}

export const feedUrl = (f: OrcaFeed) => `https://live.orcasound.net/listen/${encodeURIComponent(f.attributes.slug ?? f.id)}`;

export function toStation(f: OrcaFeed): Station | null {
  const p = feedPosition(f);
  return p ? { deploymentId: f.attributes.slug ?? f.id, name: f.attributes.name ?? f.attributes.slug ?? f.id, latitude: p.lat, longitude: p.lon, sensorType: "acoustic-recorder", sensorModel: "Orcasound hydrophone" } : null;
}

/**
 * Species only when a listener's description names one plainly (e.g. "J pod calls", "orcas", "humpback"); otherwise the order.
 * Words like "maybe", "?" or "not" make it doubtful, so it stays at Cetacea: never a guess.
 */
export function speciesFromDescription(text: string | null | undefined): string | null {
  const t = ` ${(text ?? "").toLowerCase()} `;
  if (!t.trim() || /\?|\bmaybe\b|\bpossibl|\bprobabl|\bnot\b|\bno\b|\bunsure\b|\bunclear\b/.test(t)) return null;
  if (/\b(orcas?|killer whales?|srkw|southern residents?|[jkl][ -]?pod|bigg'?s|transients?)\b/.test(t)) return "Orcinus orca";
  for (const [name, sci] of Object.entries(SPECIES)) if (sci !== "Orcinus orca" && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(t)) return sci;
  return null;
}

export function toWdx(d: OrcaDetection, feeds: Map<string, OrcaFeed>): { event?: WdxEvent; skipped?: "vessel" | "other" | "invalid" } {
  const a = d.attributes ?? {};
  const cat = (a.category ?? "").toLowerCase();
  if (cat === "vessel") return { skipped: "vessel" };
  if (cat !== "whale") return { skipped: "other" };
  const feed = feeds.get(d.relationships?.feed?.data?.id ?? "");
  const station = feed && toStation(feed);
  const t = a.timestamp && !Number.isNaN(Date.parse(a.timestamp)) ? new Date(a.timestamp).toISOString() : null;
  if (!d.id || !station || !t) return { skipped: "invalid" };
  const human = a.source === "human";
  const sci = human ? speciesFromDescription(a.description) : null;
  return {
    event: {
      wdx: "0.3",
      eventId: `orcasound:${d.id}`,
      eventStart: t,
      deployment: station,
      detection: {
        observationMethod: human ? "human" : "machine",
        ...(sci ? { scientificName: sci, taxonRank: "species" as const, ...(sci === "Orcinus orca" ? { vernacularName: "Killer whale" } : {}) }
          : { scientificName: "Cetacea", taxonRank: "order" as const, vernacularName: "Whale or dolphin" }),
        // OrcaHello's version and score are not published by the API: recorded as unknown, never invented.
        ...(human ? {} : { classifier: { name: "OrcaHello", version: "unknown" } }),
      },
      source: { system: "orcasound", sourceRecordId: d.id, provider: station.name, providerUrl: feedUrl(feed!) },
      license: PENDING_LICENCE,
    },
  };
}

export function parseDetections(det: unknown, feedList: OrcaFeed[]): { events: WdxEvent[]; counts: Record<string, number> } {
  const feeds = new Map(feedList.map((f) => [f.id, f]));
  const data = (det as { data?: OrcaDetection[]; included?: OrcaFeed[] } | null) ?? {};
  for (const f of data.included ?? []) if (!feeds.has(f.id)) feeds.set(f.id, f);
  const counts: Record<string, number> = {};
  const events: WdxEvent[] = [];
  const seen = new Set<string>();
  for (const d of Array.isArray(data.data) ? data.data : []) {
    const r = toWdx(d, feeds);
    if (r.event && !seen.has(r.event.eventId)) { seen.add(r.event.eventId); events.push(r.event); counts.whale = (counts.whale ?? 0) + 1; }
    else if (r.skipped) counts[r.skipped] = (counts[r.skipped] ?? 0) + 1;
  }
  return { events, counts };
}

/** GET with a timeout and up to 3 attempts, backing off 1 s then 4 s on network errors and 5xx. */
export async function getJson(url: string, fetcher: typeof fetch = fetch, timeoutMs = 15_000): Promise<unknown> {
  let last: unknown;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetcher(url, { headers: { "user-agent": UA, accept: "application/vnd.api+json, application/json" }, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return await res.json();
      last = new Error(`${new URL(url).hostname} ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { last = e; }
    if (i < 2) await new Promise((r) => setTimeout(r, 1000 * 4 ** i));
  }
  throw last;
}

export const orcasound: PullConnector = {
  name: "orcasound",
  minIntervalMinutes: SOURCES.orcasound.pollMinutes,
  async pull() {
    const [feedsJson, detJson] = await Promise.all([getJson(`${BASE}/feeds`), getJson(`${BASE}/detections?page%5Blimit%5D=${PAGE}&include=feed`)]);
    const feedList = ((feedsJson as { data?: OrcaFeed[] }).data ?? []);
    const { events, counts } = parseDetections(detJson, feedList);
    const stations = feedList.filter((f) => f.attributes.visible !== false).map(toStation).filter((s): s is Station => !!s);
    const notes = Object.entries(counts).filter(([k]) => k !== "whale").map(([k, n]) => `${n} ${k} detections not added`);
    const groups = [...new Set(events.map((e) => e.detection.scientificName!))].map((name) => ({ name, grp: "marine" }));
    return { events, cursor: null, notes, groups, stations };
  },
};

import type { WdxEvent } from "@/lib/wdx/types";
import { ACARTIA } from "@/lib/sources";
import type { PullConnector } from "./types";

/**
 * Acartia (acartia.io): recent marine mammal sightings shared by Orcasound, Conserve.io / Whale Alert and others.
 * Human observations, so WDX observationMethod "human" with no model, version or confidence (WDX v0.3).
 * The endpoint returns the last few days as one JSON array; entry_id is the stable record id, so re-polls are upserts.
 * Kept: species, count, time, rounded position, the source's trusted flag, entry_id and data_source_entity.
 * Not kept: submitter_did, signature, witness usernames, photo_url, and the free-text comments (they name observers).
 */
export const API = "https://acartia.io/api/v1/sightings/current";
const UA = "WildNetwork/0.1 (+https://wildnetwork.arunrajiah.com; https://github.com/wlnw-org/wildnetwork)";

/** Editable: Acartia's common names (case-insensitive) to scientific names. Unknown names are kept as "unmapped". */
export const SPECIES: Record<string, string> = {
  "orca": "Orcinus orca",
  "killer whale": "Orcinus orca",
  "humpback": "Megaptera novaeangliae",
  "humpback whale": "Megaptera novaeangliae",
  "gray whale": "Eschrichtius robustus",
  "grey whale": "Eschrichtius robustus",
  "minke whale": "Balaenoptera acutorostrata",
  "minke": "Balaenoptera acutorostrata",
  "fin whale": "Balaenoptera physalus",
  "blue whale": "Balaenoptera musculus",
  "pacific white-sided dolphin": "Lagenorhynchus obliquidens",
  "harbor porpoise": "Phocoena phocoena",
  "harbour porpoise": "Phocoena phocoena",
  "dall's porpoise": "Phocoenoides dalli",
};

export interface AcartiaSighting {
  entry_id?: string;
  type?: string;
  created?: string;
  latitude?: number | string;
  longitude?: number | string;
  no_sighted?: number | string;
  trusted?: number | string | boolean;
  data_source_entity?: string;
  data_source_name?: string;
}

export function mapSpecies(type: string | undefined): { scientificName?: string; vernacularName: string; mapped: boolean } {
  const raw = (type ?? "").trim().replace(/\s+/g, " ");
  const sci = SPECIES[raw.toLowerCase()];
  return sci ? { scientificName: sci, vernacularName: raw, mapped: true } : { vernacularName: raw || "Unknown", mapped: false };
}

/**
 * Acartia's `created` has no offset ("2026-10-15 20:35:45"). It is UTC: across the feed on 2026-10-20, `ssemmi_date_added`
 * (stated as GMT) followed `created` by a median of 11 minutes and never preceded it; Pacific time would put it ~7 hours later.
 */
export function parseCreated(s: string | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec((s ?? "").trim());
  if (!m) return null;
  const iso = `${m[1]}T${m[2].length === 5 ? m[2] + ":00" : m[2]}${m[3] ?? "Z"}`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

/** Rounds to a grid of `step` degrees (0.1 -> one decimal), avoiding float noise like 38.900000000000006. */
export function roundTo(v: number, step: number): number {
  const decimals = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.round(v / step) * step).toFixed(decimals));
}

/** Half-diagonal of a grid cell at the equator, in metres: an honest uncertainty for a rounded position (WDX section 4). */
const uncertaintyFor = (step: number) => Math.round((step / 2) * Math.SQRT2 * 111_320);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";

export function toWdx(r: AcartiaSighting, step = ACARTIA.roundDegrees): { event: WdxEvent; mapped: boolean } | null {
  const id = (r.entry_id ?? "").trim();
  const lat = Number(r.latitude), lon = Number(r.longitude);
  const start = parseCreated(r.created);
  if (!id || !start || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const n = Math.trunc(Number(r.no_sighted));
  const provider = (r.data_source_entity ?? "").trim() || (r.data_source_name ?? "").trim() || "unknown";
  const sp = mapSpecies(r.type);
  const trusted = r.trusted === true || r.trusted === 1 || r.trusted === "1";
  return {
    mapped: sp.mapped,
    event: {
      wdx: "0.3",
      eventId: `acartia:${id}`,
      eventStart: start,
      // One deployment per contributing platform; its position is the latest sighting's rounded position and is never published.
      deployment: { deploymentId: slug(provider), name: provider, latitude: roundTo(lat, step), longitude: roundTo(lon, step), coordinateUncertaintyMeters: uncertaintyFor(step), sensorType: "other", sensorModel: "human-observer" },
      detection: {
        observationMethod: "human",
        ...(n >= 1 ? { individualCount: n } : {}),
        ...(sp.scientificName ? { scientificName: sp.scientificName, taxonRank: "species" as const } : { taxonRank: "unranked" as const }),
        vernacularName: sp.vernacularName,
      },
      source: { system: "acartia", sourceRecordId: id, provider, trusted },
      license: ACARTIA.license,
    },
  };
}

/** Maps a response body. Unmapped common names are counted for the run log, never dropped. */
export function parseSightings(json: unknown, step = ACARTIA.roundDegrees): { events: WdxEvent[]; unmapped: Record<string, number>; skipped: number } {
  const rows = Array.isArray(json) ? (json as AcartiaSighting[]) : [];
  const events: WdxEvent[] = [];
  const unmapped: Record<string, number> = {};
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const m = r && typeof r === "object" ? toWdx(r, step) : null;
    if (!m || seen.has(m.event.eventId)) { skipped++; continue; }
    seen.add(m.event.eventId);
    events.push(m.event);
    if (!m.mapped) unmapped[m.event.detection.vernacularName!] = (unmapped[m.event.detection.vernacularName!] ?? 0) + 1;
  }
  return { events, unmapped, skipped };
}

export async function fetchSightings(fetcher: typeof fetch = fetch, timeoutMs = 15_000): Promise<unknown> {
  const res = await fetcher(API, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`acartia ${res.status}`);
  return res.json();
}

export const acartia: PullConnector = {
  name: "acartia",
  minIntervalMinutes: ACARTIA.pollMinutes,
  async pull() {
    const { events, unmapped, skipped } = parseSightings(await fetchSightings());
    const notes = [
      ...Object.entries(unmapped).map(([name, n]) => `unmapped type "${name}" x${n}`),
      ...(skipped ? [`skipped ${skipped} rows without id, time or position`] : []),
    ];
    const groups = [...new Set(events.map((e) => e.detection.scientificName).filter((s): s is string => !!s))].map((name) => ({ name, grp: "marine" }));
    return { events, cursor: null, notes, groups };
  },
};

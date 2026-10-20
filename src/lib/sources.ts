/**
 * BirdWeather asked on 2026-10-02 that collection stop; on 2026-10-05 Tim (BirdWeather) confirmed detections are fine as long as no soundscapes are taken, and Arun switched it back on 2026-10-06.
 * Collection runs only while BIRDWEATHER_ENABLED=true (set on Vercel); unset it to pause again.
 */
export const BIRDWEATHER_PAUSED = process.env.BIRDWEATHER_ENABLED !== "true";

import config from "@/config/sources.json";

/**
 * Per-source licence status and privacy rules live in src/config/sources.json (also read by scripts/aws-export.py).
 * Southern Resident killer whales are endangered and live positions can draw boats, so Acartia and Orcasound killer whale
 * records are shown 24 hours late, and Acartia killer whale sightings are rounded to 0.1 degree when stored. Relax them there.
 */
export interface SourceRules {
  licence: "open" | "per-record" | "unknown-pending" | "not-agreed";
  pollMinutes?: number;
  keepDays?: number;
  delayHours?: number;
  /** Taxa the delay applies to (scientific name, or a higher taxon stored as the name). Empty or missing = every record. */
  delayTaxa?: string[];
  roundDegrees?: number | null;
  roundTaxa?: string[];
  hideDeployments?: boolean;
}
export const SOURCES = config as unknown as Record<string, SourceRules> & { obis: SourceRules & ObisConfig };
export interface ObisConfig {
  maxRows: number; pagesPerRun: number; pageSize: number; sensitiveRoundDegrees: number;
  regions: { name: string; geometry: string | null; days: number; maxRows: number }[];
}
export const rules = (source: string): SourceRules | undefined => (source.startsWith("_") ? undefined : SOURCES[source]);

/** Licence placeholder for records whose source has not confirmed one. */
export const PENDING_LICENCE = "unknown-pending";

/** Sources kept out of open data exports, bulk downloads and rollups until their licence is confirmed. */
export const PENDING_SOURCES = Object.entries(SOURCES).filter(([k, r]) => !k.startsWith("_") && r.licence === "unknown-pending").map(([k]) => k);

const listed = (taxa: string[] | undefined, name: string | null | undefined) => !taxa?.length || (!!name && taxa.includes(name));

/** Delay rules as [source, hours, taxa or null for all], for the SQL filter. */
export const DELAYS = Object.entries(SOURCES).flatMap(([k, r]) => (!k.startsWith("_") && r.delayHours ? [[k, r.delayHours, r.delayTaxa?.length ? r.delayTaxa : null] as const] : []));

/** True when a record may be shown publicly now. Mirrors delayFilter() in src/lib/delay.ts. */
export function isPublicNow(source: string, eventStart: Date | string, scientificName?: string | null, now = new Date()): boolean {
  const r = rules(source);
  if (!r?.delayHours || !listed(r.delayTaxa, scientificName)) return true;
  return new Date(eventStart).getTime() <= now.getTime() - r.delayHours * 3600_000;
}

/** Grid step to round a record's position to when it is stored, or null to keep it as published. */
export function roundingFor(source: string, scientificName?: string | null): number | null {
  const r = rules(source);
  return r?.roundDegrees && listed(r.roundTaxa, scientificName) ? r.roundDegrees : null;
}

/** Sources whose station or observer positions must never be published (positions would reveal the newest records early). */
export const HIDDEN_DEPLOYMENT_SOURCES = Object.entries(SOURCES).filter(([k, r]) => !k.startsWith("_") && r.hideDeployments).map(([k]) => k);

/** Editable display names for Acartia's data_source_entity values. */
export const PROVIDER_LABEL: Record<string, string> = { "Conserve.io": "Conserve.io / Whale Alert" };

/** Credit shown with every record of a source that needs one, with the page to link. */
export function creditFor(source: string, provider?: string | null, providerUrl?: string | null): { text: string; url: string } | null {
  const p = provider ? PROVIDER_LABEL[provider] ?? provider : null;
  if (source === "acartia") return { text: `Data: Acartia (acartia.io)${p ? `, via ${p}` : ""}`, url: "https://acartia.io" };
  if (source === "orcasound") return { text: `Data: Orcasound (orcasound.net)${p ? `, ${p} hydrophone` : ""}`, url: providerUrl ?? "https://live.orcasound.net" };
  if (source === "obis") return { text: `Data: OBIS (obis.org)${p ? `, dataset ${p}` : ""}`, url: providerUrl ?? "https://obis.org" };
  return null;
}

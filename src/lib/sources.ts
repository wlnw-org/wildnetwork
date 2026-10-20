/**
 * BirdWeather asked on 2026-10-02 that collection stop; on 2026-10-05 Tim (BirdWeather) confirmed detections are fine as long as no soundscapes are taken, and Arun switched it back on 2026-10-06.
 * Collection runs only while BIRDWEATHER_ENABLED=true (set on Vercel); unset it to pause again.
 */
export const BIRDWEATHER_PAUSED = process.env.BIRDWEATHER_ENABLED !== "true";

/**
 * Acartia (acartia.io) marine mammal sightings, offered by Scott Veirs of Orcasound in October 2026.
 * Until Acartia or Orcasound confirm their preferred rules, positions are generalised and shown a day late:
 * Southern Resident killer whales are endangered and live whale positions can draw boats. Relax these here.
 */
export const ACARTIA = {
  /** Positions are rounded to this many degrees at ingest, so precise coordinates are never stored. */
  roundDegrees: 0.1,
  /** Sightings stay hidden from the public map and API until they are this many hours old. */
  delayHours: 24,
  /** Raw sightings are kept this long, the same live window as iNaturalist and GBIF. */
  keepDays: 7,
  /** The connector runs at most this often (the status trigger fires every 5 minutes). */
  pollMinutes: 30,
  /** Not yet agreed: excluded from open data exports until set. */
  license: "unknown-pending",
};

/** Hours a source's records are held back from public views. */
export const SOURCE_DELAY_HOURS: Record<string, number> = { acartia: ACARTIA.delayHours };

/** True when a record may be shown publicly now. Mirrors delayFilter() in the SQL routes. */
export function isPublicNow(source: string, eventStart: Date | string, now = new Date()): boolean {
  const h = SOURCE_DELAY_HOURS[source];
  return !h || new Date(eventStart).getTime() <= now.getTime() - h * 3600_000;
}

/** Editable display names for Acartia's data_source_entity values. */
export const PROVIDER_LABEL: Record<string, string> = { "Conserve.io": "Conserve.io / Whale Alert" };

/** Per-record credit line shown with every record of a source that needs one. */
export function creditFor(source: string, provider?: string | null): string | null {
  if (source !== "acartia") return null;
  const p = provider ? PROVIDER_LABEL[provider] ?? provider : null;
  return `Data: Acartia (acartia.io)${p ? `, via ${p}` : ""}`;
}

/** Sources whose station or observer positions must never be published (positions would reveal the newest records early). */
export const HIDDEN_DEPLOYMENT_SOURCES = ["acartia"];

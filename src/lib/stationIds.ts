import { HIDDEN_DEPLOYMENT_SOURCES } from "@/lib/sources";

/** Station ids and slugs (pure, no database): see src/lib/stations.ts. */

/** Sources that never get a station page: BirdWeather keeps station identity, hidden-position sources, people's observations. */
export const NO_STATION_PAGE = new Set(["birdweather", "inaturalist", "gbif", "obis", "upload", ...HIDDEN_DEPLOYMENT_SOURCES]);
export const GROUP_MAX = 20;
export const FEED_LIMIT = 40;

/** URL-safe, reversible slug: "<source>~<deploymentId>" with the deployment id percent-encoded. Pure. */
export const stationSlug = (id: string) => {
  const i = id.indexOf(":");
  return `${id.slice(0, i)}~${encodeURIComponent(id.slice(i + 1))}`;
};

/** Deployment id from a slug (or from a plain "<source>:<deploymentId>"), or null. Pure. */
export function stationIdFromSlug(slug: string): string | null {
  let s = slug.trim();
  if (s.includes("%")) { try { s = decodeURIComponent(s); } catch { return null; } }
  const i = s.search(/[~:]/);
  if (i <= 0 || i === s.length - 1 || s.length > 200) return null;
  const source = s.slice(0, i);
  if (!/^[a-z0-9._-]+$/i.test(source)) return null;
  return `${source}:${s.slice(i + 1)}`;
}

export const sourceOf = (id: string) => id.split(":")[0];
export const allowedId = (id: string) => !NO_STATION_PAGE.has(sourceOf(id));

/** True when the name is an IANA time zone this runtime knows. Pure. */
export function validTimeZone(tz: string | null | undefined): tz is string {
  if (!tz || !/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/.test(tz)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

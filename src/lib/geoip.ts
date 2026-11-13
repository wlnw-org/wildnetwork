import maxmind, { type CityResponse, type Reader } from "maxmind";

/**
 * Approximate visitor area from a local copy of DB-IP's free "IP to City Lite" database (CC BY 4.0, https://db-ip.com),
 * at GEOIP_DB on the server, refreshed monthly by deploy/geoip-update.sh. The lookup runs on this server: the IP is not
 * sent anywhere and nothing is stored. Null when the database is missing (local development) or the IP is not listed.
 */
let reader: Promise<Reader<CityResponse> | null> | null = null;
function open() {
  const path = process.env.GEOIP_DB;
  if (!path) return Promise.resolve(null);
  reader ??= maxmind.open<CityResponse>(path, { watchForUpdates: true, watchForUpdatesNonPersistent: true }).catch((e) => {
    console.error("geoip open", String(e));
    reader = null;
    return null;
  });
  return reader;
}

export async function lookupIp(ip: string): Promise<{ lat: number; lon: number; city: string | null; country: string | null } | null> {
  if (!ip || !maxmind.validate(ip)) return null;
  const r = await open();
  const hit = r?.get(ip);
  const loc = hit?.location;
  if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return null;
  return { lat: loc.latitude, lon: loc.longitude, city: hit.city?.names?.en ?? null, country: hit.country?.iso_code ?? null };
}

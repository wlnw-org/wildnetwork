import { sql } from "@/lib/db";
import { snap, studyDashboard, type Study } from "@/lib/studies";

/**
 * Place search and place reports. Places come from Open-Meteo's free geocoder (GeoNames data, no key), looked up on the
 * server so the browser only talks to us. A report is honest about resolution: every measure is per 5 degree cell, so a
 * city report covers the cell the city sits in (about 550 km across), built with the same queries as a study area.
 */
export interface Place { name: string; admin1: string | null; country: string | null; countryCode: string; lat: number; lon: number; population: number; slug: string }

const clean = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const placeSlug = (p: { name: string; countryCode: string }) => `${clean(p.name)}-${p.countryCode.toLowerCase()}`;
export const placeLabel = (p: Pick<Place, "name" | "admin1" | "country">) => [p.name, p.admin1, p.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

type Raw = { name: string; admin1?: string; country?: string; country_code?: string; latitude: number; longitude: number; population?: number; feature_code?: string };

export async function searchPlaces(q: string, count = 8): Promise<Place[]> {
  const name = q.trim().slice(0, 80);
  if (name.length < 2) return [];
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=${count}&language=en&name=${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
  });
  if (!r.ok) return [];
  const d = (await r.json()) as { results?: Raw[] };
  return (d.results ?? []).filter((g) => g.country_code).map((g) => {
    const p = { name: g.name, admin1: g.admin1 ?? null, country: g.country ?? null, countryCode: g.country_code!, lat: g.latitude, lon: g.longitude, population: g.population ?? 0 };
    return { ...p, slug: placeSlug(p) };
  });
}

/** "chennai-in" -> the most populous match of that name in that country. */
export async function placeBySlug(slug: string): Promise<Place | null> {
  const m = /^([a-z0-9-]+)-([a-z]{2})$/.exec(slug);
  if (!m) return null;
  const found = (await searchPlaces(m[1].replace(/-/g, " "), 20)).filter((p) => p.slug === slug);
  return found.sort((a, b) => b.population - a.population)[0] ?? null;
}

export const PLACE_GROUPS = ["avian", "bat", "amphibian", "insect"] as const;

/** Everything a place report shows: the cell's dashboard, recording devices (not observers) and arrivals split into recent and coming. */
export async function placeReport(lat: number, lon: number, grp: string) {
  const cellLat = snap(lat), cellLon = snap(lon);
  const s: Study = { id: "", owner: "", owner_name: "", title: "", question: null, lat_min: cellLat, lat_max: cellLat, lon_min: cellLon, lon_max: cellLon, grp, species: [], digest: false, created_at: "" };
  const [d, stations] = await Promise.all([
    studyDashboard(s),
    sql<{ source_system: string; n: number }[]>`
      SELECT source_system, COUNT(*)::int AS n FROM deployments
      WHERE latitude >= ${cellLat} AND latitude < ${cellLat + 5} AND longitude >= ${cellLon} AND longitude < ${cellLon + 5}
        AND last_seen > now() - interval '30 days'
        AND source_system NOT IN ('inaturalist', 'gbif', 'obis')
      GROUP BY 1 ORDER BY 2 DESC`.catch(() => []),
  ]);
  // Arrival weeks are from the last year: compare by day of year, so "now" means the same weeks a year on.
  const doy = (iso: string) => { const t = new Date(iso + "T00:00:00Z"); return Math.floor((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000); };
  const today = doy(new Date().toISOString().slice(0, 10));
  const ahead = (a: { arrival: string }) => (doy(a.arrival) - today + 365) % 365;
  const recent = d.arrivals.filter((a) => ahead(a) > 365 - 28).sort((a, b) => ahead(b) - ahead(a));
  const coming = d.arrivals.filter((a) => ahead(a) <= 42).sort((a, b) => ahead(a) - ahead(b));
  const watched = d.coverage.reduce((m, c) => Math.max(m, c.watched), 0);
  return { cell: { lat: cellLat, lon: cellLon }, grp, watched, top: d.top.slice(0, 15), recent, coming, arrivals: d.arrivals.length, stations };
}
export type PlaceReport = Awaited<ReturnType<typeof placeReport>>;

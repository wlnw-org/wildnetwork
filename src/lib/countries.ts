import DATA from "@/data/country-seasons.json";
import type { Row } from "@/components/CityBirds";

/** Countries from scripts/country-seasons.mts. Migrant: [sci, English, status, records, arrive 1-12, leave 1-12, presence Jan..Dec]. */
export type Status = "winter" | "summer" | "passage";
export type CMigrant = [string, string | null, Status, number, number | null, number | null, number[]];
export type Country = {
  slug: string; iso: string; name: string; centre: [number, number]; bbox: [number, number, number, number];
  south: boolean; records: number; regions: number; migrants: CMigrant[]; top: Row[];
};

const RAW = DATA.countries as unknown as Record<string, Omit<Country, "slug">>;
export const COUNTRIES: Country[] = Object.entries(RAW).map(([slug, c]) => ({ slug, ...c }));
export const COUNTRY_YEARS = DATA.years as [number, number];
export const COUNTRY_GENERATED = DATA.generated;
export const countryBySlug = (slug: string) => COUNTRIES.find((c) => c.slug === slug) ?? null;
/** UK and India have their own hand-made pages at the same slugs (src/app/arrivals/uk, /india). */
export const OWN_PAGE = new Set(["uk", "india"]);
/** A country page is worth showing (and indexing) with a few seasonal birds and a checklist. */
export const hasPage = (c: Country) => c.migrants.length >= 5 && c.top.length >= 20;

const THE = new Set(["US", "NL", "PH", "BS", "AE", "DO", "GM", "CF", "CD", "CG", "KM", "MV", "MH", "SB", "GB"]);
/** "the Netherlands" in a sentence. */
export const inName = (c: Pick<Country, "iso" | "name">) => (THE.has(c.iso) ? `the ${c.name}` : c.name);
/** Within 15 degrees of the equator the seasons are named by the hemisphere the visitors come from. */
const tropical = (c: Country) => Math.abs(c.centre[0]) < 15;

export function seasonHeading(st: Status, c: Country) {
  if (st === "passage") return "Passing through";
  if (!tropical(c)) return st === "winter" ? "Winter visitors" : "Summer visitors";
  const hemi = c.south ? "southern" : "northern";
  return st === "winter" ? `Visitors in the ${hemi} winter` : `Visitors in the ${hemi} summer`;
}
const ALIAS: Record<string, string> = { usa: "US", america: "US", "united states of america": "US", uk: "GB", britain: "GB", "great britain": "GB",
  england: "GB", scotland: "GB", wales: "GB", holland: "NL", "south korea": "KR", korea: "KR", burma: "MM", "ivory coast": "CI", czech: "CZ", turkiye: "TR", "türkiye": "TR" };
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Countries whose name (or a common other name) starts with the query, or a word of it does. */
export function searchCountries(q: string, max = 3) {
  const s = fold(q);
  if (s.length < 2) return [];
  const alias = Object.entries(ALIAS).filter(([k]) => k.startsWith(s) && s.length >= 2).map(([, iso]) => iso);
  return COUNTRIES.filter((c) => {
    const n = fold(c.name);
    return alias.includes(c.iso) || n.startsWith(s) || (s.length >= 3 && n.split(/[\s-]+/).some((w) => w.startsWith(s))) || c.iso.toLowerCase() === s;
  }).sort((a, b) => b.records - a.records).slice(0, max)
    .map((c) => ({ slug: c.slug, iso: c.iso, name: c.name, lat: c.centre[0], lon: c.centre[1], bbox: c.bbox, page: hasPage(c) || OWN_PAGE.has(c.slug) ? `/arrivals/${c.slug}` : null }));
}

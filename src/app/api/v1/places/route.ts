import { searchPlaces } from "@/lib/places";
import { searchCountries } from "@/lib/countries";

/** GET /api/v1/places?q=chen : country and place suggestions for the map search (Open-Meteo geocoder, looked up server side). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const places = q.trim().length >= 3 ? await searchPlaces(q).catch(() => []) : [];
  // Countries first: "spain" means the country, not a village called Spain.
  const countries = searchCountries(q);
  // The geocoder also returns countries as places ("Spain, Spain"): keep only the country result for those.
  const isCountry = new Set(countries.map((c) => `${c.name}|${c.iso}`));
  const placesOnly = places.filter((p) => !isCountry.has(`${p.name}|${p.countryCode}`) && !(p.name === p.country && p.population > 1_000_000));
  return Response.json({ places: placesOnly, countries }, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800" } });
}

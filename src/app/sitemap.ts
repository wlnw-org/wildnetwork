import type { MetadataRoute } from "next";
import INDIA from "@/data/india-seasons.json";
import { INDIA_STATES } from "@/lib/indiaStates";
import { countryCounts, countrySlug, lostSpeciesPublic, MIN_COUNTRY_PAGE } from "@/lib/lostPublic";
import { PAGE_LANGS, countryLangs } from "@/lib/pageLang";
import { COUNTRIES, OWN_PAGE, hasPage } from "@/lib/countries";
import { sql } from "@/lib/db";
import PLACES from "@/data/places.json";
import CITY from "@/data/place-birds.json";
import { UK_SPECIES } from "@/lib/ukSeasons";
import { REGIONS } from "@/lib/regions";
import { HELP } from "@/data/help";
import { INDEXED_GROUPS, SITE, speciesSlug } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/species`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/methods`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/validation`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/contribute`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/updates`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE}/report`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/alerts`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/report/area`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/studio`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/studio/benchmark`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/institutions`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/developers`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/data`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/stations`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/arrivals`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/migration`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE}/arrivals/uk`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/arrivals/india`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/lost-species`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/quiz`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/quiz/class`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/patch`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/guess`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/research`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/studies`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/projects`, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/datasets`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/places`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/help`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/help/whats-new`, changeFrequency: "weekly", priority: 0.5 },
    ...HELP.flatMap((s) => [{ url: `${SITE}/help/${s.id}`, changeFrequency: "monthly" as const, priority: 0.6 },
      ...s.guides.map((g) => ({ url: `${SITE}/help/${s.id}/${g.slug}`, changeFrequency: "monthly" as const, priority: 0.5 }))]),
    ...PLACES.map((p) => ({ url: `${SITE}/places/${p.slug}`, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...INDIA_STATES.filter((s) => s.migrants.length >= 5).map((s) => ({ url: `${SITE}/arrivals/india/${s.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    // Hindi and Tamil versions of the India pages (src/app/hi, src/app/ta).
    ...PAGE_LANGS.flatMap((l) => [`/arrivals/india`, ...INDIA_STATES.filter((s) => s.migrants.length >= 5).map((s) => `/arrivals/india/${s.slug}`)]
      .map((p) => ({ url: `${SITE}/${l}${p}`, changeFrequency: "weekly" as const, priority: 0.6 }))),
    ...COUNTRIES.filter((c) => hasPage(c) && !OWN_PAGE.has(c.slug)).map((c) => ({ url: `${SITE}/arrivals/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.7 })),
    // Country pages in the country's own language (src/app/<lang>/arrivals/[country]).
    ...COUNTRIES.filter((c) => hasPage(c) && !OWN_PAGE.has(c.slug)).flatMap((c) => countryLangs(c.slug)
      .map((l) => ({ url: `${SITE}/${l}/arrivals/${c.slug}`, changeFrequency: "weekly" as const, priority: 0.6 }))),
    ...REGIONS.map((r) => ({ url: `${SITE}/arrivals/${r.slug}`, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
  // Top 15 of each city checklist, as species pages link those cities (src/components/CityBirds.tsx citiesFor).
  const cityTop = [...new Set(Object.values(CITY.cities as unknown as Record<string, { species: [string, ...unknown[]][] }>).flatMap((c) => c.species.slice(0, 15).map((x) => x[0])))];
  // Only species pages worth a search visit (same rule as the species page's noindex, INDEXED_GROUPS): a well supported
  // arrival for a vertebrate group, or a season in India or the UK, or a city checklist. lastmod = when its arrival dates
  // were last recomputed, so the date means something.
  const rows = await sql<{ scientific_name: string; lm: Date | null }[]>`
    SELECT p.scientific_name, MAX(p.computed_at) AS lm FROM phenology p JOIN species_group g USING (scientific_name)
    WHERE g.grp IN ${sql([...INDEXED_GROUPS])} AND COALESCE(p.arrival_support, 0) >= 0.5 GROUP BY 1
    UNION SELECT scientific_name, NULL FROM species_group WHERE scientific_name IN ${sql([...INDIA.species.map((x) => x.sci), ...UK_SPECIES.map((x) => x.sci), ...cityTop])} AND is_species
    ORDER BY 1 LIMIT 5000`.catch(() => []);
  const seen = new Map<string, Date | null>();
  for (const r of rows) if (!seen.get(r.scientific_name)) seen.set(r.scientific_name, r.lm);
  const datasets = await sql<{ id: string }[]>`SELECT id FROM datasets WHERE status = 'live'`.catch(() => []);
  // Lost species by country (src/app/lost-species/in/[country]).
  const lost = countryCounts(await lostSpeciesPublic().catch(() => [])).filter(([, n]) => n >= MIN_COUNTRY_PAGE)
    .map(([c]) => ({ url: `${SITE}/lost-species/in/${countrySlug(c)}`, changeFrequency: "monthly" as const, priority: 0.6 }));
  return [...pages, ...lost, ...datasets.map((d) => ({ url: `${SITE}/datasets/${d.id}`, changeFrequency: "weekly" as const, priority: 0.5 })), ...[...seen].map(([name, lm]) => ({ url: `${SITE}/species/${speciesSlug(name)}`, ...(lm ? { lastModified: lm } : {}), changeFrequency: "weekly" as const, priority: 0.6 }))];
}

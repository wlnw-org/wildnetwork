import type { MetadataRoute } from "next";
import INDIA from "@/data/india-seasons.json";
import { sql } from "@/lib/db";
import PLACES from "@/data/places.json";
import CITY from "@/data/place-birds.json";
import { UK_SPECIES } from "@/lib/ukSeasons";
import { REGIONS } from "@/lib/regions";
import { HELP } from "@/data/help";
import { SITE, speciesSlug } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/species`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/methods`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/validation`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/contribute`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/updates`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    { url: `${SITE}/report`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/alerts`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/report/area`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/studio`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/studio/benchmark`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/institutions`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/developers`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/data`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/stations`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/arrivals`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/arrivals/uk`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/arrivals/india`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/lost-species`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/research`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/studies`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/projects`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/datasets`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/places`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/help`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${SITE}/help/whats-new`, lastModified: now, changeFrequency: "weekly", priority: 0.5 },
    ...HELP.flatMap((s) => [{ url: `${SITE}/help/${s.id}`, changeFrequency: "monthly" as const, priority: 0.6 },
      ...s.guides.map((g) => ({ url: `${SITE}/help/${s.id}/${g.slug}`, changeFrequency: "monthly" as const, priority: 0.5 }))]),
    ...PLACES.map((p) => ({ url: `${SITE}/places/${p.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...REGIONS.map((r) => ({ url: `${SITE}/arrivals/${r.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
  // Top 15 of each city checklist, as species pages link those cities (src/components/CityBirds.tsx citiesFor).
  const cityTop = [...new Set(Object.values(CITY.cities as unknown as Record<string, { species: [string, ...unknown[]][] }>).flatMap((c) => c.species.slice(0, 15).map((x) => x[0])))];
  // Only species with something to say: a seasonal record, or a season in India (src/data/india-seasons.json) and a page.
  const rows = await sql<{ scientific_name: string }[]>`
    SELECT DISTINCT scientific_name FROM phenology
    UNION SELECT scientific_name FROM species_group WHERE scientific_name IN ${sql([...INDIA.species.map((x) => x.sci), ...UK_SPECIES.map((x) => x.sci), ...cityTop])} AND is_species
    ORDER BY 1 LIMIT 5000`.catch(() => []);
  const datasets = await sql<{ id: string }[]>`SELECT id FROM datasets WHERE status = 'live'`.catch(() => []);
  return [...pages, ...datasets.map((d) => ({ url: `${SITE}/datasets/${d.id}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.5 })), ...rows.map((r) => ({ url: `${SITE}/species/${speciesSlug(r.scientific_name)}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 }))];
}

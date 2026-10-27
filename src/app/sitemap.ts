import type { MetadataRoute } from "next";
import { sql } from "@/lib/db";
import { REGIONS } from "@/lib/regions";
import { SITE, speciesSlug } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE}/species`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE}/methods`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/validation`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/contribute`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/developers`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/data`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/stations/join`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE}/stations`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE}/arrivals`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/research`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/studies`, lastModified: now, changeFrequency: "daily", priority: 0.6 },
    ...REGIONS.map((r) => ({ url: `${SITE}/arrivals/${r.slug}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
  // Only species with a seasonal record: those pages have something to say.
  const rows = await sql<{ scientific_name: string }[]>`SELECT DISTINCT scientific_name FROM phenology ORDER BY 1 LIMIT 5000`.catch(() => []);
  return [...pages, ...rows.map((r) => ({ url: `${SITE}/species/${speciesSlug(r.scientific_name)}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 }))];
}

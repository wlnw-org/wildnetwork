/** The continents of REGION in src/lib/methods.ts, with URL slugs for the /arrivals hub pages. Keep the names in step. */
export const REGIONS = [
  { slug: "europe", name: "Europe" },
  { slug: "north-america", name: "North America" },
  { slug: "south-america", name: "South America" },
  { slug: "africa", name: "Africa" },
  { slug: "asia", name: "Asia" },
  { slug: "oceania", name: "Oceania" },
] as const;

export const regionSlug = (name: string) => REGIONS.find((r) => r.name === name)?.slug ?? null;
export const regionBySlug = (slug: string) => REGIONS.find((r) => r.slug === slug) ?? null;

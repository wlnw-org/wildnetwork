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

/** Continent of a 5 degree cell from its lower-left corner (same split as REGION in methods.ts). */
export function regionOf(cellLat: number, cellLon: number): (typeof REGIONS)[number]["name"] {
  if (cellLon < -30) return cellLat >= 10 ? "North America" : "South America";
  if (cellLon < 60) return cellLat >= 35 ? "Europe" : "Africa";
  if (cellLon >= 110 && cellLat < -10) return "Oceania";
  return "Asia";
}

// Public view of the lost species list (/lost-species). Only list facts are shown: names, group, Red List status and the
// countries and region where each species was last known, as published (CC0) in Lindken et al. 2024. Records we receive of
// these species are never shown here: they stay in the private review queue (src/lib/lost.ts).
import { unstable_cache } from "next/cache";
import { sql } from "@/lib/db";

export interface LostPublic {
  scientific_name: string; common_name: string | null; class_name: string | null; red_list: string | null;
  countries: string[]; region: string | null; thumb_url: string | null; image_credit: string | null;
}

export const GROUPS: Record<string, string> = { Amphibia: "Amphibians", Aves: "Birds", Mammalia: "Mammals", Reptilia: "Reptiles" };

export const RED_LIST: Record<string, string> = {
  CR: "Critically Endangered", "CR(PE)": "Critically Endangered, possibly extinct", EN: "Endangered", VU: "Vulnerable",
  NT: "Near Threatened", LC: "Least Concern", DD: "Data Deficient", NE: "Not yet assessed",
};

/** The list's country field is free text ("Costa Rica, Panama", "Indonesia: probably W Kalimantan", "The Democratic
 *  Republic of Congo"). Split it into plain country names for the filter. */
export function splitCountries(field: string | null): string[] {
  if (!field || field.startsWith("*")) return [];
  return [...new Set(field.replace(/ /g, " ").split(/[;,]/).map((raw) => {
    let c = raw.trim();
    const inner = c.match(/\(([^)]+)\)/);
    if (inner) c = inner[1];
    if (c.includes(":")) { const [a, b] = c.split(":").map((x) => x.trim()); c = /west indies/i.test(a) && b ? b : a; }
    return c.replace(/^the\s+/i, "").replace(/\s+/g, " ").replace(/^Democratic Republic of the Congo$/i, "Democratic Republic of Congo").trim();
  }).filter((c) => c.length > 1 && /^[A-ZÀ-Ý]/.test(c)))]; // a lower-case start is a remark ("but some uncertainty..."), not a place
}

/** Species shown publicly: on the Re:wild and IUCN SSC list, not listed as Extinct, and not taken off the watch after review. */
export const lostSpeciesPublic = unstable_cache(async (): Promise<LostPublic[]> => {
  const rows = await sql<{ scientific_name: string; common_name: string | null; class_name: string | null; red_list: string | null; countries: string | null; region: string | null; thumb_url: string | null; attribution: string | null; license: string | null }[]>`
    SELECT s.scientific_name, s.common_name, s.class_name, s.red_list, s.countries, s.region, m.thumb_url, m.attribution, m.license
    FROM lost_species s LEFT JOIN species_media m ON m.scientific_name = s.scientific_name AND m.source <> 'none'
    WHERE s.on_rewild_list IS TRUE AND COALESCE(s.red_list, '') <> 'EX' AND NOT s.subspecies AND s.removed IS NULL
    ORDER BY COALESCE(s.common_name, s.scientific_name)`;
  return rows.map((r) => ({
    scientific_name: r.scientific_name, common_name: r.common_name, class_name: r.class_name, red_list: r.red_list,
    countries: splitCountries(r.countries), region: r.region && !r.region.startsWith("*") ? r.region : null,
    thumb_url: r.thumb_url, image_credit: [r.attribution, r.license].filter(Boolean).join(", ") || null,
  }));
}, ["lost-species-public"], { revalidate: 21600 });

/** Every country with its number of lost species, most first. */
export function countryCounts(list: LostPublic[]): [string, number][] {
  const m = new Map<string, number>();
  for (const s of list) for (const c of s.countries) m.set(c, (m.get(c) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

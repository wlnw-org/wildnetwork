import { sql } from "@/lib/db";

/** Common names in the site's languages (species_names, from the BirdNET+ taxonomy) for a list of scientific names. */
export async function getNames(list: string[]): Promise<Record<string, Record<string, string>>> {
  const uniq = [...new Set(list)].slice(0, 500);
  if (!uniq.length) return {};
  const rows = await sql<{ scientific_name: string; names: Record<string, string> }[]>`
    SELECT scientific_name, names FROM species_names WHERE scientific_name = ANY(${uniq})`.catch(() => []);
  return Object.fromEntries(rows.map((r) => [r.scientific_name, Object.fromEntries(Object.entries(r.names).filter(([k]) => k !== "_api"))]));
}

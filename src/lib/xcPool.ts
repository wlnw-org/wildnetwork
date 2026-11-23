import { sql } from "@/lib/db";
import { fetchClips, POOL_SIZE, type XcClip } from "@/lib/xenocanto";

export const XC_TTL_DAYS = 7;

/**
 * Cached xeno-canto recordings of a species in an area ("any" for no area): xc_recordings, refreshed after XC_TTL_DAYS.
 * Only names in our data are looked up, so made-up names cannot fill the table or spend XC requests. Returns null for a
 * name we do not know. Throws XcError when xeno-canto fails (nothing is cached then).
 */
export async function xcPool(name: string, area: string | null, key: string): Promise<XcClip[] | null> {
  const slot = area ?? "any";
  const [cached] = await sql<{ clips: XcClip[] }[]>`
    SELECT clips FROM xc_recordings WHERE scientific_name = ${name} AND area = ${slot} AND fetched_at > now() - make_interval(days => ${XC_TTL_DAYS})`;
  // Entries cached before the country preference (two clips, no coordinates) are refreshed; "none found" stays valid.
  if (cached && (cached.clips.length === 0 || cached.clips.some((c) => c.lat !== undefined))) return cached.clips;
  const [known] = await sql<{ grp: string | null }[]>`
    SELECT grp FROM species_group WHERE scientific_name = ${name}
    UNION ALL SELECT NULL FROM events WHERE scientific_name = ${name} LIMIT 1`;
  if (!known) return null;
  const clips = await fetchClips(name, known.grp, area as never, key, fetch, 4000, POOL_SIZE);
  await sql`INSERT INTO xc_recordings (scientific_name, area, clips) VALUES (${name}, ${slot}, ${sql.json(clips as never)})
    ON CONFLICT (scientific_name, area) DO UPDATE SET clips = EXCLUDED.clips, fetched_at = now()`;
  return clips;
}

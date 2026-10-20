import { sql } from "@/lib/db";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { fetchClips, isArea, XcError, type XcClip } from "@/lib/xenocanto";

const TTL_DAYS = 7;
// Browsers keep a success for an hour and a failure not at all, so an XC outage is retried on the next panel open.
const ok = (clips: XcClip[], sMaxAge: number) =>
  Response.json({ clips, credit: "Recordings courtesy of xeno-canto.org" }, {
    headers: { "cache-control": `public, max-age=${sMaxAge >= 3600 ? 3600 : 0}, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 7}` },
  });

/**
 * ?species=Eudynamys scolopaceus&area=asia -> { clips: up to 2 xeno-canto recordings }.
 * The browser sends a continent at most, never coordinates; for sensitive species the area is ignored.
 * The XC key (XENO_CANTO_API_KEY) stays here. Any failure returns an empty list, so the panel just hides Listen.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const name = (p.get("species") ?? "").trim().replace(/\s+/g, " ");
  const key = process.env.XENO_CANTO_API_KEY;
  if (!key || !/^[A-Za-z-]+ [a-z-]+$/.test(name) || name.length > 80) return ok([], 3600);
  const areaParam = p.get("area");
  const area = isArea(areaParam) && !isSensitiveTaxon([name, name.split(" ")[0]]) ? areaParam : null;
  const slot = area ?? "any";
  try {
    const [cached] = await sql<{ clips: XcClip[] }[]>`
      SELECT clips FROM xc_recordings WHERE scientific_name = ${name} AND area = ${slot} AND fetched_at > now() - make_interval(days => ${TTL_DAYS})`;
    if (cached) return ok(cached.clips, 86400);
    // Only names in our data are looked up, so made-up names cannot fill the table or spend XC requests.
    const [known] = await sql<{ grp: string | null }[]>`
      SELECT grp FROM species_group WHERE scientific_name = ${name}
      UNION ALL SELECT NULL FROM events WHERE scientific_name = ${name} LIMIT 1`;
    if (!known) return ok([], 86400);
    const clips = await fetchClips(name, known.grp, area, key);
    await sql`INSERT INTO xc_recordings (scientific_name, area, clips) VALUES (${name}, ${slot}, ${sql.json(clips as never)})
      ON CONFLICT (scientific_name, area) DO UPDATE SET clips = EXCLUDED.clips, fetched_at = now()`;
    return ok(clips, 86400);
  } catch (e) {
    if (!(e instanceof XcError)) console.error("recordings", e);
    return ok([], 600);
  }
}

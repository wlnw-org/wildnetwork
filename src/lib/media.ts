import { sql } from "@/lib/db";

export interface SpeciesMedia {
  scientificName: string;
  title: string | null;
  thumbUrl: string | null;
  imageUrl: string | null;
  extract: string | null;
  pageUrl: string | null;
  source: string;
  attribution: string | null;
  license: string | null;
  iconic: string | null;
  /** Common names by language code (es, fr, de, pt, hi, ta), from the BirdNET+ taxonomy. */
  names: Record<string, string>;
}

const UA = "WildlifeNetwork/0.1 (+https://wlnw.org; https://github.com/wlnw-org/wildnetwork)";

type Found = Omit<SpeciesMedia, "scientificName" | "iconic" | "names">;
const LANGS = ["es", "fr", "de", "pt", "hi", "ta"];

async function fromWikipedia(name: string): Promise<Found | null> {
  const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`, { headers: { "user-agent": UA } });
  if (!r.ok) return null;
  const j = (await r.json()) as { type?: string; title?: string; thumbnail?: { source: string }; originalimage?: { source: string }; extract?: string; content_urls?: { desktop?: { page: string } } };
  if (j.type === "disambiguation" || !j.title) return null;
  return {
    title: j.title, thumbUrl: j.thumbnail?.source?.split("?")[0] ?? null, imageUrl: j.originalimage?.source?.split("?")[0] ?? null,
    extract: j.extract ?? null, pageUrl: j.content_urls?.desktop?.page ?? null, source: "wikipedia", attribution: "Wikipedia / Wikimedia Commons", license: "CC BY-SA",
  };
}

/** iNaturalist taxon: gives the iconic group for any species, plus a CC photo when one exists. */
async function fromInat(name: string): Promise<{ iconic: string | null; media: Found | null }> {
  const r = await fetch(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(name)}&per_page=1`, { headers: { "user-agent": UA } });
  if (!r.ok) return { iconic: null, media: null };
  const t = ((await r.json()) as { results: { name: string; iconic_taxon_name?: string; wikipedia_url?: string; default_photo?: { medium_url: string; attribution: string; license_code: string | null } }[] }).results[0];
  if (!t || t.name !== name) return { iconic: null, media: null };
  const p = t.default_photo;
  const media = p?.license_code?.startsWith("cc")
    ? { title: t.name, thumbUrl: p.medium_url, imageUrl: p.medium_url.replace("medium", "large"), extract: null, pageUrl: t.wikipedia_url ?? null, source: "inaturalist", attribution: p.attribution, license: p.license_code.toUpperCase() }
    : null;
  return { iconic: t.iconic_taxon_name ?? null, media };
}

type BirdnetTaxon = { scientific_name: string; common_names?: Record<string, string>; avicommons_image?: { medium: string; src: string; author: string; license: string } | null };

/**
 * BirdNET+ taxonomy (birdnet.cornell.edu/taxonomy, Cornell Lab and TU Chemnitz): names in the site's languages (metadata
 * under the project's open-source licence) and, for birds, an Avicommons photo with its photographer and CC licence.
 */
async function fromBirdnet(name: string): Promise<{ names: Record<string, string>; media: Found | null }> {
  const r = await fetch(`https://birdnet.cornell.edu/taxonomy/api/species?q=${encodeURIComponent(name)}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`taxonomy ${r.status}`);
  const t = ((await r.json()) as { results?: BirdnetTaxon[] }).results?.find((x) => x.scientific_name === name);
  if (!t) return { names: {}, media: null };
  const names = Object.fromEntries(LANGS.flatMap((l) => (t.common_names?.[l] ? [[l, t.common_names[l]]] : [])));
  const a = t.avicommons_image;
  const media = a?.medium && a.license?.startsWith("cc")
    ? { title: name, thumbUrl: a.medium, imageUrl: a.src, extract: null, pageUrl: null, source: "avicommons", attribution: `${a.author} / Avicommons`, license: a.license.toUpperCase().replace(/^CC-/, "CC ").replace(/-(\d)/, " $1") }
    : null;
  return { names, media };
}

/** Cached lookup; negative results are cached too (source = none) and retried after 30 days. */
export async function getSpeciesMedia(name: string): Promise<SpeciesMedia> {
  const [cached] = await sql<Record<string, string | null>[]>`
    SELECT * FROM species_media WHERE scientific_name = ${name} AND iconic IS NOT NULL AND (source <> 'none' OR fetched_at > now() - interval '30 days')`;
  if (cached && cached.names != null) return rowToMedia(cached);
  if (cached) {
    // Rows from before names were added: fetch the names once (a failed lookup stays NULL and is retried later).
    const bn = await fromBirdnet(name).catch(() => null);
    if (!bn) return rowToMedia(cached);
    await sql`UPDATE species_media SET names = ${sql.json(bn.names)} WHERE scientific_name = ${name}`;
    return rowToMedia({ ...cached, names: bn.names as unknown as string });
  }
  // Only names that occur in the data are looked up and stored, so made-up names cannot fill the table or trigger outside fetches.
  const [known] = await sql`SELECT 1 FROM species_group WHERE scientific_name = ${name} UNION ALL SELECT 1 FROM events WHERE scientific_name = ${name} LIMIT 1`;
  if (!known) return rowToMedia({ scientific_name: name, source: "none" });
  const [wiki, inat, bn] = await Promise.all([
    fromWikipedia(name).catch(() => null), fromInat(name).catch(() => ({ iconic: null, media: null })), fromBirdnet(name).catch(() => null),
  ]);
  const m = wiki?.thumbUrl ? wiki : (bn?.media ?? inat.media ?? wiki);
  const row = { iconic: inat.iconic ?? "Unknown", scientific_name: name, title: m?.title ?? null, thumb_url: m?.thumbUrl ?? null, image_url: m?.imageUrl ?? null, extract: m?.extract ?? null, page_url: m?.pageUrl ?? null, source: m?.source ?? "none", attribution: m?.attribution ?? null, license: m?.license ?? null, names: bn ? sql.json(bn.names) : null };
  await sql`INSERT INTO species_media ${sql(row)} ON CONFLICT (scientific_name) DO UPDATE SET
    title = EXCLUDED.title, thumb_url = EXCLUDED.thumb_url, image_url = EXCLUDED.image_url, extract = EXCLUDED.extract, page_url = EXCLUDED.page_url, source = EXCLUDED.source, attribution = EXCLUDED.attribution, license = EXCLUDED.license, iconic = EXCLUDED.iconic, names = EXCLUDED.names, fetched_at = now()`;
  return rowToMedia({ ...row, names: (bn?.names ?? null) as unknown as string });
}

function rowToMedia(r: Record<string, string | null>): SpeciesMedia {
  const names = (r.names ?? {}) as unknown as Record<string, string>;
  return { scientificName: r.scientific_name!, title: r.title, thumbUrl: r.thumb_url, imageUrl: r.image_url, extract: r.extract, pageUrl: r.page_url, source: r.source ?? "none", attribution: r.attribution, license: r.license, iconic: r.iconic ?? null, names };
}

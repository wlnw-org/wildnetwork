import type { Metadata } from "next";
import Link from "next/link";
import PausedNotice from "@/components/PausedNotice";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";
import { notFound } from "next/navigation";
import { cache } from "react";
import { sql } from "@/lib/db";
import AlertForm from "@/components/AlertForm";
import { ALERTS_ENABLED } from "@/lib/alerts";
import { getSpeciesMedia } from "@/lib/media";
import { LocalDate, LocalName, PageLang, T } from "@/components/T";
import { getNames } from "@/lib/names";
import { REGION } from "@/lib/methods";
import { regionSlug } from "@/lib/regions";
import { SITE, speciesSlug } from "@/lib/site";
import { getClimate, getYearSpan, speciesStory } from "@/lib/story";

export const revalidate = 3600;


type Related = { scientific_name: string; vernacular_name: string | null };

/** Everything the page shows, straight from the tables behind the public API. */
const load = cache(async (slug: string) => {
  const [sp] = await sql<{ scientific_name: string; grp: string }[]>`
    SELECT scientific_name, grp FROM species_group WHERE lower(replace(scientific_name, ' ', '-')) = ${slug.toLowerCase()} AND is_species LIMIT 1`;
  if (!sp) return null;
  const name = sp.scientific_name;
  const [names, recent, arrivals, media, climate, span] = await Promise.all([
    sql<{ vernacular_name: string | null }[]>`SELECT MIN(vernacular_name) AS vernacular_name FROM species_weekly WHERE scientific_name = ${name}`,
    // The weekly history, because some sources publish with a delay of a week or two.
    sql<{ n: number; cells: number }[]>`SELECT COALESCE(SUM(count), 0)::int AS n, COUNT(DISTINCT (cell_lat, cell_lon))::int AS cells FROM species_weekly WHERE scientific_name = ${name} AND week >= CURRENT_DATE - 56`,
    sql<{ region: string; first: string; last: string; peak: string; areas: number }[]>`
      SELECT ${REGION} AS region, MIN(arrival_week)::text AS first, MAX(arrival_week)::text AS last,
             (percentile_disc(0.5) WITHIN GROUP (ORDER BY peak_week))::text AS peak, COUNT(*)::int AS areas
      FROM phenology WHERE scientific_name = ${name} GROUP BY 1 ORDER BY COUNT(*) DESC`,
    getSpeciesMedia(name).catch(() => null),
    getClimate(name).catch(() => null),
    getYearSpan(name, sp.grp).catch(() => null),
  ]);
  const top = arrivals[0]?.region ?? null;
  // Links to neighbouring pages: the same genus, and species arriving in the same region within about ten days.
  const [genus, sameTime] = await Promise.all([
    sql<Related[]>`SELECT scientific_name, MIN(vernacular_name) AS vernacular_name FROM phenology
      WHERE split_part(scientific_name, ' ', 1) = ${name.split(" ")[0]} AND scientific_name <> ${name}
      GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 8`,
    top ? sql<Related[]>`
      WITH a AS (SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, COUNT(*) AS n,
                        percentile_disc(0.5) WITHIN GROUP (ORDER BY arrival_week) AS w
                 FROM phenology WHERE ${REGION} = ${top} GROUP BY 1)
      SELECT a.scientific_name, a.vernacular_name FROM a, (SELECT w FROM a WHERE scientific_name = ${name}) me
      WHERE a.scientific_name <> ${name} AND abs(a.w - me.w) <= 10 ORDER BY a.n DESC LIMIT 8` : Promise.resolve([] as Related[]),
  ]);
  return { name, grp: sp.grp, common: names[0]?.vernacular_name ?? null, recent: recent[0], arrivals, media, story: speciesStory(name, [], climate, span), top, genus, sameTime };
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Species not found" };
  const label = d.common ? `${d.common} (${d.name})` : d.name;
  const description = `Where the ${d.common ?? d.name} is being detected now, when it arrives in each region and how its range moves through the year, from community acoustic sensors. Effort corrected, with published methods.`;
  const thin = d.arrivals.length === 0 && d.story.length === 0;
  return {
    title: `${label}: migration, arrival dates and live map`,
    description,
    alternates: { canonical: `/species/${speciesSlug(d.name)}` },
    robots: thin ? { index: false, follow: true } : undefined,
    openGraph: { title: `${label} on Wildlife Network`, description, url: `/species/${speciesSlug(d.name)}`, type: "article", ...(d.media?.imageUrl ? { images: [{ url: d.media.imageUrl, alt: label }] } : {}) },
  };
}

export default async function SpeciesPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const title = d.common ?? d.name;
  const names = await getNames([d.name, ...d.genus.map((r) => r.scientific_name), ...d.sameTime.map((r) => r.scientific_name)]);
  const nm = { ...(names[d.name] ?? {}), ...(d.media?.names ?? {}) };
  const url = `${SITE}/species/${speciesSlug(d.name)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: `${title}: migration, arrival dates and live map`, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Taxon", name: d.name, ...(d.common ? { alternateName: d.common } : {}), taxonRank: "species", ...(d.media?.pageUrl ? { sameAs: d.media.pageUrl } : {}) } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: "Species", item: `${SITE}/species` },
        { "@type": "ListItem", position: 3, name: title, item: url },
      ] },
    ],
  };
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500 flex items-center gap-2">
          <span><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/species" className="text-cyan-400 hover:underline"><T k="Species" /></Link></span>
          <span className="ml-auto"><PageLang /></span>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><LocalName en={title} names={nm} /></h1>
        {d.common && <p className="mt-1 text-slate-400 italic">{d.name}</p>}
        {BIRDWEATHER_PAUSED && <PausedNotice className="mt-4" />}

        {d.media?.imageUrl && (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.media.imageUrl} alt={`${title} (${d.name})`} className="w-full max-h-96 object-cover rounded-lg" />
            {(d.media.attribution || d.media.license) && <figcaption className="mt-1 text-xs text-slate-500">Image: {[d.media.attribution, d.media.license, d.media.source].filter(Boolean).join(", ")}</figcaption>}
          </figure>
        )}
        {d.media?.extract && (
          <p className="mt-5">
            {d.media.extract}{" "}
            {d.media.pageUrl && <a href={d.media.pageUrl} className="text-cyan-400 hover:underline" rel="noopener"><T k="Source" /></a>}
          </p>
        )}

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="Where is the {name} now?" v={{ name: title }} names={nm} /></h2>
        <p className="mt-2">
          {d.recent.n > 0
            ? <T k={d.recent.cells === 1 ? "In the last 8 weeks it was recorded {n} times in one area (a 5 degree square)." : "In the last 8 weeks it was recorded {n} times across {c} areas (each area is a 5 degree square)."} v={{ n: d.recent.n.toLocaleString("en-GB"), c: d.recent.cells }} />
            : <T k="No records in the last 8 weeks. It may be out of season where the observers and sensors are." />}
        </p>
        <p className="mt-3">
          <Link href={`/?species=${encodeURIComponent(d.name)}`} className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400"><T k="See the {name} on the live map" v={{ name: title }} names={nm} /></Link>
        </p>
        {ALERTS_ENABLED && !BIRDWEATHER_PAUSED && (
          <section id="alert" className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100"><T k="Get an email when the {name} arrives near you" v={{ name: title }} names={nm} /></h2>
            <AlertForm species={d.name} title={title} />
          </section>
        )}

        {d.story.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="How the {name} moves through the year" v={{ name: title }} names={nm} /></h2>
            {d.story.map((s) => <p key={s} className="mt-2">{s}</p>)}
          </>
        )}

        {d.arrivals.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="When does the {name} arrive?" v={{ name: title }} names={nm} /></h2>
            <p className="mt-2"><T k="The week it was first heard regularly in each region, after at least six weeks away. Dates differ from south to north, so a region has a range." /></p>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium"><T k="Region" /></th><th className="font-medium"><T k="First arrival" /></th><th className="font-medium"><T k="Last arrival" /></th><th className="font-medium"><T k="Typical peak" /></th><th className="font-medium text-right"><T k="Areas" /></th></tr></thead>
              <tbody>
                {d.arrivals.map((a) => (
                  <tr key={a.region} className="border-b border-white/5"><td className="py-1.5">{regionSlug(a.region) ? <Link href={`/arrivals/${regionSlug(a.region)}`} className="text-cyan-400 hover:underline"><T k={a.region} /></Link> : <T k={a.region} />}</td><td><LocalDate iso={a.first} year /></td><td><LocalDate iso={a.last} year /></td><td><LocalDate iso={a.peak} year /></td><td className="text-right">{a.areas}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-sm">
              <a href={`/api/v1/arrivals?species=${encodeURIComponent(d.name)}&format=csv`} className="text-cyan-400 hover:underline" rel="nofollow"><T k="Download every area as CSV" /></a>
              {" · "}<Link href={`/species/${speciesSlug(d.name)}/review`} className="text-cyan-400 hover:underline"><T k="Review these arrival dates" /></Link> <T k="(researchers, ORCID sign-in)" />
            </p>
          </>
        )}

        {d.sameTime.length > 0 && d.top && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="Arriving at the same time in {region}" v={{ region: d.top }} /></h2>
            <RelatedList items={d.sameTime} names={names} />
            <p className="mt-2 text-sm"><Link href={`/arrivals/${regionSlug(d.top)}`} className="text-cyan-400 hover:underline"><T k="Every arrival in {region}, month by month" v={{ region: d.top }} /></Link></p>
          </>
        )}
        {d.genus.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="Related species" /></h2>
            <RelatedList items={d.genus} names={names} />
          </>
        )}

        <p className="mt-8 text-sm text-slate-500">
          <T k="Figures are effort corrected and come from automatic sound identification, which makes mistakes." />{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline"><T k="How this is measured" /></Link>{" · "}
          <Link href="/validation" className="text-cyan-400 hover:underline"><T k="How it compares with human observers" /></Link>
        </p>
      </div>
    </main>
  );
}

function RelatedList({ items, names }: { items: Related[]; names: Record<string, Record<string, string>> }) {
  return (
    <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
      {items.map((r) => (
        <li key={r.scientific_name}>
          <Link href={`/species/${speciesSlug(r.scientific_name)}`} className="text-cyan-400 hover:underline" prefetch={false}><LocalName en={r.vernacular_name ?? r.scientific_name} names={names[r.scientific_name]} /></Link>
          {r.vernacular_name && <span className="text-slate-500 italic"> {r.scientific_name}</span>}
        </li>
      ))}
    </ul>
  );
}

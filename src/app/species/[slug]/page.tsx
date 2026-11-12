import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import { credits } from "@/lib/datasets";
import Link from "next/link";
import PausedNotice from "@/components/PausedNotice";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";
import { notFound } from "next/navigation";
import { cache } from "react";
import { sql } from "@/lib/db";
import AlertForm from "@/components/AlertForm";
import DownloadLink from "@/components/DownloadLink";
import { openRecordsHref } from "@/lib/openRecords";
import { ALERTS_ENABLED } from "@/lib/alerts";
import { getSpeciesMedia } from "@/lib/media";
import { LocalDate, LocalName, T } from "@/components/T";
import { getNames } from "@/lib/names";
import { REGION } from "@/lib/methods";
import { regionSlug } from "@/lib/regions";
import { SITE, speciesSlug } from "@/lib/site";
import { getClimate, getYearSpan, speciesStory } from "@/lib/story";
import { TR } from "@/components/TR";
import INDIA from "@/data/india-seasons.json";
import { statesFor } from "@/lib/indiaStates";
import HeroImage from "@/components/HeroImage";
import { commonsThumb } from "@/lib/commonsThumb";
import PLACES from "@/data/places.json";
import { citiesFor } from "@/components/CityBirds";
import { ukArrival, ukSeason } from "@/lib/ukSeasons";

export const revalidate = 3600;
// An empty list lets Next.js build each species page on its first visit and cache it (without it the route renders on every request).
export async function generateStaticParams() { return []; }


type Related = { scientific_name: string; vernacular_name: string | null };

/** Everything the page shows, straight from the tables behind the public API. */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Its season in India, when it is a migrant there (src/data/india-seasons.json, built by scripts/india-seasons.mts). */
const indiaSeason = (name: string) => INDIA.species.find((s) => s.sci === name) ?? null;

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
  const [genus, sameTime, contributed] = await Promise.all([
    sql<Related[]>`SELECT scientific_name, MIN(vernacular_name) AS vernacular_name FROM phenology
      WHERE split_part(scientific_name, ' ', 1) = ${name.split(" ")[0]} AND scientific_name <> ${name}
      GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 8`,
    top ? sql<Related[]>`
      WITH a AS (SELECT scientific_name, MIN(vernacular_name) AS vernacular_name, COUNT(*) AS n,
                        percentile_disc(0.5) WITHIN GROUP (ORDER BY arrival_week) AS w
                 FROM phenology WHERE ${REGION} = ${top} GROUP BY 1)
      SELECT a.scientific_name, a.vernacular_name FROM a, (SELECT w FROM a WHERE scientific_name = ${name}) me
      WHERE a.scientific_name <> ${name} AND abs(a.w - me.w) <= 10 ORDER BY a.n DESC LIMIT 8` : Promise.resolve([] as Related[]),
    credits({ species: name }),
  ]);
  return { name, grp: sp.grp, common: names[0]?.vernacular_name ?? null, recent: recent[0], arrivals, media, story: speciesStory(name, [], climate, span), top, genus, sameTime, contributed };
});

const MIGRANT_GROUPS = new Set(["avian", "bat"]);
const monthOf = (iso: string) => MONTH_NAMES[Number(iso.slice(5, 7)) - 1];
const nf = new Intl.NumberFormat("en-GB");

/** A search description from the page's own data, under about 160 characters: when it arrives, where it is now, its season
 *  in India, and where the records come from (sound recorders for birds and bats, people's observations for the rest). */
function describe(d: NonNullable<Awaited<ReturnType<typeof load>>>): string {
  const who = d.common ?? d.name;
  const parts: string[] = [];
  const a = d.arrivals[0];
  if (a) parts.push(a.first.slice(0, 7) === a.last.slice(0, 7)
    ? `The ${who} arrives in ${a.region} around ${monthOf(a.first)}.`
    : `The ${who} arrives in ${a.region} between ${monthOf(a.first)} and ${monthOf(a.last)}.`);
  const uk = ukSeason(d.name);
  if (uk) parts.push(`${uk.status === "summer" ? "Arrives in the UK" : "Comes to the UK for the winter, arriving"} in ${ukArrival(uk).typical}.`);
  const india = indiaSeason(d.name);
  if (india) parts.push(india.status === "winter" ? `A winter visitor to India${india.arrive && india.leave ? `, ${MONTH_NAMES[india.arrive - 1]} to ${MONTH_NAMES[india.leave - 1]}` : ""}.`
    : india.status === "summer" ? "A summer visitor to India." : "Passes through India.");
  if (d.recent.n > 0) parts.push(`${nf.format(d.recent.n)} records in the last 8 weeks${d.recent.cells > 1 ? ` across ${d.recent.cells} areas` : ""}.`);
  if (!parts.length) parts.push(`Where the ${who} is recorded and when, on a live map.`);
  const tail = MIGRANT_GROUPS.has(d.grp) ? " Live map, yearly movement and alerts." : " From open records, with a live map.";
  let out = parts.join(" ");
  if ((out + tail).length <= 160) out += tail;
  return out.length <= 160 ? out : out.slice(0, 157).replace(/\s+\S*$/, "") + "...";
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Species not found" };
  const label = d.common ? `${d.common} (${d.name})` : d.name;
  const description = describe(d);
  const thin = d.arrivals.length === 0 && d.story.length === 0 && !indiaSeason(d.name) && !ukSeason(d.name) && citiesFor(d.name, PLACES).length === 0;
  return {
    // Without the site suffix, so the name and what the page answers fit in a search result (about 60 characters).
    title: { absolute: `${label}: ${MIGRANT_GROUPS.has(d.grp) ? "arrival dates and migration" : "where and when it is recorded"}` },
    description,
    alternates: { canonical: `/species/${speciesSlug(d.name)}` },
    robots: thin ? { index: false, follow: true } : undefined,
    openGraph: { title: `${label} on Wildlife Network`, description, url: `/species/${speciesSlug(d.name)}`, type: "article", ...(d.media?.imageUrl ? { images: [{ url: commonsThumb(d.media.imageUrl), alt: label }] } : {}) },
  };
}

export default async function SpeciesPage({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const title = d.common ?? d.name;
  const india = indiaSeason(d.name);
  const uk = ukSeason(d.name), ukA = uk && ukArrival(uk);
  const cities = citiesFor(d.name, PLACES).slice(0, 12);
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
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400 flex items-center gap-2">
          <span><Link href="/species" className="text-cyan-400 hover:underline"><T k="Species" /></Link></span>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><LocalName en={title} names={nm} /></h1>
        <p className="mt-2"><HelpLink to="/help/site/species" /></p>
        {d.common && <p className="mt-1 text-slate-400 italic">{d.name}</p>}
        {BIRDWEATHER_PAUSED && <PausedNotice className="mt-4" />}

        {d.media?.imageUrl && (
          <figure className="mt-6">
            <HeroImage src={d.media.imageUrl} alt={`${title} (${d.name})`} className="w-full max-h-96 object-contain rounded-lg bg-slate-900" />
            {(d.media.attribution || d.media.license) && <figcaption className="mt-1 text-xs text-slate-400">Image: {[d.media.attribution, d.media.license, d.media.source && !(d.media.attribution ?? "").toLowerCase().includes(d.media.source.toLowerCase()) ? d.media.source : null].filter(Boolean).join(", ")}</figcaption>}
          </figure>
        )}
        {d.media?.extract && (
          <p className="mt-5">
            {d.media.extract}{" "}
            {d.media.pageUrl && <a href={d.media.pageUrl} className="text-cyan-400 hover:underline" rel="noopener"><T k={d.media.pageUrl.includes("wikipedia.org") ? "Read more on Wikipedia" : "Source"} /></a>}
          </p>
        )}

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="Where is the {name} now?" v={{ name: title }} names={nm} /></h2>
        <p className="mt-2">
          {d.recent.n > 0
            ? <T k={d.recent.cells === 1 ? "In the last 8 weeks it was recorded {n} times in one area (about 550 km across)." : "In the last 8 weeks it was recorded {n} times across {c} areas (each about 550 km across)."} v={{ n: d.recent.n.toLocaleString("en-GB"), c: d.recent.cells }} />
            : <T k="No records in the last 8 weeks. It may be out of season where the observers and sensors are." />}
        </p>
        <p className="mt-3">
          <Link href={`/?species=${encodeURIComponent(d.name)}`} className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400"><T k="See the {name} on the live map" v={{ name: title }} names={nm} /></Link>
        </p>
        {ALERTS_ENABLED && !BIRDWEATHER_PAUSED && (
          <section id="alert" className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100"><T k="Get an email when the {name} arrives near you" v={{ name: title }} names={nm} /></h2>
            <AlertForm species={d.name} title={title} names={nm} />
          </section>
        )}

        {d.story.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="How the {name} moves through the year" v={{ name: title }} names={nm} /></h2>
            {d.story.map((s) => <p key={s} className="mt-2">{s}</p>)}
          </>
        )}

        {uk && ukA && (
          <section className="mt-6 rounded-lg border border-white/10 bg-white/5 p-3">
            <h2 className="font-semibold text-slate-100"><TR k="When does the {name} arrive in the UK?" v={{ name: title }} /></h2>
            <p className="mt-1">
              <TR k={uk.status === "summer" ? "It usually arrives in {when}{range}{leave}." : "It comes for the winter, usually arriving in {when}{range}{leave}."}
                v={{ when: ukA.typical, range: ukA.range ? `, between ${ukA.range} depending on the year` : "", leave: ukA.leave ? `. It is last seen regularly in ${ukA.leave}` : "" }} />{" "}
              <TR k="[All UK summer and winter visitors](/arrivals/uk)." />
            </p>
          </section>
        )}

        {india && (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-3">
            <TR k={india.status === "winter" ? "In India the {name} is a winter visitor{when}." : india.status === "summer" ? "In India the {name} is a summer visitor{when}." : "In India the {name} is mostly seen passing through{when}."}
              v={{ name: title, when: india.arrive && india.leave ? `, usually here from ${MONTH_NAMES[india.arrive - 1]} to ${MONTH_NAMES[india.leave - 1]}` : "" }} />{" "}
            <TR k="[See all migratory birds in India](/arrivals/india)." />
            {india && statesFor(d.name).length > 0 && (
              <span className="mt-2 block text-sm">
                <TR k="By state:" />{" "}
                {statesFor(d.name).slice(0, 10).map((s, i) => <span key={s.slug}>{i ? ", " : ""}<Link href={`/arrivals/india/${s.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{s.name}</Link></span>)}
              </span>
            )}
          </p>
        )}

        {cities.length > 0 && (
          <p className="mt-4 text-sm text-slate-400">
            <TR k="Among the birds recorded most around" />{" "}
            {cities.map((c, i) => <span key={c.slug}>{i ? ", " : ""}<Link href={`/places/${c.slug}`} className="text-cyan-400 hover:underline">{c.name}</Link></span>)}.
          </p>
        )}

        {d.arrivals.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="When does the {name} arrive?" v={{ name: title }} names={nm} /></h2>
            <p className="mt-2"><T k="The week it was first heard regularly in each region, after at least six weeks away. Dates differ from south to north, so a region has a range." />{" "}<T k="Some birds that stay all year show an arrival date when they become easier to hear again, for example when they start singing in spring." /></p>
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

        <section id="download" className="mt-8 rounded-lg border border-white/10 bg-white/5 p-4">
          <h2 className="text-lg font-semibold text-slate-100"><T k="Download the data" /></h2>
          <ul className="mt-2 space-y-1 text-sm">
            <li><DownloadLink href={openRecordsHref({ species: d.name })} k="Weekly records, last 12 months (CSV)" what="species-records" />{" "}
              <span className="text-slate-400"><T k="Records you may reuse freely, with credit, for areas about 550 km across." /></span></li>
            {d.arrivals.length > 0 && <li><DownloadLink href={`/api/v1/arrivals?species=${encodeURIComponent(d.name)}&format=csv`} k="Arrival dates per area (CSV)" what="species-arrivals" /></li>}
            <li><Link href="/data" className="text-cyan-400 hover:underline"><T k="Every species: open data releases and the API" /></Link></li>
          </ul>
        </section>

        {d.contributed.length > 0 && (
          <p className="mt-8 text-sm text-slate-400">
            <T k="Includes records from contributed datasets:" />{" "}
            {d.contributed.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={`/datasets/${c.id}`} className="text-cyan-400 hover:underline">{c.title}</Link>{c.institution ? ` (${c.institution})` : ""}</span>)}
          </p>
        )}
        <p className="mt-8 text-sm text-slate-400">
          <T k="Figures allow for how many recorders are listening, and come from automatic sound identification, which makes mistakes." />{" "}
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
          {r.vernacular_name && <span className="text-slate-400 italic"> {r.scientific_name}</span>}
        </li>
      ))}
    </ul>
  );
}

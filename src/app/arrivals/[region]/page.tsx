import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { sql } from "@/lib/db";
import { REGION } from "@/lib/methods";
import { REGIONS, regionBySlug } from "@/lib/regions";
import { SITE, speciesSlug } from "@/lib/site";

export const revalidate = 86400;
export const dynamicParams = false;
export const generateStaticParams = () => REGIONS.map((r) => ({ region: r.slug }));

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CLASS_LABEL: Record<string, string> = { avian: "birds", bat: "bats", amphibian: "frogs and toads", insect: "insects", mammal: "mammals", marine: "marine mammals", other: "other animals" };

type Row = { scientific_name: string; vernacular_name: string | null; grp: string; month: number; arrival: string; areas: number };

/** One row per species: its median arrival week across the region's areas, so a species is listed once. */
const load = cache(async (name: string) => sql<Row[]>`
  SELECT p.scientific_name, MIN(p.vernacular_name) AS vernacular_name, COALESCE(MIN(g.grp), 'other') AS grp,
         EXTRACT(MONTH FROM percentile_disc(0.5) WITHIN GROUP (ORDER BY p.arrival_week))::int AS month,
         (percentile_disc(0.5) WITHIN GROUP (ORDER BY p.arrival_week))::text AS arrival, COUNT(*)::int AS areas
  FROM phenology p LEFT JOIN species_group g USING (scientific_name)
  WHERE ${REGION} = ${name}
  GROUP BY 1 ORDER BY areas DESC, 1`);

export async function generateMetadata({ params }: { params: Promise<{ region: string }> }): Promise<Metadata> {
  const r = regionBySlug((await params).region);
  if (!r) return {};
  const rows = await load(r.name);
  const title = `When do birds arrive in ${r.name}? Arrival dates by month`;
  const description = `Arrival dates for ${rows.length.toLocaleString("en-GB")} birds, bats and other species in ${r.name}, month by month, with what is arriving now. From acoustic sensors and open biodiversity records, effort corrected.`;
  return { title, description, alternates: { canonical: `/arrivals/${r.slug}` }, openGraph: { title, description, url: `/arrivals/${r.slug}`, type: "article" } };
}

export default async function RegionArrivals({ params }: { params: Promise<{ region: string }> }) {
  const r = regionBySlug((await params).region);
  if (!r) notFound();
  const rows = await load(r.name);
  // Arrival weeks are from the past year: "now" is the same month a year on, plus the next one.
  const m = new Date().getUTCMonth() + 1;
  const now = rows.filter((x) => x.month === m || x.month === (m % 12) + 1).slice(0, 24);
  const byMonth = MONTHS.map((label, i) => ({ label, items: rows.filter((x) => x.month === i + 1) })).filter((x) => x.items.length);
  const classes = Object.entries(rows.reduce<Record<string, number>>((a, x) => ({ ...a, [x.grp]: (a[x.grp] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).map(([g, n]) => `${n.toLocaleString("en-GB")} ${CLASS_LABEL[g] ?? g}`);
  const url = `${SITE}/arrivals/${r.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: `Arrivals in ${r.name}`, isPartOf: { "@id": `${SITE}/#website` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: "Arrivals", item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: r.name, item: url },
      ] },
    ],
  };
  const SpeciesLink = ({ x }: { x: Row }) => (
    <>
      <Link href={`/species/${speciesSlug(x.scientific_name)}`} className="text-cyan-400 hover:underline" prefetch={false}>{x.vernacular_name ?? x.scientific_name}</Link>
      {x.vernacular_name && <span className="text-slate-500 italic"> {x.scientific_name}</span>}
    </>
  );
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500">
          <Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/arrivals" className="text-cyan-400 hover:underline">Arrivals</Link> / {r.name}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">When do birds arrive in {r.name}?</h1>
        <p className="mt-3">
          {rows.length.toLocaleString("en-GB")} species have a seasonal record in {r.name} ({classes.join(", ")}).
          Each is listed under the month it typically arrived over the past year: the middle of its first-arrival weeks across the areas where it was recorded
          (each area is a 5 degree square). Southern areas usually see a species earlier than northern ones, so open a species to see the range.
        </p>

        {now.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100">Arriving around now</h2>
            <p className="mt-2 text-sm text-slate-400">Species that arrived in {MONTHS[m - 1]} or {MONTHS[m % 12]} last year, most widespread first.</p>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {now.map((x) => <li key={x.scientific_name}><SpeciesLink x={x} /></li>)}
            </ul>
            <p className="mt-3">
              <Link href="/" className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">See them on the live map</Link>
            </p>
          </>
        )}

        {byMonth.map(({ label, items }) => (
          <section key={label}>
            <h2 className="mt-8 text-xl font-semibold text-slate-100">Arriving in {label} <span className="text-sm font-normal text-slate-500">{items.length}</span></h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {items.map((x) => <li key={x.scientific_name}><SpeciesLink x={x} /></li>)}
            </ul>
          </section>
        ))}

        <p className="mt-8 text-sm text-slate-500">
          Other regions:{" "}
          {REGIONS.filter((o) => o.slug !== r.slug).map((o, i) => (
            <span key={o.slug}>{i > 0 && " · "}<Link href={`/arrivals/${o.slug}`} className="text-cyan-400 hover:underline">{o.name}</Link></span>
          ))}
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Arrival dates come from automatic sound identification and open records, corrected for how much each area is watched.{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline">How this is measured</Link>.
        </p>
      </div>
    </main>
  );
}

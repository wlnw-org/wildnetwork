import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TR } from "@/components/TR";
import { cache } from "react";
import { sql } from "@/lib/db";
import { REGION } from "@/lib/methods";
import { yearRound } from "@/lib/yearRound";
import { REGIONS, regionBySlug } from "@/lib/regions";
import { SITE, speciesSlug } from "@/lib/site";
import { countryBySlug } from "@/lib/countries";
import CountryArrivals, { countryMetadata } from "@/components/CountryArrivals";

export const revalidate = 86400;
// Countries (src/lib/countries.ts) share this route: /arrivals/spain. Made on first visit, then cached.
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
  const slug = (await params).region;
  const r = regionBySlug(slug);
  if (!r) {
    const c = countryBySlug(slug);
    return c ? countryMetadata("en", c) : {};
  }
  const rows = await load(r.name);
  const title = `When do birds arrive in ${r.name}? Arrival dates by month`;
  const description = `Arrival dates for ${rows.length.toLocaleString("en-GB")} birds, bats and other species in ${r.name}, month by month, with what is arriving now. From acoustic sensors and open biodiversity records, effort corrected.`;
  return { title, description, alternates: { canonical: `/arrivals/${r.slug}` }, openGraph: { title, description, url: `/arrivals/${r.slug}`, type: "article" } };
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

export default async function RegionArrivals({ params }: { params: Promise<{ region: string; group?: string }> }) {
  const { region, group: wanted } = await params;
  const r = regionBySlug(region);
  if (!r) {
    const c = countryBySlug(region);
    if (!c || wanted !== undefined) notFound();
    return <CountryArrivals c={c} />;
  }
  const all = await load(r.name);
  const present = [...new Set(all.map((x) => x.grp))].sort((a, b) => (a === "avian" ? -1 : b === "avian" ? 1 : all.filter((x) => x.grp === b).length - all.filter((x) => x.grp === a).length));
  if (wanted !== undefined && (wanted === "avian" || !present.includes(wanted))) notFound();
  const grp = wanted ?? (present.includes("avian") ? "avian" : present[0]);
  const rows = all.filter((x) => x.grp === grp);
  const what = CLASS_LABEL[grp] ?? grp;
  // Arrival weeks are from the past year: "now" is the same month a year on, plus the next one.
  const m = new Date().getUTCMonth() + 1;
  const soon = rows.filter((x) => x.month === m || x.month === (m % 12) + 1);
  const resident = await yearRound(r.name, soon.slice(0, 120).map((x) => x.scientific_name), grp).catch(() => new Set<string>());
  const now = soon.filter((x) => !resident.has(x.scientific_name)).slice(0, 24);
  const byMonth = MONTHS.map((label, i) => ({ label, items: rows.filter((x) => x.month === i + 1) })).filter((x) => x.items.length);
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
      {x.vernacular_name && <span className="text-slate-400 italic"> {x.scientific_name}</span>}
    </>
  );
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><TR k="Arrivals" /></Link> / {r.name}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="When do {what} arrive in {region}?" v={{ what, region: r.name }} /></h1>
        {present.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Animal class">
            {present.map((g) => (
              <Link key={g} href={`/arrivals/${r.slug}${g === "avian" ? "" : `/${g}`}`} prefetch={false}
                className={`rounded px-2.5 py-1 ${g === grp ? "bg-white/90 text-slate-900 font-medium" : "bg-white/5 hover:bg-white/10"}`}>
                {cap(CLASS_LABEL[g] ?? g)} <span className="opacity-70">{all.filter((x) => x.grp === g).length.toLocaleString("en-GB")}</span>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-3">
          <TR k="{n} species of {what} have a seasonal record in {region}." v={{ n: rows.length.toLocaleString("en-GB"), what, region: r.name }} />{" "}
          <TR k="Each is listed under the month it typically arrived over the past year: the middle of its first-arrival weeks across the areas where it was recorded (each area about 550 km across). Southern areas usually see a species earlier than northern ones, so open a species to see the range." />
          {grp === "avian" && <>{" "}<TR k="Some birds that stay all year appear here when they become easier to hear again, for example when they start singing in spring." /></>}
        </p>

        {r.slug === "europe" && (
          <p className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-sm">
            <TR k="In the UK? See [when birds arrive in the UK](/arrivals/uk): swallows, cuckoos, swifts and every other summer and winter visitor." />
          </p>
        )}
        {r.slug === "asia" && (
          <p className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-sm">
            <TR k="In India? See [migratory birds in India](/arrivals/india): the winter visitors, the months each one is here, and what is arriving now." />
          </p>
        )}

        {now.length > 0 && (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Arriving around now" /></h2>
            <p className="mt-2 text-sm text-slate-400"><TR k="Species that arrived in {month} or {next} last year, most widespread first." v={{ month: MONTHS[m - 1], next: MONTHS[m % 12] }} />{resident.size > 0 && <>{" "}<TR k="Species recorded all year round are left out ({n})." v={{ n: resident.size }} /></>}</p>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {now.map((x) => <li key={x.scientific_name}><SpeciesLink x={x} /></li>)}
            </ul>
            <p className="mt-3">
              <Link href="/" className="inline-block rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400"><TR k="See them on the live map" /></Link>
            </p>
            <p className="mt-3 text-sm text-slate-400">
              <TR k="Want to know the week one reaches you? Open a species and use" /> <b className="text-amber-200"><TR k="Get an email when it arrives near you" /></b><TR k=": one email when it turns up in your area after weeks away." />
            </p>
          </>
        )}

        {byMonth.map(({ label, items }) => (
          <section key={label}>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Arriving in {month}" v={{ month: label }} /> <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {items.map((x) => <li key={x.scientific_name}><SpeciesLink x={x} /></li>)}
            </ul>
          </section>
        ))}

        <p className="mt-8 text-sm text-slate-400">
          <TR k="Other regions:" />{" "}
          {REGIONS.filter((o) => o.slug !== r.slug).map((o, i) => (
            <span key={o.slug}>{i > 0 && " · "}<Link href={`/arrivals/${o.slug}`} className="text-cyan-400 hover:underline">{o.name}</Link></span>
          ))}
        </p>
        <p className="mt-2 text-sm text-slate-400">
          <TR k="Arrival dates come from automatic sound identification and open records, corrected for how much each area is watched. [How this is measured](/methods)." />
        </p>
      </div>
    </main>
  );
}

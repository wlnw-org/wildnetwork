import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TR } from "@/components/TR";
import LostCard from "@/components/LostCard";
import { SITE } from "@/lib/site";
import { countryCounts, countrySlug, GROUPS, lostSpeciesPublic, MIN_COUNTRY_PAGE, type LostPublic } from "@/lib/lostPublic";

// /lost-species/in/<country>: the lost species last known from one country, as a page search engines can index (the
// filter on /lost-species is a query string). List facts only, from the CC0 list (src/lib/lostPublic.ts); records we
// receive of these species are never shown. ISR: made on first visit, refreshed daily.
export const revalidate = 86400;
export function generateStaticParams() { return []; }

async function load(slug: string) {
  const all = await lostSpeciesPublic().catch(() => [] as LostPublic[]);
  const counts = countryCounts(all);
  const hit = counts.find(([c, n]) => countrySlug(c) === slug && n >= MIN_COUNTRY_PAGE);
  if (!hit) return null;
  const country = hit[0];
  return { country, species: all.filter((s) => s.countries.includes(country)), others: counts.filter(([c, n]) => c !== country && n >= MIN_COUNTRY_PAGE) };
}

const groupsOf = (list: LostPublic[]) => Object.keys(GROUPS).map((g) => ({ g, items: list.filter((s) => s.class_name === g) })).filter((x) => x.items.length);

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const d = await load((await params).country);
  if (!d) return {};
  const parts = groupsOf(d.species).map(({ g, items }) => `${items.length} ${(items.length === 1 ? GROUPS[g].replace(/s$/, "") : GROUPS[g]).toLowerCase()}`);
  const title = `Lost species of ${d.country}: animals not seen for 10 years or more`;
  const description = `${d.species.length} lost species were last known from ${d.country} (${parts.join(", ")}), not confirmed in the wild for 10 years or more. See which ones, and how a sighting or recording can help find them.`;
  const url = `/lost-species/in/${countrySlug(d.country)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, type: "article" } };
}

export default async function LostCountry({ params }: { params: Promise<{ country: string }> }) {
  const d = await load((await params).country);
  if (!d) notFound();
  const groups = groupsOf(d.species);
  const url = `${SITE}/lost-species/in/${countrySlug(d.country)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: `Lost species of ${d.country}`, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Country", name: d.country },
        mainEntity: { "@type": "ItemList", numberOfItems: d.species.length,
          itemListElement: d.species.slice(0, 100).map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.common_name ?? s.scientific_name })) } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: "Lost species", item: `${SITE}/lost-species` },
        { "@type": "ListItem", position: 3, name: d.country, item: url },
      ] },
    ],
  };
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/lost-species" className="text-cyan-400 hover:underline"><TR k="Lost species" /></Link> / {d.country}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Lost species of {country}" v={{ country: d.country }} /></h1>
        <p className="mt-3">
          <TR k="These {n} animals were last known from {country} and have not been confirmed in the wild for 10 years or more. Some may survive in places few people visit. A photo, a sound recording or a careful note from the right place can be the first sign in years." v={{ n: d.species.length, country: d.country }} />
        </p>
        <p className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href="/lost-species/report" className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><TR k="Report a possible sighting" /></Link>
          <Link href="/contribute" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><TR k="Set up a listening station" /></Link>
        </p>

        {groups.map(({ g, items }) => (
          <section key={g}>
            <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k={GROUPS[g]} /> <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">{items.map((s) => <LostCard key={s.scientific_name} s={s} />)}</ul>
          </section>
        ))}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Lost species by country" /></h2>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <Link href="/lost-species" className="text-cyan-400 hover:underline"><TR k="All countries" /></Link>
          {d.others.map(([c, n]) => <Link key={c} href={`/lost-species/in/${countrySlug(c)}`} prefetch={false} className="text-cyan-400 hover:underline">{c} <span className="text-slate-500">{n}</span></Link>)}
        </p>

        <p className="mt-10 text-xs text-slate-400">
          <TR k="The list comes from the [Search for Lost Species](https://www.rewild.org/lost-species), led by Re:wild, and the lost species list kept by Re:wild and the IUCN Species Survival Commission. We use the version published as open data (CC0) with Lindken et al. 2024," />{" "}
          <i>Global Change Biology</i>, <a href="https://doi.org/10.1111/gcb.17107" className="text-cyan-400 hover:underline">doi.org/10.1111/gcb.17107</a>.{" "}
          <TR k="It covers amphibians, birds, mammals and reptiles as listed in 2023, so some species may have been found since. Lost birds are also tracked by the [Search for Lost Birds](https://searchforlostbirds.org/birds)." />{" "}
          <TR k="Pictures come from Wikipedia and iNaturalist under their own licences; hover a picture for its credit. Wildlife Network is not part of Re:wild." />
        </p>
      </div>
    </main>
  );
}

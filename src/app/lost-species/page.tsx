import type { Metadata } from "next";
import Link from "next/link";
import HelpLink from "@/components/HelpLink";
import LostNearMe from "@/components/LostNearMe";
import { TR } from "@/components/TR";
import { countryCounts, countrySlug, GROUPS, lostSpeciesPublic, MIN_COUNTRY_PAGE, type LostPublic } from "@/lib/lostPublic";
import LostCard from "@/components/LostCard";

type Props = { searchParams: Promise<{ country?: string | string[]; group?: string | string[]; page?: string | string[] }> };
const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";
const PER_PAGE = 60;

export const metadata: Metadata = {
  title: "Lost species",
  description: "Animals not confirmed in the wild for 10 years or more, where they were last known, and how listening stations and recordings can help find them.",
  alternates: { canonical: "/lost-species" },
};

/** Public list of lost species with the "Help find lost species" section. List facts only: records we receive are never shown. */
const REALMS = new Set(["Afrotropic", "Antarctic", "Australasia", "Indomalaya", "Nearctic", "Neotropic", "Oceania", "Palearctic"]);

export default async function LostSpecies({ searchParams }: Props) {
  const sp = await searchParams;
  const all = await lostSpeciesPublic().catch(() => [] as LostPublic[]);
  const countries = countryCounts(all);
  const country = countries.some(([c]) => c === one(sp.country)) ? one(sp.country) : "";
  const group = GROUPS[one(sp.group)] ? one(sp.group) : "";
  const rows = all.filter((s) => (!country || s.countries.includes(country)) && (!group || s.class_name === group));
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(one(sp.page)) || 1));
  const shown = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const href = (p: number) => `/lost-species?${new URLSearchParams({ ...(country ? { country } : {}), ...(group ? { group } : {}), ...(p > 1 ? { page: String(p) } : {}) })}#list`;
  const top = countries.slice(0, 6).map(([c]) => c);

  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-4xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100"><TR k="Lost species" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/lost-species" /></p>
        <p className="mt-3 max-w-2xl">
          <TR k="A lost species is one that nobody has confirmed in the wild for 10 years or more. Some are probably gone. Many are still out there, in places few people visit, waiting to be noticed. This page lists {n} lost animals and where they were last known." v={{ n: all.length.toLocaleString("en-GB") }} />
        </p>

        <section id="help" className="mt-8 rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-5">
          <h2 className="text-xl font-semibold text-slate-100"><TR k="Help find lost species" /></h2>
          <p className="mt-2"><TR k="Many lost birds, frogs and bats call at night or deep in forest, where they are easier to hear than to see. In 2025 a night recording in India may have caught a Jerdon's Courser, a bird not confirmed since 2004. Experts are still checking it. Every recorder left out in the right place is another chance." /></p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-medium text-slate-100"><TR k="Lost species near you" /></h3>
              <LostNearMe countries={countries.map(([c]) => c)} />
            </div>
            <div>
              <h3 className="font-medium text-slate-100"><TR k="Listen where they were last seen" /></h3>
              <p className="mt-1 text-sm"><TR k="Put up a listening station, or run your own recordings through our free [Studio app](/studio). The countries with the most lost species are {list} and {last}. [How to take part](/contribute)" v={{ list: top.slice(0, -1).join(", "), last: top.at(-1) ?? "" }} /></p>
            </div>
            <div>
              <h3 className="font-medium text-slate-100"><TR k="Think you found one?" /></h3>
              <p className="mt-1 text-sm"><TR k="Send us your photo or recording. It goes to a private review, never straight onto the site. [Send a possible sighting](/lost-species/report)" /></p>
            </div>
            <div>
              <h3 className="font-medium text-slate-100"><TR k="Hear about rediscoveries" /></h3>
              <p className="mt-1 text-sm"><TR k="We only announce a possible rediscovery after an expert has checked it. [Get our update emails](/updates)" /></p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-slate-100"><TR k="How we keep them safe" /></h2>
          <p className="mt-2 max-w-2xl">
            <TR k="Wildlife Network checks every record it receives against this list. A record of a lost species is never shown on the map or in our data. It goes to a private review by experts first, because most such records turn out to be mistakes. We never publish the exact place of one, since collectors and poachers could use it." />
          </p>
        </section>

        <section id="list" className="mt-8">
          <h2 className="text-xl font-semibold text-slate-100"><TR k="The list" /></h2>
          <form method="get" action="/lost-species#list" className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1"><TR k="Country" />
              <select name="country" defaultValue={country} className="rounded-md border border-white/15 bg-slate-900 px-2 py-1.5 text-slate-200">
                <option value="">All countries</option>
                {[...countries].filter(([c]) => !REALMS.has(c)).sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
                {[...countries].some(([c]) => REALMS.has(c)) && (
                  <optgroup label="Wider regions (country unknown)">
                    {[...countries].filter(([c]) => REALMS.has(c)).sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <label className="flex flex-col gap-1"><TR k="Animal group" />
              <select name="group" defaultValue={group} className="rounded-md border border-white/15 bg-slate-900 px-2 py-1.5 text-slate-200">
                <option value="">All groups</option>
                {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <button className="rounded-md border border-white/20 px-3 py-1.5 hover:border-white/50"><TR k="Show" /></button>
            {(country || group) && <Link href="/lost-species#list" className="py-1.5 text-cyan-400 hover:underline"><TR k="Clear" /></Link>}
          </form>
          <p className="mt-3 text-sm text-slate-400">
            {country
              ? <TR k="{n} species last known from {country}" v={{ n: rows.length.toLocaleString("en-GB"), country }} />
              : <TR k="{n} species" v={{ n: rows.length.toLocaleString("en-GB") }} />}
            {group ? `, ${GROUPS[group].toLowerCase()}` : ""}.{pages > 1 && <>{" "}<TR k="Page {page} of {pages}." v={{ page, pages }} /></>}
          </p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">{shown.map((s) => <LostCard key={s.scientific_name} s={s} />)}</ul>
          {pages > 1 && (
            <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Pages">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link key={p} href={href(p)} aria-current={p === page ? "page" : undefined}
                  className={`rounded-md border px-2.5 py-1 ${p === page ? "border-cyan-400 text-slate-100" : "border-white/15 hover:border-white/40"}`}>{p}</Link>
              ))}
            </nav>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-100"><TR k="Lost species by country" /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {countries.filter(([, n]) => n >= MIN_COUNTRY_PAGE).map(([c, n]) => (
              <Link key={c} href={`/lost-species/in/${countrySlug(c)}`} prefetch={false} className="text-cyan-400 hover:underline">{c} <span className="text-slate-500">{n}</span></Link>
            ))}
          </p>
        </section>

        <section className="mt-10 border-t border-white/10 pt-5 text-sm text-slate-400">
          <h2 className="text-base font-semibold text-slate-200"><TR k="Where this list comes from" /></h2>
          <p className="mt-2">
            <TR k="The list comes from the [Search for Lost Species](https://www.rewild.org/lost-species), led by Re:wild, and the lost species list kept by Re:wild and the IUCN Species Survival Commission. We use the version published as open data (CC0) with Lindken et al. 2024," />{" "}
            <i>Global Change Biology</i>, <a href="https://doi.org/10.1111/gcb.17107" className="text-cyan-400 hover:underline">doi.org/10.1111/gcb.17107</a>.{" "}
            <TR k="It covers amphibians, birds, mammals and reptiles as listed in 2023, so some species may have been found since. Lost birds are also tracked by the [Search for Lost Birds](https://searchforlostbirds.org/birds)." />
          </p>
          <p className="mt-2"><TR k="Pictures come from Wikipedia and iNaturalist under their own licences; hover a picture for its credit. Wildlife Network is not part of Re:wild." /></p>
        </section>
      </div>
    </main>
  );
}

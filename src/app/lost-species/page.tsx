import type { Metadata } from "next";
import Link from "next/link";
import HelpLink from "@/components/HelpLink";
import LostNearMe from "@/components/LostNearMe";
import { countryCounts, GROUPS, lostSpeciesPublic, RED_LIST, type LostPublic } from "@/lib/lostPublic";

type Props = { searchParams: Promise<{ country?: string | string[]; group?: string | string[]; page?: string | string[] }> };
const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";
const PER_PAGE = 60;

export const metadata: Metadata = {
  title: "Lost species",
  description: "Animals not confirmed in the wild for 10 years or more, where they were last known, and how listening stations and recordings can help find them.",
  alternates: { canonical: "/lost-species" },
};

const REWILD = "https://www.rewild.org/lost-species";
const LOST_BIRDS = "https://searchforlostbirds.org/birds";

function Card({ s }: { s: LostPublic }) {
  return (
    <li className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
      {s.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.thumb_url} alt={s.common_name ?? s.scientific_name} title={s.image_credit ?? undefined} loading="lazy" className="h-20 w-20 shrink-0 rounded-md object-cover" />
      ) : <div className="h-20 w-20 shrink-0 rounded-md bg-slate-800" aria-hidden />}
      <div className="min-w-0 text-sm">
        <p className="text-base text-slate-100">{s.common_name ?? <i>{s.scientific_name}</i>}</p>
        {s.common_name && <p className="italic text-slate-400">{s.scientific_name}</p>}
        <p className="mt-1 text-slate-300">{[s.class_name && GROUPS[s.class_name]?.replace(/s$/, ""), s.red_list && RED_LIST[s.red_list]].filter(Boolean).join(". ")}</p>
        {s.countries.length > 0 && <p className="text-slate-400">Last known from {s.countries.join(", ")}{s.region ? `, ${s.region}` : ""}</p>}
        <p className="mt-1"><a href={s.class_name === "Aves" ? LOST_BIRDS : REWILD} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{s.class_name === "Aves" ? "Search for Lost Birds" : "Search for Lost Species"}</a></p>
      </div>
    </li>
  );
}

/** Public list of lost species with the "Help find lost species" section. List facts only: records we receive are never shown. */
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
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Lost species</h1>
        <p className="mt-2"><HelpLink to="/help/site/lost-species" /></p>
        <p className="mt-3 max-w-2xl">
          A lost species is one that nobody has confirmed in the wild for 10 years or more. Some are probably gone. Many are still out there,
          in places few people visit, waiting to be noticed. This page lists {all.length.toLocaleString("en-GB")} lost animals and where they were last known.
        </p>

        <section id="help" className="mt-8 rounded-lg border border-emerald-400/30 bg-emerald-500/5 p-5">
          <h2 className="text-xl font-semibold text-slate-100">Help find lost species</h2>
          <p className="mt-2">Many lost birds, frogs and bats call at night or deep in forest, where they are easier to hear than to see. In 2025 a night recording in India may have caught a Jerdon&apos;s Courser, a bird not confirmed since 2004. Experts are still checking it. Every recorder left out in the right place is another chance.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="font-medium text-slate-100">Lost species near you</h3>
              <LostNearMe countries={countries.map(([c]) => c)} />
            </div>
            <div>
              <h3 className="font-medium text-slate-100">Listen where they were last seen</h3>
              <p className="mt-1 text-sm">Put up a listening station, or run your own recordings through our free <Link href="/studio" className="text-cyan-400 hover:underline">Studio app</Link>. The countries with the most lost species are {top.slice(0, -1).join(", ")} and {top.at(-1)}. <Link href="/contribute" className="text-cyan-400 hover:underline">How to take part</Link></p>
            </div>
            <div>
              <h3 className="font-medium text-slate-100">Think you found one?</h3>
              <p className="mt-1 text-sm">Send us your photo or recording. It goes to a private review, never straight onto the site. <Link href="/lost-species/report" className="text-cyan-400 hover:underline">Send a possible sighting</Link></p>
            </div>
            <div>
              <h3 className="font-medium text-slate-100">Hear about rediscoveries</h3>
              <p className="mt-1 text-sm">We only announce a possible rediscovery after an expert has checked it and Re:wild has been told. <Link href="/updates" className="text-cyan-400 hover:underline">Get our update emails</Link></p>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold text-slate-100">How we keep them safe</h2>
          <p className="mt-2 max-w-2xl">
            Wildlife Network checks every record it receives against this list. A record of a lost species is never shown on the map or in our data.
            It goes to a private review by experts first, because most such records turn out to be mistakes. We never publish the exact place of one,
            since collectors and poachers could use it.
          </p>
        </section>

        <section id="list" className="mt-8">
          <h2 className="text-xl font-semibold text-slate-100">The list</h2>
          <form method="get" action="/lost-species#list" className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">Country
              <select name="country" defaultValue={country} className="rounded-md border border-white/15 bg-slate-900 px-2 py-1.5 text-slate-200">
                <option value="">All countries</option>
                {[...countries].sort((a, b) => a[0].localeCompare(b[0])).map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Animal group
              <select name="group" defaultValue={group} className="rounded-md border border-white/15 bg-slate-900 px-2 py-1.5 text-slate-200">
                <option value="">All groups</option>
                {Object.entries(GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <button className="rounded-md border border-white/20 px-3 py-1.5 hover:border-white/50">Show</button>
            {(country || group) && <Link href="/lost-species#list" className="py-1.5 text-cyan-400 hover:underline">Clear</Link>}
          </form>
          <p className="mt-3 text-sm text-slate-400">{rows.length.toLocaleString("en-GB")} species{country ? ` last known from ${country}` : ""}{group ? `, ${GROUPS[group].toLowerCase()}` : ""}.{pages > 1 ? ` Page ${page} of ${pages}.` : ""}</p>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">{shown.map((s) => <Card key={s.scientific_name} s={s} />)}</ul>
          {pages > 1 && (
            <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="Pages">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link key={p} href={href(p)} aria-current={p === page ? "page" : undefined}
                  className={`rounded-md border px-2.5 py-1 ${p === page ? "border-cyan-400 text-slate-100" : "border-white/15 hover:border-white/40"}`}>{p}</Link>
              ))}
            </nav>
          )}
        </section>

        <section className="mt-10 border-t border-white/10 pt-5 text-sm text-slate-400">
          <h2 className="text-base font-semibold text-slate-200">Where this list comes from</h2>
          <p className="mt-2">
            The list comes from the <a href={REWILD} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Search for Lost Species</a>, led by Re:wild,
            and the lost species list kept by Re:wild and the IUCN Species Survival Commission. We use the version published as open data (CC0) with
            Lindken et al. 2024, <i>Global Change Biology</i>, <a href="https://doi.org/10.1111/gcb.17107" className="text-cyan-400 hover:underline">doi.org/10.1111/gcb.17107</a>.
            It covers amphibians, birds, mammals and reptiles as listed in 2023, so some species may have been found since. Lost birds are also tracked by the
            {" "}<a href={LOST_BIRDS} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">Search for Lost Birds</a>.
          </p>
          <p className="mt-2">Pictures come from Wikipedia and iNaturalist under their own licences; hover a picture for its credit. Wildlife Network is not part of Re:wild.</p>
        </section>
      </div>
    </main>
  );
}

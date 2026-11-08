import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Link from "next/link";
import PausedNotice from "@/components/PausedNotice";
import { BIRDWEATHER_PAUSED } from "@/lib/sources";
import { sql } from "@/lib/db";
import { speciesSlug } from "@/lib/site";
import { unstable_cache } from "next/cache";

type Props = { searchParams: Promise<{ letter?: string | string[]; q?: string | string[] }> };
const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v) ?? "";
const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
/** Index letter of a species by the name shown (English name, else scientific name); digits and other scripts go under #. */
const letterOf = (name: string) => { const c = name.normalize("NFKD").charAt(0).toUpperCase(); return c >= "A" && c <= "Z" ? c : "#"; };
const pickLetter = (v: string) => (LETTERS.includes(v.toUpperCase()) ? v.toUpperCase() : "A");

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const letter = pickLetter(one(sp.letter));
  const q = one(sp.q).trim();
  return {
    title: letter === "A" ? "Species: migration and arrival dates" : `Species starting with ${letter === "#" ? "other characters" : letter}: migration and arrival dates`,
    description: "Every bird, bat and other animal with a seasonal record on Wildlife Network: where it is now, when it arrives and how it moves through the year.",
    alternates: { canonical: letter === "A" ? "/species" : `/species?letter=${encodeURIComponent(letter)}` },
    ...(q ? { robots: { index: false, follow: true } } : {}),
  };
}

const CLASS_TITLE: Record<string, string> = { avian: "Birds", bat: "Bats", amphibian: "Frogs and toads", insect: "Insects", mammal: "Mammals", marine: "Marine mammals", other: "Other" };

// The list changes once a day (phenology recompute); one query an hour serves every letter and search.
const allSpecies = unstable_cache(async () => [...await sql<{ scientific_name: string; vernacular_name: string | null; grp: string }[]>`
    SELECT p.scientific_name, MIN(p.vernacular_name) AS vernacular_name, COALESCE(MIN(g.grp), 'other') AS grp
    FROM phenology p LEFT JOIN species_group g USING (scientific_name)
    GROUP BY 1 ORDER BY 2 NULLS LAST, 1`], ["species-index"], { revalidate: 3600 });

/**
 * All species in one page was 1.7 MB of HTML, so the index is split by first letter (?letter=, default A) with a name
 * search (?q=) across every species. Every species page is still in the sitemap, and each letter page links its species.
 */
export default async function SpeciesIndex({ searchParams }: Props) {
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const letter = pickLetter(one(sp.letter));
  const all = await allSpecies();
  const counts = new Map<string, number>();
  for (const r of all) { const l = letterOf(r.vernacular_name ?? r.scientific_name); counts.set(l, (counts.get(l) ?? 0) + 1); }
  const needle = q.toLowerCase();
  const rows = q
    ? all.filter((r) => r.scientific_name.toLowerCase().includes(needle) || (r.vernacular_name ?? "").toLowerCase().includes(needle)).slice(0, 300)
    : all.filter((r) => letterOf(r.vernacular_name ?? r.scientific_name) === letter);
  const groups = Object.keys(CLASS_TITLE).map((g) => ({ g, items: rows.filter((r) => r.grp === g) })).filter((x) => x.items.length);
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Species</h1>
        <p className="mt-2"><HelpLink to="/help/site/species" /></p>
        {BIRDWEATHER_PAUSED && <PausedNotice className="mt-4" />}
        <p className="mt-3">
          {all.length.toLocaleString("en-GB")} species have a full seasonal record so far. Each page shows where the species is being detected now, when it arrives in each region, and how its range moves with the weather.
          Or browse <Link href="/arrivals" className="text-cyan-400 hover:underline">arrival dates by region</Link>, month by month.
        </p>
        <form method="get" action="/species" role="search" className="mt-5 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search by English or scientific name" aria-label="Search species"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-slate-100 placeholder:text-slate-500" />
          <button className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Search</button>
        </form>
        <nav aria-label="Species by first letter" className="mt-4 flex flex-wrap gap-1 text-sm">
          {LETTERS.map((l) => {
            const n = counts.get(l) ?? 0;
            const current = !q && l === letter;
            if (!n) return <span key={l} className="w-8 rounded py-1 text-center text-slate-600" aria-hidden>{l}</span>;
            return (
              <Link key={l} href={l === "A" ? "/species" : `/species?letter=${encodeURIComponent(l)}`} aria-current={current ? "page" : undefined} title={`${n} species`}
                className={`w-8 rounded py-1 text-center ${current ? "bg-cyan-500 font-semibold text-slate-950" : "text-cyan-400 hover:bg-white/10"}`}>{l}</Link>
            );
          })}
        </nav>
        <p className="mt-4 text-sm text-slate-400">
          {q
            ? <>{rows.length >= 300 ? "First 300 matches" : `${rows.length} ${rows.length === 1 ? "match" : "matches"}`} for &quot;{q}&quot;. <Link href="/species" className="text-cyan-400 hover:underline">Clear search</Link></>
            : <>{rows.length} species starting with {letter === "#" ? "other characters" : letter}.</>}
        </p>
        {groups.map(({ g, items }) => (
          <section key={g}>
            <h2 className="mt-8 text-xl font-semibold text-slate-100">{CLASS_TITLE[g]} <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {items.map((r) => (
                <li key={r.scientific_name}>
                  <Link href={`/species/${speciesSlug(r.scientific_name)}`} className="text-cyan-400 hover:underline" prefetch={false}>{r.vernacular_name ?? r.scientific_name}</Link>
                  {r.vernacular_name && <span className="text-slate-400 italic"> {r.scientific_name}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

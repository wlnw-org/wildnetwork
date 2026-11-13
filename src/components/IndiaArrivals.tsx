import type { Metadata } from "next";
import Link from "next/link";
import { X } from "@/components/ServerTr";
import { LocalName } from "@/components/T";
import { sql } from "@/lib/db";
import { getNames } from "@/lib/names";
import { SITE, speciesSlug } from "@/lib/site";
import { INDIA_STATES } from "@/lib/indiaStates";
import { fmtCount, languageAlternates, months, stateName, tr, type PageLang } from "@/lib/pageLang";
import { tx } from "@/lib/body";
import SEASONS from "@/data/india-seasons.json";
import PLACES from "@/data/places.json";

// /arrivals/india and its language versions /hi/arrivals/india, /ta/arrivals/india. Built from src/data/india-seasons.json
// (scripts/india-seasons.mts): ten years of openly licensed bird records in India, compared area by area and month by month.

type Sp = (typeof SEASONS.species)[number];
const species = SEASONS.species as Sp[];
const winter = species.filter((s) => s.status === "winter");
const summer = species.filter((s) => s.status === "summer");
const passage = species.filter((s) => s.status === "passage");
const records = SEASONS.monthRecords.reduce((a, b) => a + b, 0);
const [FROM, TO] = SEASONS.years;
const mode = (xs: (number | null)[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const arriveMost = mode(winter.map((s) => s.arrive)) ?? 10;

const TITLE = tx("Migratory birds in India: when they arrive and leave");
const K = {
  desc: tx("{n} bird species come to India for the winter, most arriving in {month}. See which ones, the months each is here, and what is arriving now. From {records} bird records."),
  q1: tx("Which birds come to India in winter?"),
  a1: tx("About {n} species, going by ten years of records. Among the most recorded are {list}. Ducks, waders, wagtails, warblers, pipits, buntings and many birds of prey also come for the winter."),
  q2: tx("When do migratory birds come to India?"),
  a2: tx("Most winter visitors arrive between September and November, most of all in {month}, and most leave again in March or April. Summer visitors such as the Indian Cuckoo come in April and May, ahead of the monsoon."),
  q3: tx("Where do they come from?"),
  a3: tx("Most winter visitors breed further north, in Central Asia, Siberia, Europe, the Himalaya and Tibet, and come to India's milder winters, wetlands and fields to feed."),
  q4: tx("How is this worked out?"),
  a4: tx("From {records} records of birds in India from {from} to {to}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the same area and month, so a species does not look common just because more people go birding then. A species is listed only when two areas or more show the same pattern."),
};
const path = (lang: PageLang, p: string) => (lang === "en" ? p : `/${lang}${p}`);
/** "a, b and c" in English; a comma list in the other languages. */
export const joinNames = (lang: PageLang, xs: string[]) => (lang === "en" && xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs.join(", "));

async function localNames(lang: PageLang, list: Sp[]) {
  if (lang === "en") return list.map((s) => s.en ?? s.sci);
  const n = await getNames(list.map((s) => s.sci)).catch(() => ({} as Record<string, Record<string, string>>));
  return list.map((s) => n[s.sci]?.[lang] ?? s.en ?? s.sci);
}

async function faq(lang: PageLang): Promise<[string, string][]> {
  const top = await localNames(lang, winter.slice(0, 10));
  const M = months(lang);
  return [
    [tr(lang, K.q1), tr(lang, K.a1, { n: winter.length, list: joinNames(lang, top) })],
    [tr(lang, K.q2), tr(lang, K.a2, { month: M[arriveMost - 1] })],
    [tr(lang, K.q3), tr(lang, K.a3)],
    [tr(lang, K.q4), tr(lang, K.a4, { records: fmtCount(lang, records), from: FROM, to: TO })],
  ];
}

export function indiaMetadata(lang: PageLang): Metadata {
  const title = tr(lang, TITLE);
  const description = tr(lang, K.desc, { n: winter.length, month: months(lang)[arriveMost - 1], records: fmtCount(lang, records) });
  const url = path(lang, "/arrivals/india");
  return {
    title, description,
    alternates: { canonical: url, languages: languageAlternates("/arrivals/india") },
    openGraph: { title, description, url, type: "article", images: ["/opengraph-image"], ...(lang === "en" ? {} : { locale: lang === "hi" ? "hi_IN" : "ta_IN" }) },
  };
}

function Months({ p, short }: { p: number[]; short: string[] }) {
  return (
    <span className="inline-flex gap-px align-middle" aria-hidden>
      {p.map((v, i) => <span key={i} title={short[i]} className="h-3 w-2 rounded-[1px]" style={{ background: `rgba(34, 211, 238, ${Math.max(0.08, v)})` }} />)}
    </span>
  );
}

function When({ s, short, lang }: { s: Sp; short: string[]; lang: PageLang }) {
  if (s.arrive && s.leave) return <X lang={lang} k="{arrive} to {leave}" v={{ arrive: short[s.arrive - 1], leave: short[s.leave - 1] }} />;
  if (s.arrive) return <X lang={lang} k="arrives in {month}" v={{ month: short[s.arrive - 1] }} />;
  if (s.leave) return <X lang={lang} k="leaves in {month}" v={{ month: short[s.leave - 1] }} />;
  return null;
}

function List({ items, thumbs, pages, names, short, lang }: { items: Sp[]; thumbs: Map<string, string>; pages: Set<string>; names: Record<string, Record<string, string>>; short: string[]; lang: PageLang }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((s) => {
        const label = <LocalName en={s.en ?? s.sci} names={names[s.sci]} />;
        return (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            {thumbs.get(s.sci)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumbs.get(s.sci)} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span className="h-10 w-10 shrink-0 rounded bg-white/5" />}
            <span className="min-w-0">
              {pages.has(s.sci)
                ? <Link href={`/species/${speciesSlug(s.sci)}`} prefetch={false} className="text-cyan-400 hover:underline">{label}</Link>
                : <span className="text-slate-100">{label}</span>}
              {s.en && <span className="text-slate-400 italic"> {s.sci}</span>}
              <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><Months p={s.presence} short={short} /> <When s={s} short={short} lang={lang} /></span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function IndiaArrivals({ lang }: { lang: PageLang }) {
  const M = months(lang), S = months(lang, "short");
  const m = new Date().getUTCMonth() + 1, next = (m % 12) + 1;
  const now = species.filter((s) => s.arrive === m || s.arrive === next).slice(0, 12);
  const leaving = species.filter((s) => s.leave === m || s.leave === next).slice(0, 8);
  const all = species.map((s) => s.sci);
  const thumbRows = await sql<{ scientific_name: string; thumb_url: string | null }[]>`
    SELECT scientific_name, thumb_url FROM species_media WHERE scientific_name IN ${sql(all)} AND thumb_url IS NOT NULL`.catch(() => []);
  const thumbs = new Map(thumbRows.map((r) => [r.scientific_name, r.thumb_url as string]));
  // Only species with a page are linked (a page exists for every species in species_group).
  const pages = new Set((await sql<{ scientific_name: string }[]>`
    SELECT scientific_name FROM species_group WHERE scientific_name IN ${sql(all)} AND is_species`.catch(() => [])).map((r) => r.scientific_name));
  const names = lang === "en" ? {} : await getNames(all).catch(() => ({}));
  const FAQ = await faq(lang);
  const title = tr(lang, TITLE);
  const cities = (PLACES as { slug: string; name: string; country: string }[]).filter((p) => p.country === "India");
  const url = `${SITE}${path(lang, "/arrivals/india")}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: title, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Country", name: "India" }, dateModified: SEASONS.generated },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: tr(lang, "Arrivals"), item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: tr(lang, "India"), item: url },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  const lists: [string, Sp[], string][] = [
    [tx("Winter visitors"), winter, tx("Here from about September or October to March or April. Most recorded first.")],
    [tx("Summer and monsoon visitors"), summer, tx("Here from about April or May, often to breed, and gone by the cold months.")],
    [tx("Passing through"), passage, tx("Seen mostly for a few weeks in spring or autumn, on the way somewhere else.")],
  ];
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><X lang={lang} k="Arrivals" /></Link> / <X lang={lang} k="India" />
          <LangLinks lang={lang} path="/arrivals/india" />
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{title}</h1>
        <p className="mt-3">
          <X lang={lang} k="Every year about {n} kinds of birds come to India for the winter, and a few more come for the summer or pass through on the way. Below are the months each one is here, worked out from {records} bird records from {from} to {to}." v={{ n: winter.length, records: fmtCount(lang, records), from: FROM, to: TO }} />
        </p>
        <p className="mt-2 text-sm text-slate-400"><X lang={lang} k="Each row shows January to December. Darker means the bird is recorded more in that month." /></p>

        {now.length > 0 && (
          <section>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><X lang={lang} k="Arriving around now" /></h2>
            <p className="mt-1 text-sm text-slate-400"><X lang={lang} k="Birds that usually arrive in {m1} or {m2}." v={{ m1: M[m - 1], m2: M[next - 1] }} /></p>
            <List items={now} thumbs={thumbs} pages={pages} names={names} short={S} lang={lang} />
          </section>
        )}
        {leaving.length > 0 && (
          <section>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><X lang={lang} k="Leaving around now" /></h2>
            <p className="mt-1 text-sm text-slate-400"><X lang={lang} k="Birds that usually leave in {m1} or {m2}." v={{ m1: M[m - 1], m2: M[next - 1] }} /></p>
            <List items={leaving} thumbs={thumbs} pages={pages} names={names} short={S} lang={lang} />
          </section>
        )}
        <p className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/?lat=22&lon=79" className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><X lang={lang} k="See India on the live map" /></Link>
          <Link href="/alerts" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><X lang={lang} k="Get an email when a bird arrives near you" /></Link>
        </p>

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="By state" /></h2>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {INDIA_STATES.filter((s) => s.migrants.length >= 5).map((s) => <Link key={s.slug} href={path(lang, `/arrivals/india/${s.slug}`)} prefetch={false} className="text-cyan-400 hover:underline">{stateName(lang, s.slug, s.name)}</Link>)}
        </p>

        {lists.filter(([, items]) => items.length).map(([h, items, note]) => (
          <section key={h}>
            <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k={h} /> <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
            <p className="mt-1 text-sm text-slate-400"><X lang={lang} k={note} /></p>
            <List items={items} thumbs={thumbs} pages={pages} names={names} short={S} lang={lang} />
          </section>
        ))}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Questions" /></h2>
        <dl className="mt-3 space-y-4">
          {FAQ.map(([q, a]) => <div key={q}><dt className="font-medium text-slate-100">{q}</dt><dd className="mt-1">{a}</dd></div>)}
        </dl>

        {cities.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Birds around Indian cities" /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {cities.map((c) => <Link key={c.slug} href={`/places/${c.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{c.name}</Link>)}
          </p>
        </>)}

        <p className="mt-10 text-xs text-slate-400">
          <X lang={lang} k="Data: {records} bird records in India from {from} to {to}, under CC0 or CC BY 4.0, from [GBIF.org](https://www.gbif.org), most of them from the [eBird](https://ebird.org) Observation Dataset of the Cornell Lab of Ornithology. Thanks to every birder who shares their lists. Updated {date}. [How Wildlife Network works](/methods)." v={{ records: fmtCount(lang, records), from: FROM, to: TO, date: SEASONS.generated }} />
        </p>
      </div>
    </main>
  );
}

/** Plain links to the page in the other languages (crawlable, unlike the language menu). */
export function LangLinks({ lang, path: p }: { lang: PageLang; path: string }) {
  const all: [PageLang, string][] = [["en", "English"], ["hi", "हिन्दी"], ["ta", "தமிழ்"]];
  return (
    <span className="ml-3 inline-flex gap-2">
      {all.filter(([l]) => l !== lang).map(([l, label]) => <Link key={l} href={l === "en" ? p : `/${l}${p}`} hrefLang={l} lang={l} className="text-cyan-400 hover:underline">{label}</Link>)}
    </span>
  );
}

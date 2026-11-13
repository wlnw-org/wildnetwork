import type { Metadata } from "next";
import Link from "next/link";
import { X } from "@/components/ServerTr";
import { LocalName } from "@/components/T";
import { BirdTable } from "@/components/CityBirds";
import { LangLinks, joinNames } from "@/components/IndiaArrivals";
import { sql } from "@/lib/db";
import { getNames } from "@/lib/names";
import { SITE, speciesSlug } from "@/lib/site";
import { tx } from "@/lib/body";
import { INDIA_STATES, INDIA_STATES_GENERATED, INDIA_STATES_YEARS, STATE_CITIES, migrantName, type IndiaState, type Migrant } from "@/lib/indiaStates";
import { INDIA_NAME, languageAlternates, months, stateName, tr, type PageLang } from "@/lib/pageLang";
import PLACES from "@/data/places.json";

// /arrivals/india/<state> and its language versions /hi/... and /ta/... Built from src/data/india-states.json
// (scripts/india-states.mts).

const [FROM, TO] = INDIA_STATES_YEARS;
const fmt = (lang: PageLang, n: number) => (lang === "en" && n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : n.toLocaleString("en-IN"));
const byStatus = (s: IndiaState, st: string) => s.migrants.filter((m) => m[1] === st);
const mode = (xs: (number | null)[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const path = (lang: PageLang, p: string) => (lang === "en" ? p : `/${lang}${p}`);
const K = {
  title: tx("Migratory birds in {place}: when they arrive and leave"),
  desc: tx("{n} winter visitors come to {place}, among them {list}. See the months each is here and what is arriving now, from {records} records."),
  descShort: tx("{n} winter visitors come to {place}. See the months each is here and what is arriving now, from {records} records."),
  q1: tx("Which birds come to {place} in winter?"),
  a1: tx("About {n} species, going by ten years of records. Among the most recorded are {list}."),
  q2: tx("When do migratory birds arrive in {place}?"),
  a2: tx("Most winter visitors arrive in {month} and leave again by {leave}."),
  a2b: tx("Most winter visitors arrive in {month}."),
  a2s: tx("{n} summer visitors, such as the {name}, come in the warm months instead."),
  q3: tx("How is this worked out?"),
  a3: tx("From {records} bird records in {place} from {from} to {to}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the state in the same month, so it does not look common just because more people go birding then. A bird is listed only when its months in {place} show the same pattern as across India."),
};

async function localNames(lang: PageLang, sci: string[]) {
  if (lang === "en") return sci.map(migrantName);
  const n = await getNames(sci).catch(() => ({} as Record<string, Record<string, string>>));
  return sci.map((x) => n[x]?.[lang] ?? migrantName(x));
}

async function faq(lang: PageLang, s: IndiaState): Promise<[string, string][]> {
  const place = stateName(lang, s.slug, s.name), M = months(lang);
  const w = byStatus(s, "winter"), su = byStatus(s, "summer"), arr = mode(w.map((m) => m[3])), lv = mode(w.map((m) => m[4]));
  const out: [string, string][] = [];
  if (w.length) out.push([tr(lang, K.q1, { place }), tr(lang, K.a1, { n: w.length, list: joinNames(lang, await localNames(lang, w.slice(0, 6).map((m) => m[0]))) })]);
  if (w.length && arr) {
    const [summerName] = su.length ? await localNames(lang, [su[0][0]]) : [""];
    out.push([tr(lang, K.q2, { place }),
      (lv ? tr(lang, K.a2, { month: M[arr - 1], leave: M[lv - 1] }) : tr(lang, K.a2b, { month: M[arr - 1] }))
      + (su.length ? " " + tr(lang, K.a2s, { n: su.length, name: summerName }) : "")]);
  }
  out.push([tr(lang, K.q3), tr(lang, K.a3, { records: fmt(lang, s.records), place, from: FROM, to: TO })]);
  return out;
}

export async function stateMetadata(lang: PageLang, s: IndiaState): Promise<Metadata> {
  const place = stateName(lang, s.slug, s.name), w = byStatus(s, "winter");
  const full = tr(lang, K.desc, { n: w.length, place, list: joinNames(lang, await localNames(lang, w.slice(0, 3).map((m) => m[0]))), records: fmt(lang, s.records) });
  const description = full.length <= 160 ? full : tr(lang, K.descShort, { n: w.length, place, records: fmt(lang, s.records) });
  const title = tr(lang, K.title, { place }), url = path(lang, `/arrivals/india/${s.slug}`);
  return {
    title, description,
    alternates: { canonical: url, languages: languageAlternates(`/arrivals/india/${s.slug}`) },
    openGraph: { title, description, url, type: "article", ...(lang === "en" ? {} : { locale: lang === "hi" ? "hi_IN" : "ta_IN" }) },
    robots: s.migrants.length >= 5 ? undefined : { index: false },
  };
}

function Months({ p, short }: { p: number[]; short: string[] }) {
  return (
    <span className="inline-flex gap-px align-middle" aria-hidden>
      {p.map((v, i) => <span key={i} title={short[i]} className="h-3 w-2 rounded-[1px]" style={{ background: `rgba(34, 211, 238, ${Math.max(0.08, v)})` }} />)}
    </span>
  );
}

function List({ items, thumbs, pages, names, short, lang }: { items: Migrant[]; thumbs: Map<string, string>; pages: Set<string>; names: Record<string, Record<string, string>>; short: string[]; lang: PageLang }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([sci, , , arrive, leave, p]) => {
        const en = migrantName(sci), label = <LocalName en={en} names={names[sci]} />;
        return (
          <li key={sci} className="flex items-center gap-3 text-sm">
            {thumbs.get(sci)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumbs.get(sci)} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span className="h-10 w-10 shrink-0 rounded bg-white/5" />}
            <span className="min-w-0">
              {pages.has(sci)
                ? <Link href={`/species/${speciesSlug(sci)}`} prefetch={false} className="text-cyan-400 hover:underline">{label}</Link>
                : <span className="text-slate-100">{label}</span>}
              {en !== sci && <span className="text-slate-400 italic"> {sci}</span>}
              <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><Months p={p} short={short} />
                {arrive && leave ? <X lang={lang} k="{arrive} to {leave}" v={{ arrive: short[arrive - 1], leave: short[leave - 1] }} />
                  : arrive ? <X lang={lang} k="arrives in {month}" v={{ month: short[arrive - 1] }} />
                  : leave ? <X lang={lang} k="leaves in {month}" v={{ month: short[leave - 1] }} /> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function IndiaStateArrivals({ lang, s }: { lang: PageLang; s: IndiaState }) {
  const place = stateName(lang, s.slug, s.name), M = months(lang), S = months(lang, "short");
  const winter = byStatus(s, "winter"), summer = byStatus(s, "summer"), passage = byStatus(s, "passage");
  const m = new Date().getUTCMonth() + 1, next = (m % 12) + 1;
  const now = s.migrants.filter((x) => x[3] === m || x[3] === next).slice(0, 12);
  const leaving = s.migrants.filter((x) => x[4] === m || x[4] === next).slice(0, 8);
  const all = [...new Set([...s.migrants.map((x) => x[0]), ...s.top.map((x) => x[0])])];
  const thumbRows = await sql<{ scientific_name: string; thumb_url: string | null }[]>`
    SELECT scientific_name, thumb_url FROM species_media WHERE scientific_name IN ${sql(all)} AND thumb_url IS NOT NULL`.catch(() => []);
  const thumbs = new Map(thumbRows.map((r) => [r.scientific_name, r.thumb_url as string]));
  // Only species with a page are linked (a page exists for every species in species_group).
  const pages = new Set((await sql<{ scientific_name: string }[]>`
    SELECT scientific_name FROM species_group WHERE scientific_name IN ${sql(all)} AND is_species`.catch(() => [])).map((r) => r.scientific_name));
  const names = await getNames(all).catch(() => ({}));
  const cities = (STATE_CITIES[s.slug] ?? []).map((slug) => (PLACES as { slug: string; name: string }[]).find((p) => p.slug === slug)).filter((p) => !!p);
  const others = INDIA_STATES.filter((x) => x.slug !== s.slug && x.migrants.length >= 5);
  const FAQ = await faq(lang, s), title = tr(lang, K.title, { place });
  const url = `${SITE}${path(lang, `/arrivals/india/${s.slug}`)}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: title, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "AdministrativeArea", name: s.name, containedInPlace: { "@type": "Country", name: "India" } }, dateModified: INDIA_STATES_GENERATED },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: tr(lang, "Arrivals"), item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: INDIA_NAME[lang], item: `${SITE}${path(lang, "/arrivals/india")}` },
        { "@type": "ListItem", position: 4, name: place, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  const lists: [string, Migrant[], string][] = [
    [tx("Winter visitors"), winter, tx("Here from about September or October to March or April. Most recorded first.")],
    [tx("Summer and monsoon visitors"), summer, tx("Here from about April or May, often to breed, and gone by the cold months.")],
    [tx("Passing through"), passage, tx("Seen mostly for a few weeks in spring or autumn, on the way somewhere else.")],
  ];
  const v = { w: winter.length, place, records: fmt(lang, s.records), from: FROM, to: TO };
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><X lang={lang} k="Arrivals" /></Link> / <Link href={path(lang, "/arrivals/india")} className="text-cyan-400 hover:underline"><X lang={lang} k="India" /></Link> / {place}
          <LangLinks lang={lang} path={`/arrivals/india/${s.slug}`} />
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{title}</h1>
        <p className="mt-3">
          {summer.length + passage.length
            ? <X lang={lang} k="About {w} kinds of birds come to {place} for the winter, and a few more come for the summer or pass through on the way. Below are the months each one is here, worked out from {records} bird records in {place} from {from} to {to}." v={v} />
            : <X lang={lang} k="About {w} kinds of birds come to {place} for the winter. Below are the months each one is here, worked out from {records} bird records in {place} from {from} to {to}." v={v} />}
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

        {lists.filter(([, items]) => items.length).map(([h, items, note]) => (
          <section key={h}>
            <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k={h} /> <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
            <p className="mt-1 text-sm text-slate-400"><X lang={lang} k={note} /></p>
            <List items={items} thumbs={thumbs} pages={pages} names={names} short={S} lang={lang} />
          </section>
        ))}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Birds of {place} through the year" v={{ place }} /></h2>
        <p className="mt-1 text-sm text-slate-400"><X lang={lang} k="The {n} birds recorded most in {place}, residents and visitors together. The strip shows the months each is recorded, darker where it makes up more of what people record that month." v={{ n: s.top.length, place }} /></p>
        <BirdTable species={s.top} names={names} linked={pages} short={S} />

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Questions" /></h2>
        <dl className="mt-3 space-y-4">
          {FAQ.map(([q, a]) => <div key={q}><dt className="font-medium text-slate-100">{q}</dt><dd className="mt-1">{a}</dd></div>)}
        </dl>

        {cities.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Birds around cities in {place}" v={{ place }} /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {cities.map((c) => <Link key={c.slug} href={`/places/${c.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{c.name}</Link>)}
          </p>
        </>)}
        <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Other states" /></h2>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <Link href={path(lang, "/arrivals/india")} className="text-cyan-400 hover:underline"><X lang={lang} k="All of India" /></Link>
          {others.map((x) => <Link key={x.slug} href={path(lang, `/arrivals/india/${x.slug}`)} prefetch={false} className="text-cyan-400 hover:underline">{stateName(lang, x.slug, x.name)}</Link>)}
        </p>

        <p className="mt-10 text-xs text-slate-400">
          <X lang={lang} k="Data: {records} bird records in {place} from {from} to {to}, under CC0 or CC BY 4.0, from [GBIF.org](https://www.gbif.org), most of them from the [eBird](https://ebird.org) Observation Dataset of the Cornell Lab of Ornithology. Thanks to every birder who shares their lists. Updated {date}. [How Wildlife Network works](/methods)." v={{ records: fmt(lang, s.records), place, from: FROM, to: TO, date: INDIA_STATES_GENERATED }} />
        </p>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { X } from "@/components/ServerTr";
import { LocalName } from "@/components/T";
import { BirdTable } from "@/components/CityBirds";
import { sql } from "@/lib/db";
import { getNames } from "@/lib/names";
import { SITE, speciesSlug } from "@/lib/site";
import { tx } from "@/lib/body";
import { COUNTRIES, COUNTRY_GENERATED, COUNTRY_YEARS, OWN_PAGE, hasPage, inName, seasonHeading, type CMigrant, type Country, type Status } from "@/lib/countries";
import { COUNTRY_LANGS, countryLangs, countryName, fmtBig, months, tr, type PageLang } from "@/lib/pageLang";
import PLACES from "@/data/places.json";

// /arrivals/<country> (rendered by src/app/arrivals/[region]/page.tsx) and the same page in the country's own language,
// /es/arrivals/spain, /fr/arrivals/france ... (src/app/<lang>/arrivals/[country]). Text is translated on the server.
const [FROM, TO] = COUNTRY_YEARS;
const by = (c: Country, st: Status) => c.migrants.filter((m) => m[2] === st);
const mode = (xs: (number | null)[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const path = (lang: PageLang, slug: string) => (lang === "en" ? `/arrivals/${slug}` : `/${lang}/arrivals/${slug}`);
const join = (lang: PageLang, xs: string[]) => (lang === "en" && xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs.join(", "));
/** {in}: "in the United States", "en España", "au Canada". */
const where = (lang: PageLang, c: Country) => (lang === "en" ? `in ${inName(c)}` : (COUNTRY_LANGS as Record<string, Record<string, string>>)[lang]?.[c.slug] ?? countryName(lang, c.iso, c.name));
const K = {
  title: tx("Migratory birds {in}: when they arrive and leave"),
  descW: tx("{n} winter visitors spend part of the year {in}, among them {list}. See the months each is here and what is arriving now, from {records} records."),
  descS: tx("{n} summer visitors spend part of the year {in}, among them {list}. See the months each is here and what is arriving now, from {records} records."),
  descWShort: tx("{n} winter visitors spend part of the year {in}. See the months each is here and what is arriving now, from {records} records."),
  descSShort: tx("{n} summer visitors spend part of the year {in}. See the months each is here and what is arriving now, from {records} records."),
  qW: tx("Which birds spend the winter {in}?"),
  qS: tx("Which birds spend the summer {in}?"),
  a1: tx("About {n} species, going by ten years of records. Among the most recorded are {list}."),
  a1when: tx("Most arrive in {month} and leave again by {leave}."),
  a1arr: tx("Most arrive in {month}."),
  q3: tx("How is this worked out?"),
  a3region: tx("From {records} bird records {in} from {from} to {to}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the same region and month, so it does not look common just because more people go birding then. A bird is listed only when at least two of the {regions} busiest regions show the same pattern."),
  a3country: tx("From {records} bird records {in} from {from} to {to}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the same country and month, so it does not look common just because more people go birding then."),
};

async function names(lang: PageLang, sci: string[]) {
  return lang === "en" ? {} : await getNames(sci).catch(() => ({} as Record<string, Record<string, string>>));
}
const nm = (lang: PageLang, n: Record<string, Record<string, string>>, m: CMigrant) => n[m[0]]?.[lang] ?? m[1] ?? m[0];

export async function countryMetadata(lang: PageLang, c: Country): Promise<Metadata> {
  const main = (by(c, "winter").length >= by(c, "summer").length ? "winter" : "summer") as Status;
  const list = by(c, main), w = where(lang, c), n = await names(lang, list.slice(0, 3).map((m) => m[0]));
  const v = { n: list.length, in: w, records: fmtBig(lang, c.records), list: join(lang, list.slice(0, 3).map((m) => nm(lang, n, m))) };
  const full = tr(lang, main === "winter" ? K.descW : K.descS, v);
  const description = full.length <= 160 ? full : tr(lang, main === "winter" ? K.descWShort : K.descSShort, v);
  const title = tr(lang, K.title, { in: w }), url = path(lang, c.slug);
  const langs = countryLangs(c.slug);
  return {
    title, description,
    alternates: { canonical: url, languages: { "x-default": path("en", c.slug), en: path("en", c.slug), ...Object.fromEntries(langs.map((l) => [l, path(l, c.slug)])) } },
    openGraph: { title, description, url, type: "article" },
    robots: hasPage(c) ? undefined : { index: false },
  };
}

async function faq(lang: PageLang, c: Country): Promise<[string, string][]> {
  const w = where(lang, c), M = months(lang), out: [string, string][] = [];
  for (const st of ["winter", "summer"] as Status[]) {
    const l = by(c, st);
    if (l.length < 3) continue;
    const n = await names(lang, l.slice(0, 6).map((m) => m[0]));
    const arr = mode(l.map((m) => m[4])), lv = mode(l.map((m) => m[5]));
    const tail = arr ? " " + (lv ? tr(lang, K.a1when, { month: M[arr - 1], leave: M[lv - 1] }) : tr(lang, K.a1arr, { month: M[arr - 1] })) : "";
    out.push([tr(lang, st === "winter" ? K.qW : K.qS, { in: w }), tr(lang, K.a1, { n: l.length, list: join(lang, l.slice(0, 6).map((m) => nm(lang, n, m))) }) + tail]);
  }
  out.push([tr(lang, K.q3), tr(lang, c.regions >= 2 ? K.a3region : K.a3country, { records: fmtBig(lang, c.records), in: w, from: FROM, to: TO, regions: c.regions })]);
  return out;
}

/** Literal keys, one per wording, so `pnpm i18n:body` finds them all. */
function SeasonHeading({ st, c, lang }: { st: Status; c: Country; lang: PageLang }) {
  switch (seasonHeading(st, c)) {
    case "Winter visitors": return <X lang={lang} k="Winter visitors" />;
    case "Summer visitors": return <X lang={lang} k="Summer visitors" />;
    case "Visitors in the northern winter": return <X lang={lang} k="Visitors in the northern winter" />;
    case "Visitors in the northern summer": return <X lang={lang} k="Visitors in the northern summer" />;
    case "Visitors in the southern winter": return <X lang={lang} k="Visitors in the southern winter" />;
    case "Visitors in the southern summer": return <X lang={lang} k="Visitors in the southern summer" />;
    default: return <X lang={lang} k="Passing through" />;
  }
}
function SeasonNote({ st, c, lang }: { st: Status; c: Country; lang: PageLang }) {
  if (st === "passage") return <X lang={lang} k="Seen mostly for a few weeks in spring or autumn, on the way somewhere else." />;
  // Visitors of the cold months come from breeding grounds elsewhere; those of the warm months often come to breed.
  const cold = st === "winter";
  return c.south === cold
    ? (cold ? <X lang={lang} k="Here mainly from about May to August, from breeding grounds elsewhere. Most recorded first." /> : <X lang={lang} k="Here mainly from about May to August, often to breed. Most recorded first." />)
    : (cold ? <X lang={lang} k="Here mainly from about November to February, from breeding grounds elsewhere. Most recorded first." /> : <X lang={lang} k="Here mainly from about November to February, often to breed. Most recorded first." />);
}

function Months({ p, short }: { p: number[]; short: string[] }) {
  return (
    <span className="inline-flex gap-px align-middle" aria-hidden>
      {p.map((v, i) => <span key={i} title={short[i]} className="h-3 w-2 rounded-[1px]" style={{ background: `rgba(34, 211, 238, ${Math.max(0.08, v)})` }} />)}
    </span>
  );
}

function List({ items, thumbs, pages, names: n, short, lang }: { items: CMigrant[]; thumbs: Map<string, string>; pages: Set<string>; names: Record<string, Record<string, string>>; short: string[]; lang: PageLang }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((m) => {
        const [sci, en, , , arrive, leave, p] = m;
        const label = <LocalName en={en ?? sci} names={n[sci]} />;
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
              {en && <span className="text-slate-400 italic"> {sci}</span>}
              <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><Months p={p} short={short} />
                {arrive && leave ? <X lang={lang} k="{arrive} to {leave}" v={{ arrive: short[arrive - 1], leave: short[leave - 1] }} />
                  : arrive ? <X lang={lang} k="arrives in {month}" v={{ month: short[arrive - 1] }} /> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CountryArrivals({ c, lang = "en" }: { c: Country; lang?: PageLang }) {
  const w = where(lang, c), place = countryName(lang, c.iso, c.name), M = months(lang), S = months(lang, "short");
  const title = tr(lang, K.title, { in: w });
  const m = new Date().getUTCMonth() + 1, next = (m % 12) + 1;
  const now = c.migrants.filter((x) => x[4] === m || x[4] === next).slice(0, 12);
  const leaving = c.migrants.filter((x) => x[5] === m || x[5] === next).slice(0, 8);
  const all = [...new Set([...c.migrants.map((x) => x[0]), ...c.top.map((x) => x[0])])];
  const thumbRows = await sql<{ scientific_name: string; thumb_url: string | null }[]>`
    SELECT scientific_name, thumb_url FROM species_media WHERE scientific_name IN ${sql(all)} AND thumb_url IS NOT NULL`.catch(() => []);
  const thumbs = new Map(thumbRows.map((r) => [r.scientific_name, r.thumb_url as string]));
  // Only species with a page are linked (a page exists for every species in species_group).
  const pages = new Set((await sql<{ scientific_name: string }[]>`
    SELECT scientific_name FROM species_group WHERE scientific_name IN ${sql(all)} AND is_species`.catch(() => [])).map((r) => r.scientific_name));
  const localNames = await getNames(all).catch(() => ({}));
  const cities = (PLACES as { slug: string; name: string; country: string }[]).filter((p) => p.slug.endsWith(`-${c.iso.toLowerCase()}`));
  const sections = (["winter", "summer", "passage"] as Status[]).map((st) => ({ st, items: by(c, st) })).filter((x) => x.items.length);
  const FAQ = await faq(lang, c);
  const url = `${SITE}${path(lang, c.slug)}`;
  // Other countries: on a language page, those with a page in the same language; in English, every country page.
  const others = lang === "en"
    ? COUNTRIES.filter((x) => x.slug !== c.slug && (hasPage(x) || OWN_PAGE.has(x.slug))).map((x) => ({ slug: x.slug, label: x.name, href: path("en", x.slug) }))
    : COUNTRIES.filter((x) => x.slug !== c.slug && countryLangs(x.slug).includes(lang as never)).map((x) => ({ slug: x.slug, label: countryName(lang, x.iso, x.name), href: path(lang, x.slug) }));
  const langs: PageLang[] = ["en", ...countryLangs(c.slug)];
  const LABEL: Record<string, string> = { en: "English", es: "Español", pt: "Português", fr: "Français", de: "Deutsch" };
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: title, inLanguage: lang, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Country", name: c.name }, dateModified: COUNTRY_GENERATED },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: tr(lang, "Arrivals"), item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: place, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><X lang={lang} k="Arrivals" /></Link> / {place}
          {langs.length > 1 && (
            <span className="ml-3 inline-flex gap-2">
              {langs.filter((l) => l !== lang).map((l) => <Link key={l} href={path(l, c.slug)} hrefLang={l} lang={l} className="text-cyan-400 hover:underline">{LABEL[l]}</Link>)}
            </span>
          )}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{title}</h1>
        <p className="mt-3">
          <X lang={lang} k="These are the birds that spend part of the year {in}, and the months each one is here, worked out from {records} bird records from {from} to {to}." v={{ in: w, records: fmtBig(lang, c.records), from: FROM, to: TO }} />
        </p>
        <p className="mt-2 text-sm text-slate-400"><X lang={lang} k="Each row shows January to December. Darker means the bird is recorded more in that month." /></p>

        {now.length > 0 && (
          <section>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><X lang={lang} k="Arriving around now" /></h2>
            <p className="mt-1 text-sm text-slate-400"><X lang={lang} k="Birds that usually arrive in {m1} or {m2}." v={{ m1: M[m - 1], m2: M[next - 1] }} /></p>
            <List items={now} thumbs={thumbs} pages={pages} names={localNames} short={S} lang={lang} />
          </section>
        )}
        {leaving.length > 0 && (
          <section>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><X lang={lang} k="Leaving around now" /></h2>
            <p className="mt-1 text-sm text-slate-400"><X lang={lang} k="Birds that usually leave in {m1} or {m2}." v={{ m1: M[m - 1], m2: M[next - 1] }} /></p>
            <List items={leaving} thumbs={thumbs} pages={pages} names={localNames} short={S} lang={lang} />
          </section>
        )}
        <p className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href={`/?lat=${c.centre[0]}&lon=${c.centre[1]}`} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><X lang={lang} k="See it on the live map" /></Link>
          <Link href="/alerts" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><X lang={lang} k="Get an email when a bird arrives near you" /></Link>
        </p>

        {sections.map(({ st, items }) => (
          <section key={st}>
            <h2 className="mt-10 text-xl font-semibold text-slate-100"><SeasonHeading st={st} c={c} lang={lang} /> <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
            <p className="mt-1 text-sm text-slate-400"><SeasonNote st={st} c={c} lang={lang} /></p>
            <List items={items} thumbs={thumbs} pages={pages} names={localNames} short={S} lang={lang} />
          </section>
        ))}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Birds {in} through the year" v={{ in: w }} /></h2>
        <p className="mt-1 text-sm text-slate-400"><X lang={lang} k="The {n} birds recorded most {in}, residents and visitors together. The strip shows the months each is recorded, darker where it makes up more of what people record that month." v={{ n: c.top.length, in: w }} /></p>
        <BirdTable species={c.top} names={localNames} linked={pages} short={S} />

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Questions" /></h2>
        <dl className="mt-3 space-y-4">
          {FAQ.map(([q, a]) => <div key={q}><dt className="font-medium text-slate-100">{q}</dt><dd className="mt-1">{a}</dd></div>)}
        </dl>

        {cities.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Birds around cities {in}" v={{ in: w }} /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {cities.map((p) => <Link key={p.slug} href={`/places/${p.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{p.name}</Link>)}
          </p>
        </>)}
        {others.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><X lang={lang} k="Other countries" /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {others.map((x) => <Link key={x.slug} href={x.href} prefetch={false} className="text-cyan-400 hover:underline">{x.label}</Link>)}
          </p>
        </>)}

        <p className="mt-10 text-xs text-slate-400">
          <X lang={lang} k="Data: {records} bird records {in} from {from} to {to}, under CC0 or CC BY 4.0, from [GBIF.org](https://www.gbif.org), most of them from the [eBird](https://ebird.org) Observation Dataset of the Cornell Lab of Ornithology. Thanks to every birder who shares their lists. Updated {date}. [How Wildlife Network works](/methods)." v={{ records: fmtBig(lang, c.records), in: w, from: FROM, to: TO, date: COUNTRY_GENERATED }} />
        </p>
      </div>
    </main>
  );
}

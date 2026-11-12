import type { Metadata } from "next";
import Link from "next/link";
import { TR } from "@/components/TR";
import { sql } from "@/lib/db";
import { SITE, speciesSlug } from "@/lib/site";
import { UK, UK_SPECIES, half, ukArrival, ukSeason, type UkSp } from "@/lib/ukSeasons";
import PLACES from "@/data/places.json";

// Built from src/data/uk-seasons.json (scripts/uk-seasons.mts): ten years of openly licensed bird records in the UK,
// half month by half month. Revalidated daily so "arriving now" follows the calendar.
export const revalidate = 86400;

const summer = UK_SPECIES.filter((s) => s.status === "summer").sort((a, b) => a.arrive - b.arrive || b.records - a.records);
const winter = UK_SPECIES.filter((s) => s.status === "winter").sort((a, b) => ((a.arrive + 12) % 24) - ((b.arrive + 12) % 24) || b.records - a.records);
const records = UK.binRecords.reduce((a, b) => a + b, 0);
const [FROM, TO] = UK.years;
const fmtM = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : n.toLocaleString("en-GB"));
const name = (s: UkSp) => s.en ?? s.sci;

const TITLE = "When do birds arrive in the UK? Summer and winter visitors";
const answer = (sci: string, who: string) => {
  const s = ukSeason(sci);
  if (!s) return null;
  const a = ukArrival(s);
  return `${who} usually arrive in ${a.typical}${a.range ? `, between ${a.range} depending on the year` : ""}${a.leave ? `, and are last seen regularly in ${a.leave}` : ""}.`;
};
const FAQ: [string, string][] = ([
  ["When do swallows arrive in the UK?", answer("Hirundo rustica", "Swallows")],
  ["When do cuckoos arrive in the UK?", answer("Cuculus canorus", "Cuckoos")],
  ["When do swifts arrive in the UK?", answer("Apus apus", "Swifts")],
  ["When do house martins arrive in the UK?", answer("Delichon urbicum", "House martins")],
  ["Which birds come to the UK for the winter?",
    `About ${winter.length} species, going by ten years of records, among them ${winter.slice().sort((a, b) => b.records - a.records).slice(0, 6).map(name).join(", ")}. Most arrive in October and November and stay until March or April.`],
  ["How is this worked out?",
    `From ${fmtM(records)} bird records in the UK from ${FROM} to ${TO}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the same half month, so it does not look common just because more people go birding then. The arrival is the first half month the bird reaches a quarter of its usual peak, and the range covers most years. Birds are recorded less once they stop singing, so "last seen regularly" is not the day they leave.`],
] as [string, string | null][]).filter((x): x is [string, string] => x[1] !== null);
const DESCRIPTION = (() => {
  const full = `${FAQ[0]?.[1] ?? ""} When ${summer.length} summer and ${winter.length} winter visitors arrive, from ${fmtM(records)} records.`;
  return full.length <= 160 ? full : (FAQ[0]?.[1] ?? "") + ` See all ${summer.length + winter.length} visitors.`;
})();

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/arrivals/uk" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/arrivals/uk", type: "article", images: ["/opengraph-image"] },
};

/** 24 small cells, early January to late December. */
function Halves({ p }: { p: number[] }) {
  return (
    <span className="inline-flex gap-px align-middle" aria-hidden>
      {p.map((v, i) => <span key={i} title={half(i)} className={`h-3 w-1.5 ${i % 2 ? "rounded-r-[1px] mr-px" : "rounded-l-[1px]"}`} style={{ background: `rgba(34, 211, 238, ${Math.max(0.08, v)})` }} />)}
    </span>
  );
}

function List({ items, thumbs, pages }: { items: UkSp[]; thumbs: Map<string, string>; pages: Set<string> }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((s) => {
        const a = ukArrival(s);
        return (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            {thumbs.get(s.sci)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumbs.get(s.sci)} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span className="h-10 w-10 shrink-0 rounded bg-white/5" />}
            <span className="min-w-0">
              {pages.has(s.sci)
                ? <Link href={`/species/${speciesSlug(s.sci)}`} prefetch={false} className="text-cyan-400 hover:underline">{name(s)}</Link>
                : <span className="text-slate-100">{name(s)}</span>}
              {s.en && <span className="text-slate-400 italic"> {s.sci}</span>}
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400"><Halves p={s.presence} /> <TR k="arrives {when}" v={{ when: a.typical }} /></span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function UkArrivals() {
  const d = new Date(), b = d.getUTCMonth() * 2 + (d.getUTCDate() > 15 ? 1 : 0), nb = (b + 1) % 24;
  const now = UK_SPECIES.filter((s) => s.arrive === b || s.arrive === nb).slice(0, 12);
  const all = UK_SPECIES.map((s) => s.sci);
  const thumbRows = await sql<{ scientific_name: string; thumb_url: string | null }[]>`
    SELECT scientific_name, thumb_url FROM species_media WHERE scientific_name IN ${sql(all)} AND thumb_url IS NOT NULL`.catch(() => []);
  const thumbs = new Map(thumbRows.map((r) => [r.scientific_name, r.thumb_url as string]));
  const pages = new Set((await sql<{ scientific_name: string }[]>`
    SELECT scientific_name FROM species_group WHERE scientific_name IN ${sql(all)} AND is_species`.catch(() => [])).map((r) => r.scientific_name));
  const cities = (PLACES as { slug: string; name: string; country: string }[]).filter((p) => p.country === "United Kingdom");
  const url = `${SITE}/arrivals/uk`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: TITLE, description: DESCRIPTION, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Country", name: "United Kingdom" }, dateModified: UK.generated },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: "Arrivals", item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: "United Kingdom", item: url },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><TR k="Arrivals" /></Link> / <TR k="United Kingdom" />
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k={TITLE} /></h1>
        <p className="mt-3">
          <TR k="About {s} kinds of birds come to the UK for the summer and {w} for the winter. Below is when each one usually arrives and leaves, worked out from {records} bird records from {from} to {to}." v={{ s: summer.length, w: winter.length, records: fmtM(records), from: FROM, to: TO }} />
        </p>
        <p className="mt-2 text-sm text-slate-400"><TR k="Each strip runs from January to December in half months. Darker means the bird is recorded more then." /></p>

        <dl className="mt-6 space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
          {FAQ.slice(0, 4).map(([q, a]) => (
            <div key={q}><dt className="font-medium text-slate-100"><TR k={q} /></dt><dd className="mt-0.5 text-sm"><TR k={a} /></dd></div>
          ))}
        </dl>

        {now.length > 0 && (
          <section>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Arriving around now" /></h2>
            <p className="mt-1 text-sm text-slate-400"><TR k="Birds that usually arrive in {a} or {b}." v={{ a: half(b), b: half(nb) }} /></p>
            <List items={now} thumbs={thumbs} pages={pages} />
          </section>
        )}
        <p className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/?lat=54&lon=-2" className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><TR k="See the UK on the live map" /></Link>
          <Link href="/alerts" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><TR k="Get an email when a bird arrives near you" /></Link>
        </p>

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Summer visitors" /> <span className="text-sm font-normal text-slate-400">{summer.length}</span></h2>
        <p className="mt-1 text-sm text-slate-400"><TR k="Here from spring to autumn, most of them to breed, plus a few that pass through in spring. Earliest arrivals first." /></p>
        <List items={summer} thumbs={thumbs} pages={pages} />

        {winter.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Winter visitors" /> <span className="text-sm font-normal text-slate-400">{winter.length}</span></h2>
          <p className="mt-1 text-sm text-slate-400"><TR k="Here from autumn to spring, from breeding grounds further north and east. Earliest arrivals first." /></p>
          <List items={winter} thumbs={thumbs} pages={pages} />
        </>)}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Questions" /></h2>
        <dl className="mt-3 space-y-4">
          {FAQ.slice(4).map(([q, a]) => (
            <div key={q}><dt className="font-medium text-slate-100"><TR k={q} /></dt><dd className="mt-1"><TR k={a} /></dd></div>
          ))}
        </dl>

        {cities.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Birds around UK cities" /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {cities.map((c) => <Link key={c.slug} href={`/places/${c.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{c.name}</Link>)}
          </p>
        </>)}

        <p className="mt-10 text-xs text-slate-400">
          <TR k="Data: {records} bird records in the UK from {from} to {to}, under CC0 or CC BY 4.0, from [GBIF.org](https://www.gbif.org), most of them from the [eBird](https://ebird.org) Observation Dataset of the Cornell Lab of Ornithology. Thanks to every birder who shares their lists. Updated {date}. [How Wildlife Network works](/methods)." v={{ records: fmtM(records), from: FROM, to: TO, date: UK.generated }} />
        </p>
      </div>
    </main>
  );
}

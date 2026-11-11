import type { Metadata } from "next";
import Link from "next/link";
import { TR } from "@/components/TR";
import { sql } from "@/lib/db";
import { SITE, speciesSlug } from "@/lib/site";
import SEASONS from "@/data/india-seasons.json";
import PLACES from "@/data/places.json";

// Built from src/data/india-seasons.json (scripts/india-seasons.mts): ten years of openly licensed bird records in India,
// compared area by area and month by month. Revalidated daily so "arriving now" follows the calendar.
export const revalidate = 86400;

type Sp = (typeof SEASONS.species)[number];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const species = SEASONS.species as Sp[];
const winter = species.filter((s) => s.status === "winter");
const summer = species.filter((s) => s.status === "summer");
const passage = species.filter((s) => s.status === "passage");
const records = SEASONS.monthRecords.reduce((a, b) => a + b, 0);
const [FROM, TO] = SEASONS.years;
const fmtM = (millions: number) => `${Math.round(millions / 1e6)} million`;
/** The month most winter visitors arrive in, and the one most leave in. */
const mode = (xs: (number | null)[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const arriveMost = mode(winter.map((s) => s.arrive));
const name = (s: Sp) => s.en ?? s.sci;
const topWinter = winter.slice(0, 10).map(name);

const TITLE = "Migratory birds in India: when they arrive and leave";
const DESCRIPTION = `${winter.length} bird species come to India for the winter, most arriving in ${MONTHS[(arriveMost ?? 10) - 1]}. See which ones, the months each is here, and what is arriving now. From ${fmtM(records)} bird records.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/arrivals/india" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/arrivals/india", type: "article", images: ["/opengraph-image"] },
};

const FAQ: [string, string][] = [
  ["Which birds come to India in winter?",
    `About ${winter.length} species, going by ten years of records. Among the most recorded are ${topWinter.slice(0, -1).join(", ")} and ${topWinter.at(-1)}. Ducks, waders, wagtails, warblers, pipits, buntings and many birds of prey also come for the winter.`],
  ["When do migratory birds come to India?",
    `Most winter visitors arrive between September and November, most of all in ${MONTHS[(arriveMost ?? 10) - 1]}, and most leave again in March or April. Summer visitors such as the Indian Cuckoo come in April and May, ahead of the monsoon.`],
  ["Where do they come from?",
    "Most winter visitors breed further north, in Central Asia, Siberia, Europe, the Himalaya and Tibet, and come to India's milder winters, wetlands and fields to feed."],
  ["How is this worked out?",
    `From ${fmtM(records)} records of birds in India from ${FROM} to ${TO}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the same area and month, so a species does not look common just because more people go birding then. A species is listed only when two areas or more show the same pattern.`],
];

/** Twelve small cells, Jan to Dec, darker when the species is more present. */
function Months({ p }: { p: number[] }) {
  return (
    <span className="inline-flex gap-px align-middle" aria-hidden>
      {p.map((v, i) => (
        <span key={i} title={SHORT[i]} className="h-3 w-2 rounded-[1px]" style={{ background: `rgba(34, 211, 238, ${Math.max(0.08, v)})` }} />
      ))}
    </span>
  );
}

function When({ s }: { s: Sp }) {
  if (s.arrive && s.leave) return <TR k="{arrive} to {leave}" v={{ arrive: SHORT[s.arrive - 1], leave: SHORT[s.leave - 1] }} />;
  if (s.arrive) return <TR k="arrives in {month}" v={{ month: SHORT[s.arrive - 1] }} />;
  if (s.leave) return <TR k="leaves in {month}" v={{ month: SHORT[s.leave - 1] }} />;
  return null;
}

function List({ items, thumbs, pages }: { items: Sp[]; thumbs: Map<string, string>; pages: Set<string> }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((s) => (
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
            <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><Months p={s.presence} /> <When s={s} /></span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function IndiaArrivals() {
  const m = new Date().getUTCMonth() + 1, next = (m % 12) + 1;
  const now = species.filter((s) => s.arrive === m || s.arrive === next).slice(0, 12);
  const leaving = species.filter((s) => s.leave === m || s.leave === next).slice(0, 8);
  const thumbRows = await sql<{ scientific_name: string; thumb_url: string | null }[]>`
    SELECT scientific_name, thumb_url FROM species_media WHERE scientific_name IN ${sql(species.map((s) => s.sci))} AND thumb_url IS NOT NULL`.catch(() => []);
  const thumbs = new Map(thumbRows.map((r) => [r.scientific_name, r.thumb_url as string]));
  // Only species with a page are linked (a page exists for every species in species_group).
  const pages = new Set((await sql<{ scientific_name: string }[]>`
    SELECT scientific_name FROM species_group WHERE scientific_name IN ${sql(species.map((s) => s.sci))} AND is_species`.catch(() => [])).map((r) => r.scientific_name));
  const cities = (PLACES as { slug: string; name: string; country: string }[]).filter((p) => p.country === "India");
  const url = `${SITE}/arrivals/india`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: TITLE, description: DESCRIPTION, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Country", name: "India" }, dateModified: SEASONS.generated },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: "Arrivals", item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: "India", item: url },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><TR k="Arrivals" /></Link> / <TR k="India" />
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k={TITLE} /></h1>
        <p className="mt-3">
          <TR k="Every year about {n} kinds of birds come to India for the winter, and a few more come for the summer or pass through on the way. Below are the months each one is here, worked out from {records} bird records from {from} to {to}." v={{ n: winter.length, records: fmtM(records), from: FROM, to: TO }} />
        </p>
        <p className="mt-2 text-sm text-slate-400"><TR k="Each row shows January to December. Darker means the bird is recorded more in that month." /></p>

        {now.length > 0 && (
          <section>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Arriving around now" /></h2>
            <p className="mt-1 text-sm text-slate-400"><TR k="Birds that usually arrive in {m1} or {m2}." v={{ m1: MONTHS[m - 1], m2: MONTHS[next - 1] }} /></p>
            <List items={now} thumbs={thumbs} pages={pages} />
          </section>
        )}
        {leaving.length > 0 && (
          <section>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Leaving around now" /></h2>
            <p className="mt-1 text-sm text-slate-400"><TR k="Birds that usually leave in {m1} or {m2}." v={{ m1: MONTHS[m - 1], m2: MONTHS[next - 1] }} /></p>
            <List items={leaving} thumbs={thumbs} pages={pages} />
          </section>
        )}
        <p className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link href="/?lat=22&lon=79" className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><TR k="See India on the live map" /></Link>
          <Link href="/alerts" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><TR k="Get an email when a bird arrives near you" /></Link>
        </p>

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Winter visitors" /> <span className="text-sm font-normal text-slate-400">{winter.length}</span></h2>
        <p className="mt-1 text-sm text-slate-400"><TR k="Here from about September or October to March or April. Most recorded first." /></p>
        <List items={winter} thumbs={thumbs} pages={pages} />

        {summer.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Summer and monsoon visitors" /> <span className="text-sm font-normal text-slate-400">{summer.length}</span></h2>
          <p className="mt-1 text-sm text-slate-400"><TR k="Here from about April or May, often to breed, and gone by the cold months." /></p>
          <List items={summer} thumbs={thumbs} pages={pages} />
        </>)}
        {passage.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Passing through" /> <span className="text-sm font-normal text-slate-400">{passage.length}</span></h2>
          <p className="mt-1 text-sm text-slate-400"><TR k="Seen mostly for a few weeks in spring or autumn, on the way somewhere else." /></p>
          <List items={passage} thumbs={thumbs} pages={pages} />
        </>)}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Questions" /></h2>
        <dl className="mt-3 space-y-4">
          {FAQ.map(([q, a]) => (
            <div key={q}><dt className="font-medium text-slate-100"><TR k={q} /></dt><dd className="mt-1"><TR k={a} /></dd></div>
          ))}
        </dl>

        {cities.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Birds around Indian cities" /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {cities.map((c) => <Link key={c.slug} href={`/places/${c.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{c.name}</Link>)}
          </p>
        </>)}

        <p className="mt-10 text-xs text-slate-400">
          <TR k="Data: {records} bird records in India from {from} to {to}, under CC0 or CC BY 4.0, from [GBIF.org](https://www.gbif.org), most of them from the [eBird](https://ebird.org) Observation Dataset of the Cornell Lab of Ornithology. Thanks to every birder who shares their lists. Updated {date}. [How Wildlife Network works](/methods)." v={{ records: fmtM(records), from: FROM, to: TO, date: SEASONS.generated }} />
        </p>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TR } from "@/components/TR";
import { BirdTable } from "@/components/CityBirds";
import { sql } from "@/lib/db";
import { getNames } from "@/lib/names";
import { SITE, speciesSlug } from "@/lib/site";
import { INDIA_STATES, INDIA_STATES_GENERATED, INDIA_STATES_YEARS, STATE_CITIES, indiaState, migrantName, type IndiaState, type Migrant } from "@/lib/indiaStates";
import PLACES from "@/data/places.json";

// Built from src/data/india-states.json (scripts/india-states.mts). ISR: pages are made on first visit and refreshed
// daily so "arriving now" follows the calendar.
export const revalidate = 86400;
export function generateStaticParams() { return []; }

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const [FROM, TO] = INDIA_STATES_YEARS;
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : n.toLocaleString("en-IN"));
const byStatus = (s: IndiaState, st: string) => s.migrants.filter((m) => m[1] === st);
const listNames = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
const mode = (xs: (number | null)[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};
const title = (s: IndiaState) => `Migratory birds in ${s.name}: when they arrive and leave`;

function faq(s: IndiaState): [string, string][] {
  const w = byStatus(s, "winter"), su = byStatus(s, "summer"), arr = mode(w.map((m) => m[3])), lv = mode(w.map((m) => m[4]));
  const out: [string, string][] = [];
  if (w.length) out.push([`Which birds come to ${s.name} in winter?`,
    `About ${w.length} species, going by ten years of records. Among the most recorded are ${listNames(w.slice(0, 6).map((m) => migrantName(m[0])))}.`]);
  if (w.length && arr) out.push([`When do migratory birds arrive in ${s.name}?`,
    `Most winter visitors arrive in ${MONTHS[arr - 1]}${lv ? ` and leave again by ${MONTHS[lv - 1]}` : ""}.${su.length ? ` ${su.length} summer visitors, such as the ${migrantName(su[0][0])}, come in the warm months instead.` : ""}`]);
  out.push(["How is this worked out?",
    `From ${fmt(s.records)} bird records in ${s.name} from ${FROM} to ${TO}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the state in the same month, so it does not look common just because more people go birding then. A bird is listed only when its months in ${s.name} show the same pattern as across India.`]);
  return out;
}

export async function generateMetadata({ params }: { params: Promise<{ state: string }> }): Promise<Metadata> {
  const { state } = await params;
  const s = indiaState(state);
  if (!s) return {};
  const w = byStatus(s, "winter");
  const full = `${w.length} winter visitors come to ${s.name}, among them ${listNames(w.slice(0, 3).map((m) => migrantName(m[0])))}. See the months each is here and what is arriving now, from ${fmt(s.records)} records.`;
  const description = full.length <= 160 ? full : `${w.length} winter visitors come to ${s.name}. See the months each is here and what is arriving now, from ${fmt(s.records)} records.`;
  const t = title(s);
  return {
    title: t, description,
    alternates: { canonical: `/arrivals/india/${s.slug}` },
    openGraph: { title: t, description, url: `/arrivals/india/${s.slug}`, type: "article" },
    robots: s.migrants.length >= 5 ? undefined : { index: false },
  };
}

function Months({ p }: { p: number[] }) {
  return (
    <span className="inline-flex gap-px align-middle" aria-hidden>
      {p.map((v, i) => <span key={i} title={SHORT[i]} className="h-3 w-2 rounded-[1px]" style={{ background: `rgba(34, 211, 238, ${Math.max(0.08, v)})` }} />)}
    </span>
  );
}

function List({ items, thumbs, pages }: { items: Migrant[]; thumbs: Map<string, string>; pages: Set<string> }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map(([sci, , , arrive, leave, p]) => {
        const en = migrantName(sci);
        return (
          <li key={sci} className="flex items-center gap-3 text-sm">
            {thumbs.get(sci)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumbs.get(sci)} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span className="h-10 w-10 shrink-0 rounded bg-white/5" />}
            <span className="min-w-0">
              {pages.has(sci)
                ? <Link href={`/species/${speciesSlug(sci)}`} prefetch={false} className="text-cyan-400 hover:underline">{en}</Link>
                : <span className="text-slate-100">{en}</span>}
              {en !== sci && <span className="text-slate-400 italic"> {sci}</span>}
              <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><Months p={p} />
                {arrive && leave ? <TR k="{arrive} to {leave}" v={{ arrive: SHORT[arrive - 1], leave: SHORT[leave - 1] }} />
                  : arrive ? <TR k="arrives in {month}" v={{ month: SHORT[arrive - 1] }} />
                  : leave ? <TR k="leaves in {month}" v={{ month: SHORT[leave - 1] }} /> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function StateArrivals({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const s = indiaState(state);
  if (!s) notFound();
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
  const names = await getNames(s.top.map((x) => x[0]));
  const cities = (STATE_CITIES[s.slug] ?? []).map((slug) => (PLACES as { slug: string; name: string }[]).find((p) => p.slug === slug)).filter((p) => !!p);
  const others = INDIA_STATES.filter((x) => x.slug !== s.slug && x.migrants.length >= 5);
  const FAQ = faq(s), t = title(s);
  const url = `${SITE}/arrivals/india/${s.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: t, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "AdministrativeArea", name: s.name, containedInPlace: { "@type": "Country", name: "India" } }, dateModified: INDIA_STATES_GENERATED },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: "Arrivals", item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: "India", item: `${SITE}/arrivals/india` },
        { "@type": "ListItem", position: 4, name: s.name, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><TR k="Arrivals" /></Link> / <Link href="/arrivals/india" className="text-cyan-400 hover:underline"><TR k="India" /></Link> / {s.name}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Migratory birds in {place}: when they arrive and leave" v={{ place: s.name }} /></h1>
        <p className="mt-3">
          {summer.length + passage.length
            ? <TR k="About {w} kinds of birds come to {place} for the winter, and a few more come for the summer or pass through on the way. Below are the months each one is here, worked out from {records} bird records in {place} from {from} to {to}." v={{ w: winter.length, place: s.name, records: fmt(s.records), from: FROM, to: TO }} />
            : <TR k="About {w} kinds of birds come to {place} for the winter. Below are the months each one is here, worked out from {records} bird records in {place} from {from} to {to}." v={{ w: winter.length, place: s.name, records: fmt(s.records), from: FROM, to: TO }} />}
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

        {winter.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Winter visitors" /> <span className="text-sm font-normal text-slate-400">{winter.length}</span></h2>
          <p className="mt-1 text-sm text-slate-400"><TR k="Here from about September or October to March or April. Most recorded first." /></p>
          <List items={winter} thumbs={thumbs} pages={pages} />
        </>)}
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

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Birds of {place} through the year" v={{ place: s.name }} /></h2>
        <p className="mt-1 text-sm text-slate-400"><TR k="The {n} birds recorded most in {place}, residents and visitors together. The strip shows the months each is recorded, darker where it makes up more of what people record that month." v={{ n: s.top.length, place: s.name }} /></p>
        <BirdTable species={s.top} names={names} linked={pages} />

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Questions" /></h2>
        <dl className="mt-3 space-y-4">
          {FAQ.map(([q, a]) => <div key={q}><dt className="font-medium text-slate-100">{q}</dt><dd className="mt-1">{a}</dd></div>)}
        </dl>

        {cities.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Birds around cities in {place}" v={{ place: s.name }} /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {cities.map((c) => <Link key={c.slug} href={`/places/${c.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{c.name}</Link>)}
          </p>
        </>)}
        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Other states" /></h2>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          <Link href="/arrivals/india" className="text-cyan-400 hover:underline"><TR k="All of India" /></Link>
          {others.map((x) => <Link key={x.slug} href={`/arrivals/india/${x.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{x.name}</Link>)}
        </p>

        <p className="mt-10 text-xs text-slate-400">
          <TR k="Data: {records} bird records in {place} from {from} to {to}, under CC0 or CC BY 4.0, from [GBIF.org](https://www.gbif.org), most of them from the [eBird](https://ebird.org) Observation Dataset of the Cornell Lab of Ornithology. Thanks to every birder who shares their lists. Updated {date}. [How Wildlife Network works](/methods)." v={{ records: fmt(s.records), place: s.name, from: FROM, to: TO, date: INDIA_STATES_GENERATED }} />
        </p>
      </div>
    </main>
  );
}

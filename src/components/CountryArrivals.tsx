import Link from "next/link";
import { TR } from "@/components/TR";
import { BirdTable } from "@/components/CityBirds";
import { sql } from "@/lib/db";
import { getNames } from "@/lib/names";
import { SITE, speciesSlug } from "@/lib/site";
import { COUNTRIES, COUNTRY_GENERATED, COUNTRY_YEARS, OWN_PAGE, hasPage, inName, seasonHeading, type CMigrant, type Country, type Status } from "@/lib/countries";
import PLACES from "@/data/places.json";

// /arrivals/<country>: rendered by src/app/arrivals/[region]/page.tsx when the slug is a country of src/data/country-seasons.json.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const [FROM, TO] = COUNTRY_YEARS;
export const fmtRecords = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : n.toLocaleString("en-GB"));
const listNames = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}` : xs[0] ?? "");
const nm = (m: CMigrant) => m[1] ?? m[0];
const by = (c: Country, st: Status) => c.migrants.filter((m) => m[2] === st);
const mode = (xs: (number | null)[]) => {
  const n = new Map<number, number>();
  for (const x of xs) if (x) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

export const countryTitle = (c: Country) => `Migratory birds in ${inName(c)}: when they arrive and leave`;
export function countryDescription(c: Country) {
  const main = (by(c, "winter").length >= by(c, "summer").length ? "winter" : "summer") as Status;
  const list = by(c, main), where = inName(c);
  const full = `${list.length} ${main} visitors come to ${where}, among them ${listNames(list.slice(0, 3).map(nm))}. See the months each is here and what is arriving now, from ${fmtRecords(c.records)} records.`;
  return full.length <= 160 ? full : `${list.length} ${main} visitors come to ${where}. See the months each is here and what is arriving now, from ${fmtRecords(c.records)} records.`;
}

function faq(c: Country): [string, string][] {
  const where = inName(c), out: [string, string][] = [];
  for (const st of ["winter", "summer"] as Status[]) {
    const l = by(c, st);
    if (l.length < 3) continue;
    const arr = mode(l.map((m) => m[4])), lv = mode(l.map((m) => m[5]));
    out.push([`Which birds come to ${where} in ${st}?`,
      `About ${l.length} species, going by ten years of records. Among the most recorded are ${listNames(l.slice(0, 6).map(nm))}.${arr ? ` Most arrive in ${MONTHS[arr - 1]}${lv ? ` and leave again by ${MONTHS[lv - 1]}` : ""}.` : ""}`]);
  }
  out.push(["How is this worked out?",
    `From ${fmtRecords(c.records)} bird records in ${where} from ${FROM} to ${TO}, shared openly through GBIF, most of them from eBird. Each species is compared with all birds recorded in the same ${c.regions >= 2 ? "region" : "country"} and month, so it does not look common just because more people go birding then.${c.regions >= 2 ? ` A bird is listed only when at least two of the ${c.regions} busiest regions show the same pattern.` : ""}`]);
  return out;
}

/** Literal keys, one per wording, so `pnpm i18n:body` finds them all. */
function SeasonHeading({ st, c }: { st: Status; c: Country }) {
  switch (seasonHeading(st, c)) {
    case "Winter visitors": return <TR k="Winter visitors" />;
    case "Summer visitors": return <TR k="Summer visitors" />;
    case "Visitors in the northern winter": return <TR k="Visitors in the northern winter" />;
    case "Visitors in the northern summer": return <TR k="Visitors in the northern summer" />;
    case "Visitors in the southern winter": return <TR k="Visitors in the southern winter" />;
    case "Visitors in the southern summer": return <TR k="Visitors in the southern summer" />;
    default: return <TR k="Passing through" />;
  }
}
function SeasonNote({ st, c }: { st: Status; c: Country }) {
  if (st === "passage") return <TR k="Seen mostly for a few weeks in spring or autumn, on the way somewhere else." />;
  // Visitors of the cold months come from breeding grounds elsewhere; those of the warm months often come to breed.
  const cold = st === "winter";
  return c.south === cold
    ? (cold ? <TR k="Here mainly from about May to August, from breeding grounds elsewhere. Most recorded first." /> : <TR k="Here mainly from about May to August, often to breed. Most recorded first." />)
    : (cold ? <TR k="Here mainly from about November to February, from breeding grounds elsewhere. Most recorded first." /> : <TR k="Here mainly from about November to February, often to breed. Most recorded first." />);
}

function Months({ p }: { p: number[] }) {
  return (
    <span className="inline-flex gap-px align-middle" aria-hidden>
      {p.map((v, i) => <span key={i} title={SHORT[i]} className="h-3 w-2 rounded-[1px]" style={{ background: `rgba(34, 211, 238, ${Math.max(0.08, v)})` }} />)}
    </span>
  );
}

function List({ items, thumbs, pages }: { items: CMigrant[]; thumbs: Map<string, string>; pages: Set<string> }) {
  return (
    <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((m) => {
        const [sci, en, , , arrive, leave, p] = m;
        return (
          <li key={sci} className="flex items-center gap-3 text-sm">
            {thumbs.get(sci)
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={thumbs.get(sci)} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 shrink-0 rounded object-cover" />
              : <span className="h-10 w-10 shrink-0 rounded bg-white/5" />}
            <span className="min-w-0">
              {pages.has(sci)
                ? <Link href={`/species/${speciesSlug(sci)}`} prefetch={false} className="text-cyan-400 hover:underline">{en ?? sci}</Link>
                : <span className="text-slate-100">{en ?? sci}</span>}
              {en && <span className="text-slate-400 italic"> {sci}</span>}
              <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-400"><Months p={p} />
                {arrive && leave ? <TR k="{arrive} to {leave}" v={{ arrive: SHORT[arrive - 1], leave: SHORT[leave - 1] }} />
                  : arrive ? <TR k="arrives in {month}" v={{ month: SHORT[arrive - 1] }} /> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function CountryArrivals({ c }: { c: Country }) {
  const where = inName(c), title = countryTitle(c);
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
  const names = await getNames(c.top.map((x) => x[0])).catch(() => ({}));
  const cities = (PLACES as { slug: string; name: string; country: string }[]).filter((p) => p.slug.endsWith(`-${c.iso.toLowerCase()}`));
  const sections = (["winter", "summer", "passage"] as Status[]).map((st) => ({ st, items: by(c, st) })).filter((x) => x.items.length);
  const FAQ = faq(c);
  const url = `${SITE}/arrivals/${c.slug}`;
  const others = COUNTRIES.filter((x) => x.slug !== c.slug && (hasPage(x) || OWN_PAGE.has(x.slug)));
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", "@id": url, url, name: title, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Country", name: c.name }, dateModified: COUNTRY_GENERATED },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Wildlife Network", item: SITE },
        { "@type": "ListItem", position: 2, name: "Arrivals", item: `${SITE}/arrivals` },
        { "@type": "ListItem", position: 3, name: c.name, item: url },
      ] },
      { "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400">
          <Link href="/arrivals" className="text-cyan-400 hover:underline"><TR k="Arrivals" /></Link> / {c.name}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Migratory birds in {place}: when they arrive and leave" v={{ place: where }} /></h1>
        <p className="mt-3">
          <TR k="These are the birds that come to {place} for part of the year, and the months each one is here, worked out from {records} bird records from {from} to {to}." v={{ place: where, records: fmtRecords(c.records), from: FROM, to: TO }} />
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
          <Link href={`/?lat=${c.centre[0]}&lon=${c.centre[1]}`} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><TR k="See it on the live map" /></Link>
          <Link href="/alerts" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><TR k="Get an email when a bird arrives near you" /></Link>
        </p>

        {sections.map(({ st, items }) => (
          <section key={st}>
            <h2 className="mt-10 text-xl font-semibold text-slate-100"><SeasonHeading st={st} c={c} /> <span className="text-sm font-normal text-slate-400">{items.length}</span></h2>
            <p className="mt-1 text-sm text-slate-400"><SeasonNote st={st} c={c} /></p>
            <List items={items} thumbs={thumbs} pages={pages} />
          </section>
        ))}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Birds of {place} through the year" v={{ place: where }} /></h2>
        <p className="mt-1 text-sm text-slate-400"><TR k="The {n} birds recorded most in {place}, residents and visitors together. The strip shows the months each is recorded, darker where it makes up more of what people record that month." v={{ n: c.top.length, place: where }} /></p>
        <BirdTable species={c.top} names={names} linked={pages} />

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Questions" /></h2>
        <dl className="mt-3 space-y-4">
          {FAQ.map(([q, a]) => <div key={q}><dt className="font-medium text-slate-100">{q}</dt><dd className="mt-1">{a}</dd></div>)}
        </dl>

        {cities.length > 0 && (<>
          <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Birds around cities in {place}" v={{ place: where }} /></h2>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {cities.map((p) => <Link key={p.slug} href={`/places/${p.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{p.name}</Link>)}
          </p>
        </>)}
        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Other countries" /></h2>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {others.map((x) => <Link key={x.slug} href={`/arrivals/${x.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{x.name}</Link>)}
        </p>

        <p className="mt-10 text-xs text-slate-400">
          <TR k="Data: {records} bird records in {place} from {from} to {to}, under CC0 or CC BY 4.0, from [GBIF.org](https://www.gbif.org), most of them from the [eBird](https://ebird.org) Observation Dataset of the Cornell Lab of Ornithology. Thanks to every birder who shares their lists. Updated {date}. [How Wildlife Network works](/methods)." v={{ records: fmtRecords(c.records), place: where, from: FROM, to: TO, date: COUNTRY_GENERATED }} />
        </p>
      </div>
    </main>
  );
}

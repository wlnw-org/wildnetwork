import Link from "next/link";
import { TR } from "@/components/TR";
import { LocalName } from "@/components/T";
import { speciesSlug } from "@/lib/site";
import DATA from "@/data/place-birds.json";

/** [scientific name, English name, records, months as 12 digits 0 to 9] from scripts/place-birds.mts. */
export type Row = [string, string | null, number, string];
const CITIES = DATA.cities as unknown as Record<string, { records: number; species: Row[] }>;
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function cityBirds(slug: string) {
  const c = CITIES[slug];
  return c && c.species.length >= 10 ? c : null;
}

/** "All year", or the longest run of months at 3 or more (wrapping round the year). */
function season(m: string): { all: true } | { from: number; to: number } {
  const v = [...m].map(Number), on = v.map((x) => x >= 3);
  if (on.every(Boolean)) return { all: true };
  let best = { from: 0, len: 0 };
  for (let s = 0; s < 12; s++) {
    if (!on[s] || on[(s + 11) % 12]) continue;
    let len = 0;
    while (len < 12 && on[(s + len) % 12]) len++;
    if (len > best.len) best = { from: s, len };
  }
  return { from: best.from, to: (best.from + best.len - 1) % 12 };
}

export default function CityBirds({ slug, place, names, linked }: { slug: string; place: string; names: Record<string, Record<string, string> | undefined>; linked: Set<string> }) {
  const c = cityBirds(slug);
  if (!c) return null;
  return (
    <section>
      <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100"><TR k="Birds of {place} through the year" v={{ place }} /></h2>
      <p className="text-sm text-slate-400">
        <TR k="The {n} birds recorded most within 50 km of {place}, from {records} open bird records made between {from} and {to}. The strip shows the months each is recorded, darker where it makes up more of what people record that month." v={{ n: c.species.length, place, records: c.records.toLocaleString("en-GB"), from: DATA.years[0], to: DATA.years[1] }} />
      </p>
      <BirdTable species={c.species} names={names} linked={linked} />
      <p className="mt-2 text-xs text-slate-400">
        <TR k="Source: GBIF.org, bird records under CC0 and CC BY 4.0, mostly from the eBird Observation Dataset (Cornell Lab of Ornithology). Where people go birding shapes these lists, so quiet or hard to see birds can be missing." />
      </p>
    </section>
  );
}

/** The species table: name, main months, and a 12 month strip. Shared with the India state pages. */
export function BirdTable({ species, names, linked }: { species: Row[]; names: Record<string, Record<string, string> | undefined>; linked: Set<string> }) {
  return (
    <table className="mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-slate-400 border-b border-white/10">
          <th className="py-1.5 font-medium"><TR k="Species" /></th>
          <th className="font-medium hidden sm:table-cell"><TR k="When" /></th>
          <th className="font-medium"><span className="inline-flex gap-px" aria-hidden>{SHORT.map((m) => <span key={m} className="w-3 text-center text-[9px]">{m[0]}</span>)}</span></th>
        </tr>
      </thead>
      <tbody>
        {species.map(([sci, en, , m]) => {
          const s = season(m);
          const name = <LocalName en={en ?? sci} names={names[sci]} />;
          return (
            <tr key={sci} className="border-b border-white/5">
              <td className="py-1.5 pr-2">
                {linked.has(sci) ? <Link href={`/species/${speciesSlug(sci)}`} className="text-cyan-400 hover:underline">{name}</Link> : name}
                <span className="hidden md:inline text-slate-500 italic"> {sci}</span>
              </td>
              <td className="text-slate-400 hidden sm:table-cell whitespace-nowrap pr-2">
                {"all" in s ? <TR k="All year" /> : <TR k="Mainly {from} to {to}" v={{ from: SHORT[s.from], to: SHORT[s.to] }} />}
              </td>
              <td>
                <span className="inline-flex gap-px align-middle" role="img" aria-label={"all" in s ? "All year" : `Mainly ${SHORT[s.from]} to ${SHORT[s.to]}`}>
                  {[...m].map((d, i) => <span key={i} title={SHORT[i]} className="h-3 w-3 rounded-[1px]" style={{ background: `rgba(34, 211, 238, ${Math.max(0.06, Number(d) / 9)})` }} />)}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Cities whose checklist has this species in its top 15, most records first (for links on species pages). */
export function citiesFor(sci: string, places: { slug: string; name: string }[]) {
  return places.map((p) => {
    const i = CITIES[p.slug]?.species.findIndex((x) => x[0] === sci) ?? -1;
    return i >= 0 && i < 15 ? { ...p, n: CITIES[p.slug].species[i][2] } : null;
  }).filter((x) => x !== null).sort((a, b) => b.n - a.n);
}

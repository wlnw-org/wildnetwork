import type { Metadata } from "next";
import { TR } from "@/components/TR";
import Link from "next/link";
import { LocalName, T, TDate } from "@/components/T";
import { getNames } from "@/lib/names";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GROUP_LABEL } from "@/lib/studies";
import { PLACE_GROUPS, placeBySlug, placeLabel, placeReport } from "@/lib/places";
import { SITE, speciesSlug } from "@/lib/site";
import { sql } from "@/lib/db";
import CityBirds, { cityBirds } from "@/components/CityBirds";

export const revalidate = 86400;
// Built on first visit and cached. The class is part of the path (/places/<slug>/<class>), not a query, so pages can cache.
export async function generateStaticParams() { return []; }

const place = cache((slug: string) => placeBySlug(slug));
const pick = (g?: string) => ((PLACE_GROUPS as readonly string[]).includes(g ?? "") ? g! : "avian");

export type Props = { params: Promise<{ slug: string; group?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, group } = await params;
  const p = await place(slug);
  if (!p) return { title: "Place not found" };
  const grp = pick(group);
  const r = await placeReport(p.lat, p.lon, grp);
  const what = (GROUP_LABEL[grp] ?? "Birds").toLowerCase();
  const city = grp === "avian" ? cityBirds(p.slug) : null;
  const title = city ? `Birds of ${p.name}: which birds, and when` : `${GROUP_LABEL[grp] ?? "Birds"} around ${p.name}: arriving now`;
  const description = city
    ? `Birds of ${p.name} month by month: ${city.species.slice(0, 3).map((x) => x[1] ?? x[0]).join(", ")} and ${city.species.length - 3} more, from ${city.records >= 1e6 ? `${(city.records / 1e6).toFixed(1)} million` : `${Math.round(city.records / 1e3)},000`} open records. Plus which birds are arriving now.`.slice(0, 160)
    : `Which ${what} are arriving around ${placeLabel(p)} now and in the coming weeks, and which are recorded most, from acoustic stations and open records.`;
  return {
    title, description,
    alternates: { canonical: `/places/${p.slug}${grp === "avian" ? "" : `/${grp}`}` },
    robots: city || r.top.length || r.arrivals ? undefined : { index: false },
    openGraph: { title, description, url: `/places/${p.slug}`, type: "article" },
  };
}

export default async function PlacePage({ params }: Props) {
  const { slug, group } = await params;
  const p = await place(slug);
  if (!p) notFound();
  if (group !== undefined && (group === "avian" || pick(group) !== group)) notFound();
  const grp = pick(group);
  const r = await placeReport(p.lat, p.lon, grp);
  const label = GROUP_LABEL[grp] ?? "Birds";
  const url = `${SITE}/places/${p.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: `${label} around ${p.name}`, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Place", name: placeLabel(p), geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lon } } },
    ],
  };
  const city = grp === "avian" ? cityBirds(p.slug) : null;
  const citySci = city?.species.map((x) => x[0]) ?? [];
  const names = await getNames([...[...r.recent, ...r.coming, ...r.top].map((x) => x.scientific_name), ...citySci]);
  // Only species with a page are linked (a page exists for every species in species_group).
  const linked = new Set(citySci.length ? (await sql<{ scientific_name: string }[]>`
    SELECT scientific_name FROM species_group WHERE scientific_name IN ${sql(citySci)} AND is_species`.catch(() => [])).map((x) => x.scientific_name) : []);
  const Species = ({ name, vern }: { name: string; vern: string | null }) => (
    <Link href={`/species/${speciesSlug(name)}`} className="text-cyan-400 hover:underline"><LocalName en={vern ?? name} names={names[name]} /></Link>
  );
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400 flex items-center gap-2">
          <span><Link href="/places" className="text-cyan-400 hover:underline"><T k="Places" /></Link></span>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><T k={`${label} around {place}`} v={{ place: p.name }} /></h1>
        <p className="mt-1 text-sm text-slate-400">{placeLabel(p)}</p>
        <p className="mt-3 text-sm text-slate-400">
          <T k="This covers the wider area around {place}, about 550 km across, not the city alone." v={{ place: p.name }} />{" "}
          <T k="We compare each species with everything recorded in the same weeks, so busy recorders do not skew the list." />{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline"><T k="Methods" /></Link>
        </p>
        {r.watched === 0 && !city && (
          <p className="mt-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
            <T k="Few recordings reach us from this area yet, so there is little to show." />{" "}
            <Link href="/contribute" className="font-medium text-cyan-300 underline"><T k="Add a station to fill the gap." /></Link>
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Animal class">
          {PLACE_GROUPS.map((g) => (
            <Link key={g} href={`/places/${p.slug}${g === "avian" ? "" : `/${g}`}`}
              className={`rounded px-2.5 py-1 ${g === grp ? "bg-white/90 text-slate-900 font-medium" : "bg-white/5 hover:bg-white/10"}`}><T k={GROUP_LABEL[g]} /></Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href={`/?lat=${p.lat.toFixed(2)}&lon=${p.lon.toFixed(2)}`} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><T k="Open on the live map" /></Link>
          <Link href="/studies/new" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><T k="Track this area (for researchers)" /></Link>
          <Link href={`/report?lat=${p.lat.toFixed(4)}&lon=${p.lon.toFixed(4)}`} className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><T k="Site report: compare two periods" /></Link>
        </div>

        {p.country === "United Kingdom" && (
          <p className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-sm">
            <TR k="When do swallows, cuckoos and swifts arrive? See [when birds arrive in the UK](/arrivals/uk)." />
          </p>
        )}
        {p.country === "India" && (
          <p className="mt-4 rounded-lg border border-cyan-400/30 bg-cyan-400/5 p-3 text-sm">
            <TR k="Which birds come to India for the winter, and when? See [migratory birds in India](/arrivals/india), month by month." />
          </p>
        )}

        {city && <CityBirds slug={p.slug} place={p.name} names={names} linked={linked} />}

        <H2><T k="Arrived in the last four weeks" /></H2>
        <List items={r.recent} empty={<T k="None arrived here in these weeks last year, as far as the records show." />} render={(a) => <><Species name={a.scientific_name} vern={a.vernacular_name} /> <span className="text-slate-400"><TDate k="around {d}" iso={a.arrival} /></span></>} />

        <H2><T k="Expected in the next six weeks" /></H2>
        <List items={r.coming} empty={<T k="No arrivals expected here in the next six weeks, going by last year." />} render={(a) => <><Species name={a.scientific_name} vern={a.vernacular_name} /> <span className="text-slate-400"><TDate k="around {d}" iso={a.arrival} />{a.support != null && a.support < 0.5 ? <> <T k="(weak evidence)" /></> : null}</span></>} />
        <p className="mt-2 text-xs text-slate-400"><T k="Dates are last year's first regular records after at least six weeks away, with each species' own uncertainty on its page. Each species page can email you when it turns up." /></p>

        <H2><T k="Most recorded, last eight weeks" /></H2>
        {r.top.length === 0 ? <p className="text-slate-400"><T k="No records here in the last eight weeks." /></p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium"><T k="Species" /></th><th className="font-medium text-right"><T k="Records" /></th><th className="font-medium text-right"><T k="In every 1,000 records" /></th></tr></thead>
            <tbody>{r.top.map((x) => (
              <tr key={x.scientific_name} className="border-b border-white/5">
                <td className="py-1.5"><Species name={x.scientific_name} vern={x.vernacular_name} /> <span className="text-slate-400 italic">{x.scientific_name}</span></td>
                <td className="text-right tabular-nums">{x.n.toLocaleString("en-GB")}</td><td className="text-right tabular-nums">{x.share.toFixed(1)}</td>
              </tr>))}</tbody>
          </table>
        )}

        <H2><T k="How well this area is covered" /></H2>
        <p>
          <T k="Watched in {w} of the last 12 weeks (enough records to count; unwatched weeks say nothing about absence)." v={{ w: r.watched }} />{" "}
          {r.stations.length > 0
            ? <T k="Active stations here in the last 30 days: {list}." v={{ list: r.stations.map((s) => `${s.n} ${s.source_system === "birdweather" ? "BirdWeather" : s.source_system}`).join(", ") }} />
            : <T k="No active stations in this area: records come from observers." />}
          {" "}<Link href="/contribute" className="text-cyan-400 hover:underline"><T k="Add a station to fill the gap." /></Link>
        </p>
      </div>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">{children}</h2>;
}

function List<I>({ items, empty, render }: { items: I[]; empty: React.ReactNode; render: (x: I) => React.ReactNode }) {
  if (!items.length) return <p className="text-slate-400">{empty}</p>;
  return <ul className="mt-2 space-y-1">{items.slice(0, 30).map((x, i) => <li key={i}>{render(x)}</li>)}</ul>;
}

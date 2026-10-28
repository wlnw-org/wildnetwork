import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { GROUP_LABEL } from "@/lib/studies";
import { PLACE_GROUPS, placeBySlug, placeLabel, placeReport } from "@/lib/places";
import { SITE, speciesSlug } from "@/lib/site";

export const revalidate = 86400;

const place = cache((slug: string) => placeBySlug(slug));
const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const pick = (g?: string) => ((PLACE_GROUPS as readonly string[]).includes(g ?? "") ? g! : "avian");

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ group?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const p = await place((await params).slug);
  if (!p) return { title: "Place not found" };
  const grp = pick((await searchParams).group);
  const r = await placeReport(p.lat, p.lon, grp);
  const what = (GROUP_LABEL[grp] ?? "Birds").toLowerCase();
  const title = `${GROUP_LABEL[grp] ?? "Birds"} around ${p.name}: arriving now and most recorded`;
  const description = `Which ${what} are arriving around ${placeLabel(p)} now and in the coming weeks, and which are recorded most, from acoustic stations and open records, effort corrected.`;
  return {
    title, description,
    alternates: { canonical: `/places/${p.slug}${grp === "avian" ? "" : `?group=${grp}`}` },
    robots: r.top.length || r.arrivals ? undefined : { index: false },
    openGraph: { title, description, url: `/places/${p.slug}`, type: "article" },
  };
}

export default async function PlacePage({ params, searchParams }: Props) {
  const p = await place((await params).slug);
  if (!p) notFound();
  const grp = pick((await searchParams).group);
  const r = await placeReport(p.lat, p.lon, grp);
  const label = GROUP_LABEL[grp] ?? "Birds";
  const box = `${r.cell.lat}° to ${r.cell.lat + 5}° latitude, ${r.cell.lon}° to ${r.cell.lon + 5}° longitude`;
  const url = `${SITE}/places/${p.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: `${label} around ${p.name}`, isPartOf: { "@id": `${SITE}/#website` },
        about: { "@type": "Place", name: placeLabel(p), geo: { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lon } } },
    ],
  };
  const Species = ({ name, vern }: { name: string; vern: string | null }) => (
    <Link href={`/species/${speciesSlug(name)}`} className="text-cyan-400 hover:underline">{vern ?? name}</Link>
  );
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / Places</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{label} around {p.name}</h1>
        <p className="mt-1 text-sm text-slate-400">{placeLabel(p)}</p>
        <p className="mt-3 text-sm text-slate-400">
          Every measure here is worked out per 5 degree square, so this covers the wider area around {p.name} ({box}, about 550 km across), not the city alone.
          Counts are shares of all {label.toLowerCase()} records in the same weeks, so busier stations do not inflate them (<Link href="/methods" className="text-cyan-400 hover:underline">methods</Link>).
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Animal class">
          {PLACE_GROUPS.map((g) => (
            <Link key={g} href={`/places/${p.slug}${g === "avian" ? "" : `?group=${g}`}`}
              className={`rounded px-2.5 py-1 ${g === grp ? "bg-white/90 text-slate-900 font-medium" : "bg-white/5 hover:bg-white/10"}`}>{GROUP_LABEL[g]}</Link>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <Link href={`/?lat=${p.lat.toFixed(2)}&lon=${p.lon.toFixed(2)}`} className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400">Open on the live map</Link>
          <Link href="/studies/new" className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5">Make it a study area</Link>
        </div>

        <H2>Arrived in the last four weeks</H2>
        <List items={r.recent} empty={`No ${label.toLowerCase()} arrived here in these weeks last year, as far as the records show.`} render={(a) => <><Species name={a.scientific_name} vern={a.vernacular_name} /> <span className="text-slate-500">around {fmt(a.arrival)}</span></>} />

        <H2>Expected in the next six weeks</H2>
        <List items={r.coming} empty="No arrivals expected here in the next six weeks, going by last year." render={(a) => <><Species name={a.scientific_name} vern={a.vernacular_name} /> <span className="text-slate-500">around {fmt(a.arrival)}{a.support != null && a.support < 0.5 ? " (weak evidence)" : ""}</span></>} />
        <p className="mt-2 text-xs text-slate-500">Dates are last year&apos;s first regular records after at least six weeks away, with each species&apos; own uncertainty on its page. Each species page can email you when it turns up.</p>

        <H2>Most recorded, last eight weeks</H2>
        {r.top.length === 0 ? <p className="text-slate-500">No {label.toLowerCase()} records in this area in the last eight weeks.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium">Species</th><th className="font-medium text-right">Records</th><th className="font-medium text-right">Per 1,000</th></tr></thead>
            <tbody>{r.top.map((x) => (
              <tr key={x.scientific_name} className="border-b border-white/5">
                <td className="py-1.5"><Species name={x.scientific_name} vern={x.vernacular_name} /> <span className="text-slate-500 italic">{x.scientific_name}</span></td>
                <td className="text-right tabular-nums">{x.n.toLocaleString("en-GB")}</td><td className="text-right tabular-nums">{x.share.toFixed(1)}</td>
              </tr>))}</tbody>
          </table>
        )}

        <H2>How well this area is covered</H2>
        <p>
          Watched in {r.watched} of the last 12 weeks for {label.toLowerCase()} (enough records to count; unwatched weeks say nothing about absence).
          {r.stations.length > 0
            ? <> Active stations here in the last 30 days: {r.stations.map((s) => `${s.n} ${s.source_system === "birdweather" ? "BirdWeather" : s.source_system}`).join(", ")}.</>
            : " No active stations in this area: records come from observers."}
          {" "}<Link href="/contribute" className="text-cyan-400 hover:underline">Add a station</Link> to fill the gap.
        </p>
      </div>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">{children}</h2>;
}

function List<T>({ items, empty, render }: { items: T[]; empty: string; render: (x: T) => React.ReactNode }) {
  if (!items.length) return <p className="text-slate-500">{empty}</p>;
  return <ul className="mt-2 space-y-1">{items.slice(0, 30).map((x, i) => <li key={i}>{render(x)}</li>)}</ul>;
}

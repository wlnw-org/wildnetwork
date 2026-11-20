import type { Metadata } from "next";
import Link from "next/link";
import CopyBlock from "@/components/CopyBlock";
import HelpLink from "@/components/HelpLink";
import StationFeed, { LastHeard, StationSpecies } from "@/components/StationFeed";
import { TR } from "@/components/TR";
import { SITE } from "@/lib/site";
import { GROUP_MAX, loadStations, stationFeed, stationIdFromSlug, stationSpecies } from "@/lib/stations";

// Reads ?ids=, so it renders per request (never ISR); the queries read only the listed stations' rows.
export const metadata: Metadata = {
  title: "Station group",
  description: "Newest detections and species from a group of stations.",
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function StationGroup({ searchParams }: Props) {
  const p = await searchParams;
  // Comma separated (shared links) or repeated (the picker form on /stations).
  const raw = [p.ids ?? []].flat().join(",").split(",").map((s) => s.trim()).filter(Boolean);
  const asked = [...new Set(raw)].slice(0, GROUP_MAX);
  const ids = asked.map(stationIdFromSlug).filter((x): x is string => !!x);
  const stations = await loadStations(ids);
  const [feed, species] = await Promise.all([stationFeed(stations), stationSpecies(stations)]);
  const skipped = asked.length - stations.length + Math.max(0, new Set(raw).size - GROUP_MAX);
  const labels = Object.fromEntries(stations.map((s) => [s.id, { name: s.name ?? s.id.split(":").slice(1).join(":"), slug: s.slug }]));
  const keepDays = Math.min(30, ...stations.map((s) => s.keepDays));
  const link = `${SITE}/stations/group?ids=${stations.map((s) => s.slug).join(",")}`;
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="text-sm"><Link href="/stations" className="text-cyan-400 hover:underline"><TR k="All stations" /></Link></p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Station group" /></h1>
        <HelpLink to="/help/site/station-pages" />
        {skipped > 0 && <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"><TR k="{n} of the stations in this link could not be shown: they do not exist, have no public page, or have been quiet too long. A group holds up to 20 stations." v={{ n: skipped }} /></p>}
        {stations.length === 0 ? (
          <p className="mt-4"><TR k="No stations to show. Pick stations on the [stations list](/stations#direct) to make a group link." /></p>
        ) : (
          <>
            <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Stations in this group" /></h2>
            <ul className="mt-3 space-y-1.5 text-sm">
              {stations.map((s) => (
                <li key={s.id} className="flex flex-wrap gap-x-3">
                  <Link href={`/stations/${s.slug}`} className="text-cyan-400 hover:underline [overflow-wrap:anywhere]">{labels[s.id].name}</Link>
                  <span className="text-slate-400"><LastHeard iso={s.lastHeard} /></span>
                </li>
              ))}
            </ul>

            <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Latest detections" /></h2>
            <p className="mt-1 text-sm text-slate-400"><TR k="Updates every minute while this page is open. Times are in your own time zone." /></p>
            <StationFeed ids={stations.map((s) => s.id)} initial={feed} labels={labels} />

            <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Species heard" /></h2>
            <p className="mt-1 text-sm text-slate-400"><TR k="Across all stations in this group. We keep the last {n} days of detections from most stations." v={{ n: keepDays }} /></p>
            <StationSpecies rows={species} keepDays={keepDays} group />

            <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Share this group" /></h2>
            <CopyBlock wrap>{link}</CopyBlock>
          </>
        )}
      </div>
    </main>
  );
}

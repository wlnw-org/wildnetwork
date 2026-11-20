import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import CopyBlock from "@/components/CopyBlock";
import HelpLink from "@/components/HelpLink";
import StationFeed, { LastHeard, StationSpecies } from "@/components/StationFeed";
import { TR } from "@/components/TR";
import { SITE } from "@/lib/site";
import { creditFor } from "@/lib/sources";
import { KIND_LABEL, SOURCE_LABEL } from "@/app/stations/labels";
import { loadStations, stationFeed, stationHours, stationIdFromSlug, stationSpecies, stationTimeZone } from "@/lib/stations";

// Five minutes: the live list refreshes itself in the browser, so the page only needs the summary to be roughly current.
export const revalidate = 300;
// Built on first visit and cached (see CACHING in the project notes).
export async function generateStaticParams() { return []; }

type Props = { params: Promise<{ slug: string }> };

const load = cache(async (slug: string) => {
  const id = stationIdFromSlug(slug);
  if (!id) return null;
  const [st] = await loadStations([id]);
  if (!st) return null;
  const [feed, species, tz] = await Promise.all([stationFeed([st]), stationSpecies([st]), stationTimeZone(st)]);
  const hours = await stationHours(st, tz ?? "UTC").catch(() => stationHours(st, "UTC"));
  return { st, feed, species, tz, hours };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Station not found", robots: { index: false } };
  return {
    title: d.st.name ?? "Station",
    description: "What this station has heard lately: newest detections, species and busiest hours.",
    // Owners have not opted in to search engines, so station pages stay out of them (and out of the sitemap).
    robots: { index: false, follow: true },
  };
}

const fmt = (iso: string, tz: string | null) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: tz ?? "UTC" }) + (tz ? "" : " UTC");

export default async function StationPage({ params }: Props) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const { st, feed, species, tz, hours } = d;
  const credit = creditFor(st.source);
  const max = Math.max(1, ...hours);
  const top = hours.map((n, h) => ({ n, h })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3).map((x) => `${String(x.h).padStart(2, "0")}:00`);
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="text-sm"><Link href="/stations" className="text-cyan-400 hover:underline"><TR k="All stations" /></Link></p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-100 [overflow-wrap:anywhere]">{st.name ?? st.id.split(":").slice(1).join(":")}</h1>
        <HelpLink to="/help/site/station-pages" />
        <p className="mt-2 text-slate-400">
          {KIND_LABEL[st.sensorType ?? ""] ?? <TR k="Station" />}{SOURCE_LABEL[st.source] ? <> · {SOURCE_LABEL[st.source]}</> : null}
          {st.sensorModel ? <> · {st.sensorModel}</> : null}
        </p>
        <p className="mt-3 font-medium text-slate-100"><LastHeard iso={st.lastHeard} /></p>
        {credit && <p className="mt-1 text-sm"><a href={credit.url} target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline">{credit.text}</a></p>}

        <p className="mt-4">
          <TR k="About {lat}°, {lon}°, rounded to about 1 km." v={{ lat: st.lat, lon: st.lon }} />{" "}
          <Link href={`/?lat=${st.lat}&lon=${st.lon}`} className="text-cyan-400 hover:underline"><TR k="See the area on the map" /></Link>
          {" · "}
          <Link href={`/report?lat=${st.lat}&lon=${st.lon}&km=10`} className="text-cyan-400 hover:underline"><TR k="Report for this area" /></Link>
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Latest detections" /></h2>
        <p className="mt-1 text-sm text-slate-400"><TR k="Updates every minute while this page is open. Times are in your own time zone." /></p>
        <StationFeed ids={[st.id]} initial={feed} />

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Species heard" /></h2>
        <p className="mt-1 text-sm text-slate-400">
          <TR k="We keep the last {n} days of detections from this station." v={{ n: st.keepDays }} />{" "}
          {st.firstKept && st.lastKept && <TR k="The oldest we keep is from {first}, the newest from {last}." v={{ first: fmt(st.firstKept, tz), last: fmt(st.lastKept, tz) }} />}
        </p>
        <StationSpecies rows={species} keepDays={st.keepDays} />

        {st.total > 0 && (
          <>
            <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Busiest hours" /></h2>
            <p className="mt-1 text-sm text-slate-400">
              {tz ? <TR k="Detections per hour of the day, in the station's local time ({tz})." v={{ tz }} /> : <TR k="Detections per hour of the day, in UTC (we could not tell the station's time zone)." />}
              {top.length > 0 && <> <TR k="Busiest: {hours}." v={{ hours: top.join(", ") }} /></>}
            </p>
            <div className="mt-3 flex h-28 items-end gap-[3px]" role="img" aria-label={`Busiest hours: ${top.join(", ")}`}>
              {hours.map((n, h) => (
                <div key={h} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${String(h).padStart(2, "0")}:00 ${n}`}>
                  <div className="w-full rounded-t bg-cyan-500/70" style={{ height: `${Math.max(n ? 4 : 1, (n / max) * 88)}px` }} />
                  <span className="text-[9px] text-slate-500">{h % 3 === 0 ? h : ""}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Share this station" /></h2>
        <CopyBlock wrap>{`${SITE}/stations/${st.slug}`}</CopyBlock>
        <p className="text-sm text-slate-400"><TR k="Want one page for several stations? Pick them on the [stations list](/stations#direct) and copy the group link." /></p>
        <p className="mt-6 text-sm text-slate-500"><TR k="Station pages show the name the owner gave, a position rounded to about 1 km and what the station detected. Test stations and device health are never shown, and sensitive species are not named." /></p>
      </div>
    </main>
  );
}

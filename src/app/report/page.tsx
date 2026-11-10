import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Link from "next/link";
import { T } from "@/components/T";
import MapPick from "@/components/MapPick";
import { searchPlaces } from "@/lib/places";
import { GROUP_LABEL } from "@/lib/studies";
import { SITE, speciesSlug } from "@/lib/site";
import CopyBlock from "@/components/CopyBlock";
import { credits, type Credit } from "@/lib/datasets";
import DownloadLink from "@/components/DownloadLink";
import { openRecordsHref } from "@/lib/openRecords";
import { parseReportQuery, REPORT_GROUPS, REPORT_LIMITS, reportHref, siteReport, type PeriodSummary, type SiteReport, type SpeciesRow } from "@/lib/siteReport";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const n = sp.name;
  // The empty form is a landing page worth indexing (and in the sitemap); individual reports are not.
  const blank = !sp.lat && !sp.lon && !sp.place;
  const name = parseReportQuery({ lat: "0", lon: "0", name: Array.isArray(n) ? n[0] : n })?.name;
  return {
    title: name ? `${name}: site report` : "Site report: what changed at a place",
    description: "Pick a place, a radius and dates to see which species the listening stations around it recorded, week by week, and compare two periods, such as before and after a restoration.",
    ...(blank ? { alternates: { canonical: "/report" } } : { robots: { index: false, follow: true } }),
  };
}

export default async function ReportPage({ searchParams }: Props) {
  // A repeated URL parameter arrives as an array: use the first.
  const params = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  // A town name stands in for coordinates when none are given.
  let placeName: string | null = null;
  if ((!params.lat || !params.lon) && params.place) {
    const [p] = await searchPlaces(params.place, 1);
    if (p) { params.lat = String(p.lat); params.lon = String(p.lon); placeName = [p.name, p.country].filter(Boolean).join(", "); }
  }
  const q = parseReportQuery(params);
  const r = q ? await siteReport(q) : null;
  const contributed = r?.mode === "area" && r.cell ? await credits({ cell: r.cell }) : [];
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><T k="What changed at a place" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/reports" /></p>
        <p className="mt-3">
          <T k="Pick a place, a radius and dates. The report shows what the listening stations around it recorded, week by week, and can compare two periods, such as before and after a restoration, or this year and last." />{" "}
          <Link href="/methods#reports" className="text-cyan-400 hover:underline"><T k="Methods" /></Link>
        </p>
        <p className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3 text-sm">
          <T k="Need a species checklist for a district, protected area or your own boundary, to print or file?" />{" "}
          <Link href="/report/area" className="text-cyan-400 hover:underline"><T k="Make an area report" /></Link>
        </p>
        {r ? (
          <details className="mt-6 rounded-lg border border-white/10 group">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="text-slate-200">{[r.q.name, placeName ?? `${r.q.lat}, ${r.q.lon}`].filter(Boolean).join(" · ")} · {r.q.km} km · {r.q.a.from} … {r.q.a.to}{r.q.b ? ` / ${r.q.b.from} … ${r.q.b.to}` : ""}</span>
              <span className="ml-auto rounded-md border border-white/15 px-2.5 py-1 text-cyan-300 group-open:hidden"><T k="Edit" /></span>
              <span className="ml-auto hidden rounded-md border border-white/15 px-2.5 py-1 text-cyan-300 group-open:inline"><T k="Close" /></span>
            </summary>
            <Form params={params} q={q} fromPlace={placeName !== null} inner />
          </details>
        ) : <Form params={params} q={q} fromPlace={placeName !== null} />}
        {params.place && !q && <p className="mt-4 text-amber-300"><T k="Could not find that place. Try a nearby town, or enter coordinates." /></p>}
        {r && <Report r={r} placeName={placeName} contributed={contributed} />}
      </div>
    </main>
  );
}

/** When the point came from a town name, the town stays in its field and the coordinates are left empty, so a new town wins on the next search. */
function Form({ params, q, fromPlace, inner = false }: { params: Record<string, string | undefined>; q: ReturnType<typeof parseReportQuery>; fromPlace: boolean; inner?: boolean }) {
  const field = "mt-1 w-full min-w-0 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-slate-100";
  const label = "block text-sm text-slate-400";
  return (
    <form method="get" className={`grid grid-cols-2 gap-3 sm:grid-cols-4 p-4 ${inner ? "border-t border-white/10" : "mt-6 rounded-lg border border-white/10"}`}>
      <label className={`${label} col-span-2`}><T k="Town or place" /><input name="place" defaultValue={q && !fromPlace ? "" : params.place ?? ""} placeholder={"Chennai"} className={`${field} placeholder:text-slate-500 placeholder:italic`} /></label>
      <label className={label}><T k="Latitude" /><input name="lat" inputMode="decimal" defaultValue={fromPlace ? "" : q?.lat ?? ""} className={field} /></label>
      <label className={label}><T k="Longitude" /><input name="lon" inputMode="decimal" defaultValue={fromPlace ? "" : q?.lon ?? ""} className={field} /></label>
      <div className="col-span-2 sm:col-span-4 -mt-1"><MapPick /></div>
      <label className={`${label} col-span-2 sm:col-span-4`}><T k="Name of the place (optional, for example a park)" /><input name="name" maxLength={80} defaultValue={q?.name ?? params.name ?? ""} className={field} /></label>
      <label className={label}><T k="Radius (km)" /><input name="km" type="number" min={1} max={REPORT_LIMITS.MAX_KM} defaultValue={q?.km ?? REPORT_LIMITS.DEFAULT_KM} className={field} /></label>
      <label className={label}><T k="Animals" />
        <select name="group" defaultValue={q?.group ?? "all"} className={field}>
          {REPORT_GROUPS.map((g) => <option key={g} value={g}>{g === "all" ? "All" : GROUP_LABEL[g]}</option>)}
        </select>
      </label>
      <label className={label}><T k="From" /><input name="from" type="date" defaultValue={q?.a.from} className={field} /></label>
      <label className={label}><T k="To" /><input name="to" type="date" defaultValue={q?.a.to} className={field} /></label>
      <label className={label}><T k="Compare from (optional)" /><input name="from2" type="date" defaultValue={q?.b?.from} className={field} /></label>
      <label className={label}><T k="Compare to" /><input name="to2" type="date" defaultValue={q?.b?.to} className={field} /></label>
      <div className="col-span-2 sm:col-span-4 flex flex-wrap items-center gap-3">
        <button className="rounded-md bg-cyan-500 px-3 py-1.5 font-medium text-slate-950 hover:bg-cyan-400"><T k="Show report" /></button>
        <span className="text-xs text-slate-400"><T k="If you fill in both, the latitude and longitude are used. Periods up to three years." /></span>
      </div>
    </form>
  );
}

function Report({ r, placeName, contributed }: { r: SiteReport; placeName: string | null; contributed: Credit[] }) {
  const { q } = r;
  const kept = r.stations.filter((s) => s.kept);
  const others = r.stations.filter((s) => !s.kept);
  const bySource = Object.entries(others.reduce<Record<string, number>>((a, s) => ({ ...a, [s.source_system]: (a[s.source_system] ?? 0) + 1 }), {}));
  const btn = "rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5";
  const sourceName = (s: string) => (s === "birdweather" ? "BirdWeather" : s === "inaturalist" ? "iNaturalist" : s === "gbif" ? "GBIF" : s === "upload" ? "contributed datasets" : s);
  return (
    <>
      {q.name && <h2 className="mt-10 text-2xl font-semibold text-slate-100">{q.name}</h2>}
      {r.mode === "area"
        ? <H2><T k="Around {place}" v={{ place: placeName ?? `${q.lat}, ${q.lon}` }} /></H2>
        : <H2><T k="Within {km} km of {place}" v={{ km: q.km, place: placeName ?? `${q.lat}, ${q.lon}` }} /></H2>}
      {r.mode === "area" && r.cell && (
        <div role="note" className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          <p className="font-semibold"><T k="No station within {km} km, so this shows the wider region" v={{ km: q.km }} /></p>
          <p className="mt-1"><T k="These numbers cover the wider region around the point, an area about 550 km across." />{" "}
            <Link href="/report/area" className="font-medium text-cyan-300 underline"><T k="For a district or protected area, make an area report instead." /></Link></p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/?lat=${q.lat.toFixed(2)}&lon=${q.lon.toFixed(2)}`} className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><T k="Open on the live map" /></Link>
        {r.mode === "stations" && kept.length > 0 && <DownloadLink href={`/api/v1/report${reportHref(q, "&format=csv")}`} k="Download CSV" what="site-report" className={btn} />}
        {r.mode === "area" && <DownloadLink href={openRecordsHref({ lat: q.lat, lon: q.lon, from: q.a.from, to: q.a.to, group: q.group })} k={r.b ? "Download open records, period A (CSV)" : "Download open records (CSV)"} what="area-records" className={btn} />}
        {r.mode === "area" && r.b && <DownloadLink href={openRecordsHref({ lat: q.lat, lon: q.lon, from: r.b.period.from, to: r.b.period.to, group: q.group })} k="Download open records, period B (CSV)" what="area-records" className={btn} />}
      </div>

      <p className="mt-3 text-sm text-slate-400"><T k="Link to this report:" /></p>
      <CopyBlock wrap>{`${SITE}/report${reportHref(q)}`}</CopyBlock>
      {r.mode === "area" && <p className="mt-2 text-xs text-slate-400"><T k="The download holds only GBIF records and contributed datasets under CC0 or CC BY 4.0. BirdWeather counts are shown here but are never downloadable." /></p>}

      <H2><T k="Stations listening here" /></H2>
      {kept.length === 0 ? (
        <p>
          <T k="No station within {km} km keeps its history on Wildlife Network yet." v={{ km: q.km }} />{" "}
          {r.mode === "area" && r.cell && <T k="So this report uses the weekly counts for the wider area around the point (about 550 km across), the same counts as the map and study areas. Shown here, not downloadable." />}{" "}
          <Link href="/contribute" className="text-cyan-400 hover:underline"><T k="Add a station to start a record for this exact place." /></Link>
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {kept.map((s) => <li key={s.id}>{s.name ?? s.id} <span className="text-slate-400">· {s.sensor_type} · {s.km} km</span></li>)}
        </ul>
      )}
      {bySource.length > 0 && (
        <p className="mt-3 text-sm text-slate-400">
          <T k="Also nearby, shown on the live map but not in this report: {list}. Their history is kept by the source, not here." v={{ list: bySource.map(([s, n]) => `${n} ${sourceName(s)}`).join(", ") }} />
        </p>
      )}
      {r.mode === "area" && (
        <p className="mt-2 text-sm text-slate-400">
          {r.sources.length
            ? <T k={r.b ? "Compared on {list} only: the sources with records in both periods." : "Sources: {list}."} v={{ list: r.sources.map(sourceName).join(", ") }} />
            : <T k="No source has records in both periods here, so there is nothing to compare." />}
        </p>
      )}
      {contributed.length > 0 && (
        <p className="mt-2 text-sm text-slate-400">
          <T k="Contributed datasets in this area:" />{" "}
          {contributed.map((c, i) => <span key={c.id}>{i > 0 && ", "}<Link href={`/datasets/${c.id}`} className="text-cyan-400 hover:underline">{c.title}</Link>{c.institution ? ` (${c.institution})` : ""}</span>)}
        </p>
      )}
      {r.historyFrom && <p className="mt-2 text-sm text-slate-400"><T k={r.mode === "area" ? "History for this area starts in the week of {d}." : "History for these stations starts in the week of {d}."} v={{ d: r.historyFrom }} /></p>}

      {(kept.length > 0 || r.mode === "area") && (
        <>
          <Period title={r.b ? "Period A" : "Period"} p={r.a} area={r.mode === "area"} />
          {r.b && <Period title="Period B" p={r.b} area={r.mode === "area"} />}
          {r.b && <Change r={r} />}
          <p className="mt-8 text-xs text-slate-400">
            {r.mode === "area"
              ? <T k="Counts mix machine detections and observers' records, not individual animals. Compare shares per 1,000 rather than raw counts: the number of stations and observers changes over time, and BirdWeather's weekly counts only start in mid-November 2025." />
              : <T k="Counts are machine detections, not individual animals. Compare shares per 1,000 detections rather than raw counts when the number of stations or weeks differs between periods. Sound only reaches species that call." />}
          </p>
        </>
      )}
    </>
  );
}

function Period({ title, p, area = false }: { title: string; p: PeriodSummary; area?: boolean }) {
  // Every Monday in the period, so weeks without data show as gaps rather than closing up.
  const byWeek = new Map(p.weeks.map((w) => [w.week, w]));
  const mondays: string[] = [];
  const start = new Date(p.period.from + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  for (let d = start; d.toISOString().slice(0, 10) <= p.period.to; d = new Date(d.getTime() + 7 * 86400_000)) mondays.push(d.toISOString().slice(0, 10));
  return (
    <>
      <H2><T k={title} />: {p.period.from} … {p.period.to}</H2>
      <p className="text-sm">{area
        ? <T k="{d} detections and records of {s} species, over {w} weeks." v={{ d: p.detections.toLocaleString("en-GB"), s: p.species, w: p.stationWeeks }} />
        : <T k="{d} detections of {s} species, from {w} station weeks." v={{ d: p.detections.toLocaleString("en-GB"), s: p.species, w: p.stationWeeks }} />}</p>
      {p.weeks.length > 0 && !area && <Bars mondays={mondays} byWeek={byWeek} value={(w) => w.detections} label="detections" />}
      {p.weeks.length > 0 && area && (
        <>
          <h3 className="mt-4 text-sm font-semibold text-slate-100"><T k="Species richness and records per week" /></h3>
          <p className="mt-1 text-xs text-slate-400"><T k="Species per week" /></p>
          <Bars mondays={mondays} byWeek={byWeek} value={(w) => w.species} label="species" />
          <p className="mt-2 text-xs text-slate-400"><T k="Records per week" /></p>
          <Bars mondays={mondays} byWeek={byWeek} value={(w) => w.detections} label="records" />
          <p className="mt-1 text-xs text-slate-400">
            <T k="Pale bars are weeks with too few records to compare. More records always find more species, so compare weeks with similar records, and remember this covers the wider region, not the park itself." />
          </p>
        </>
      )}
      <SpeciesTable rows={p.top.slice(0, 40)} area={area} />
    </>
  );
}

type Week = PeriodSummary["weeks"][number];
/** One series as weekly bars over every Monday in the period; weeks without data show as gaps, unwatched weeks pale. */
function Bars({ mondays, byWeek, value, label }: { mondays: string[]; byWeek: Map<string, Week>; value: (w: Week) => number; label: string }) {
  const max = Math.max(1, ...[...byWeek.values()].map(value));
  return (
    <svg viewBox={`0 0 ${mondays.length * 12} 60`} className="mt-1 h-20 w-full" preserveAspectRatio="none" role="img" aria-label={`${label} per week`}>
      {mondays.map((m, i) => {
        const w = byWeek.get(m);
        if (!w) return <rect key={m} x={i * 12 + 1} y={59} width={10} height={1} className="fill-white/10"><title>{`${m}: no data`}</title></rect>;
        const h = Math.max(1, (value(w) / max) * 58);
        const pale = w.watched === false;
        return <rect key={m} x={i * 12 + 1} y={60 - h} width={10} height={h} className={pale ? "fill-cyan-500/25" : "fill-cyan-500/70"}><title>{`${w.week}: ${w.detections} ${label === "detections" ? "detections" : "records"}, ${w.species} species${pale ? ", too few records to compare" : ""}`}</title></rect>;
      })}
    </svg>
  );
}

function Change({ r }: { r: SiteReport }) {
  return (
    <>
      <H2><T k="What changed" /></H2>
      <p className="text-sm">
        <T k="Species richness: {a} in period A, {b} in period B." v={{ a: r.a.species, b: r.b!.species }} />
      </p>
      <h3 className="mt-4 text-sm font-semibold text-slate-100"><T k="Only in period A" /></h3>
      <SpeciesTable rows={r.onlyA.slice(0, 30)} empty="None" area={r.mode === "area"} />
      <h3 className="mt-4 text-sm font-semibold text-slate-100"><T k="Only in period B" /></h3>
      <SpeciesTable rows={r.onlyB.slice(0, 30)} empty="None" area={r.mode === "area"} />
    </>
  );
}

/** Area mode mixes observers' records, which carry no confidence, so the high-confidence column is left out there. */
function SpeciesTable({ rows, empty = "No detections in this period.", area = false }: { rows: SpeciesRow[]; empty?: string; area?: boolean }) {
  if (!rows.length) return <p className="mt-2 text-sm text-slate-400"><T k={empty} /></p>;
  return (
    <table className="mt-2 w-full text-sm">
      <thead><tr className="text-left text-slate-400 border-b border-white/10">
        <th className="py-1.5 font-medium"><T k="Species" /></th><th className="font-medium text-right"><T k="Detections" /></th>
        {!area && <th className="font-medium text-right"><T k="High confidence" /></th>}<th className="font-medium text-right"><T k="Per 1,000" /></th>
      </tr></thead>
      <tbody>{rows.map((x) => (
        <tr key={x.scientific_name} className="border-b border-white/5">
          <td className="py-1.5"><Link href={`/species/${speciesSlug(x.scientific_name)}`} className="text-cyan-400 hover:underline">{x.vernacular_name ?? <i>{x.scientific_name}</i>}</Link>{x.vernacular_name && <> <span className="text-slate-400 italic">{x.scientific_name}</span></>}</td>
          <td className="text-right tabular-nums">{x.n.toLocaleString("en-GB")}</td>
          {!area && <td className="text-right tabular-nums">{x.high.toLocaleString("en-GB")}</td>}
          <td className="text-right tabular-nums">{x.per1000.toFixed(1)}</td>
        </tr>))}</tbody>
    </table>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">{children}</h2>;
}

import type { Metadata } from "next";
import Link from "next/link";
import { PageLang, T } from "@/components/T";
import { searchPlaces } from "@/lib/places";
import { GROUP_LABEL } from "@/lib/studies";
import { speciesSlug } from "@/lib/site";
import { parseReportQuery, REPORT_GROUPS, REPORT_LIMITS, reportHref, siteReport, type PeriodSummary, type SiteReport, type SpeciesRow } from "@/lib/siteReport";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Site report: what changed at a place",
  description: "Pick a place, a radius and dates to see which species the listening stations around it recorded, week by week, and compare two periods, such as before and after a restoration.",
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

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
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500 flex items-center gap-2">
          <span><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <T k="Site report" /></span>
          <span className="ml-auto"><PageLang /></span>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><T k="What changed at a place" /></h1>
        <p className="mt-3">
          <T k="Pick a place, a radius and dates. The report shows what the listening stations around it recorded, week by week, and can compare two periods, such as before and after a restoration, or this year and last." />{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline"><T k="Methods" /></Link>
        </p>
        <Form params={params} q={q} />
        {params.place && !q && <p className="mt-4 text-amber-300"><T k="Could not find that place. Try a nearby town, or enter coordinates." /></p>}
        {r && <Report r={r} placeName={placeName} />}
      </div>
    </main>
  );
}

function Form({ params, q }: { params: Record<string, string | undefined>; q: ReturnType<typeof parseReportQuery> }) {
  const field = "mt-1 w-full rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-slate-100";
  const label = "block text-sm text-slate-400";
  return (
    <form method="get" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border border-white/10 p-4">
      <label className={`${label} col-span-2`}><T k="Town or place" /><input name="place" defaultValue={q ? "" : params.place ?? ""} placeholder="Chennai" className={field} /></label>
      <label className={label}><T k="Latitude" /><input name="lat" inputMode="decimal" defaultValue={q?.lat ?? ""} className={field} /></label>
      <label className={label}><T k="Longitude" /><input name="lon" inputMode="decimal" defaultValue={q?.lon ?? ""} className={field} /></label>
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
        <span className="text-xs text-slate-500"><T k="Coordinates win over the town name. Periods up to three years." /></span>
      </div>
    </form>
  );
}

function Report({ r, placeName }: { r: SiteReport; placeName: string | null }) {
  const { q } = r;
  const kept = r.stations.filter((s) => s.kept);
  const others = r.stations.filter((s) => !s.kept);
  const bySource = Object.entries(others.reduce<Record<string, number>>((a, s) => ({ ...a, [s.source_system]: (a[s.source_system] ?? 0) + 1 }), {}));
  const sourceName = (s: string) => (s === "birdweather" ? "BirdWeather" : s === "inaturalist" ? "iNaturalist" : s === "gbif" ? "GBIF" : s);
  return (
    <>
      <H2><T k="Within {km} km of {place}" v={{ km: q.km, place: placeName ?? `${q.lat}, ${q.lon}` }} /></H2>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href={`/?lat=${q.lat.toFixed(2)}&lon=${q.lon.toFixed(2)}`} className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><T k="Open on the live map" /></Link>
        {kept.length > 0 && <a href={`/api/v1/report${reportHref(q, "&format=csv")}`} className="rounded-md border border-white/15 px-3 py-1.5 hover:bg-white/5"><T k="Download CSV" /></a>}
      </div>

      <H2><T k="Stations listening here" /></H2>
      {kept.length === 0 ? (
        <p>
          <T k="No station within {km} km keeps its history on Wildlife Network yet, so there is nothing to report for this place." v={{ km: q.km }} />{" "}
          <Link href="/contribute" className="text-cyan-400 hover:underline"><T k="Add a station to start the record." /></Link>
        </p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {kept.map((s) => <li key={s.id}>{s.name ?? s.id} <span className="text-slate-500">· {s.sensor_type} · {s.km} km</span></li>)}
        </ul>
      )}
      {bySource.length > 0 && (
        <p className="mt-3 text-sm text-slate-400">
          <T k="Also nearby, shown on the live map but not in this report: {list}. Their history is kept by the source, not here." v={{ list: bySource.map(([s, n]) => `${n} ${sourceName(s)}`).join(", ") }} />
        </p>
      )}
      {r.historyFrom && <p className="mt-2 text-sm text-slate-400"><T k="History for these stations starts in the week of {d}." v={{ d: r.historyFrom }} /></p>}

      {kept.length > 0 && (
        <>
          <Period title={r.b ? "Period A" : "Period"} p={r.a} />
          {r.b && <Period title="Period B" p={r.b} />}
          {r.b && <Change r={r} />}
          <p className="mt-8 text-xs text-slate-500">
            <T k="Counts are machine detections, not individual animals. Compare shares per 1,000 detections rather than raw counts when the number of stations or weeks differs between periods. Sound only reaches species that call." />
          </p>
        </>
      )}
    </>
  );
}

function Period({ title, p }: { title: string; p: PeriodSummary }) {
  const max = Math.max(1, ...p.weeks.map((w) => w.detections));
  // Every Monday in the period, so weeks without data show as gaps rather than closing up.
  const byWeek = new Map(p.weeks.map((w) => [w.week, w]));
  const mondays: string[] = [];
  const start = new Date(p.period.from + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  for (let d = start; d.toISOString().slice(0, 10) <= p.period.to; d = new Date(d.getTime() + 7 * 86400_000)) mondays.push(d.toISOString().slice(0, 10));
  return (
    <>
      <H2><T k={title} />: {p.period.from} … {p.period.to}</H2>
      <p className="text-sm"><T k="{d} detections of {s} species, from {w} station weeks." v={{ d: p.detections.toLocaleString("en-GB"), s: p.species, w: p.stationWeeks }} /></p>
      {p.weeks.length > 0 && (
        <svg viewBox={`0 0 ${mondays.length * 12} 60`} className="mt-3 h-20 w-full" preserveAspectRatio="none" role="img" aria-label="Detections per week">
          {mondays.map((m, i) => {
            const w = byWeek.get(m);
            if (!w) return <rect key={m} x={i * 12 + 1} y={59} width={10} height={1} className="fill-white/10"><title>{`${m}: no data`}</title></rect>;
            const h = Math.max(1, (w.detections / max) * 58);
            return <rect key={w.week} x={i * 12 + 1} y={60 - h} width={10} height={h} className="fill-cyan-500/70"><title>{`${w.week}: ${w.detections} detections, ${w.species} species`}</title></rect>;
          })}
        </svg>
      )}
      <SpeciesTable rows={p.top.slice(0, 40)} />
    </>
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
      <SpeciesTable rows={r.onlyA.slice(0, 30)} empty="None" />
      <h3 className="mt-4 text-sm font-semibold text-slate-100"><T k="Only in period B" /></h3>
      <SpeciesTable rows={r.onlyB.slice(0, 30)} empty="None" />
    </>
  );
}

function SpeciesTable({ rows, empty = "No detections in this period." }: { rows: SpeciesRow[]; empty?: string }) {
  if (!rows.length) return <p className="mt-2 text-sm text-slate-500"><T k={empty} /></p>;
  return (
    <table className="mt-2 w-full text-sm">
      <thead><tr className="text-left text-slate-400 border-b border-white/10">
        <th className="py-1.5 font-medium"><T k="Species" /></th><th className="font-medium text-right"><T k="Detections" /></th>
        <th className="font-medium text-right"><T k="High confidence" /></th><th className="font-medium text-right"><T k="Per 1,000" /></th>
      </tr></thead>
      <tbody>{rows.map((x) => (
        <tr key={x.scientific_name} className="border-b border-white/5">
          <td className="py-1.5"><Link href={`/species/${speciesSlug(x.scientific_name)}`} className="text-cyan-400 hover:underline">{x.vernacular_name ?? <i>{x.scientific_name}</i>}</Link>{x.vernacular_name && <> <span className="text-slate-500 italic">{x.scientific_name}</span></>}</td>
          <td className="text-right tabular-nums">{x.n.toLocaleString("en-GB")}</td>
          <td className="text-right tabular-nums">{x.high.toLocaleString("en-GB")}</td>
          <td className="text-right tabular-nums">{x.per1000.toFixed(1)}</td>
        </tr>))}</tbody>
    </table>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">{children}</h2>;
}

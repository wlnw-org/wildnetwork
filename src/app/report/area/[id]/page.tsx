import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { T } from "@/components/T";
import PrintButton from "@/components/PrintButton";
import { AREA_GROUPS, areaReport, areaReportHref, getArea, parsePeriod, type AreaReport } from "@/lib/areaReport";
import { GROUP_LABEL } from "@/lib/studies";
import { SITE, speciesSlug } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const area = await getArea((await params).id);
  return { title: area ? `${area.name}: area report` : "Area report", robots: { index: false, follow: true } };
}

const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtWeek = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function AreaReportPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const area = await getArea(id);
  if (!area) notFound();
  const groupParam = first(sp.group);
  const group = groupParam && AREA_GROUPS[groupParam] ? groupParam : "all";
  const period = parsePeriod(first(sp.from), first(sp.to));
  const r = await areaReport(area, period, group);
  const href = areaReportHref(id, period, group);
  const api = `/api/v1/report/area/${id}?from=${period.from}&to=${period.to}${group !== "all" ? `&group=${group}` : ""}`;
  return (
    <main className="flex-1 bg-slate-950 text-slate-300 print:bg-white print:text-slate-900">
      <div className="mx-auto max-w-4xl px-5 py-10 text-[15px] leading-relaxed print:max-w-none print:px-0 print:py-0 print:text-[11pt]">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-cyan-400 print:text-slate-600"><Link href="/report/area" className="hover:underline"><T k="Area report" /></Link> · Wildlife Network</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100 print:text-black">{area.name}</h1>
            <p className="mt-1 text-sm text-slate-400 print:text-slate-700">
              {Math.round(area.km2).toLocaleString("en")} km² · {fmtDate(period.from)} – {fmtDate(period.to)} · {group === "all" ? <T k="All classes" /> : GROUP_LABEL[group] ?? group}
            </p>
          </div>
          <div className="flex gap-2 print:hidden"><PrintButton /></div>
        </header>

        <form className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-white/10 bg-white/5 p-3 text-sm print:hidden">
          <label className="flex flex-col gap-1"><span className="text-slate-400"><T k="From" /></span><input type="date" name="from" defaultValue={period.from} className="rounded border border-white/15 bg-slate-950 px-2 py-1 text-slate-100" /></label>
          <label className="flex flex-col gap-1"><span className="text-slate-400"><T k="To" /></span><input type="date" name="to" defaultValue={period.to} className="rounded border border-white/15 bg-slate-950 px-2 py-1 text-slate-100" /></label>
          <label className="flex flex-col gap-1"><span className="text-slate-400"><T k="Class" /></span>
            <select name="group" defaultValue={group} className="rounded border border-white/15 bg-slate-950 px-2 py-1 text-slate-100">
              {Object.keys(AREA_GROUPS).map((g) => <option key={g} value={g}>{g === "all" ? "All" : GROUP_LABEL[g] ?? g}</option>)}
            </select></label>
          <button className="rounded-md border border-white/15 px-3 py-1.5 text-slate-100 hover:bg-white/5"><T k="Update" /></button>
        </form>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Species recorded" value={r.checklist.length + r.sensitiveHidden + r.unnamed} />
          <Stat label="GBIF records" value={r.gbif.records} />
          <Stat label="Listening stations inside" value={r.stations.length + r.otherStations.reduce((s, o) => s + o.n, 0)} />
          <Stat label="Station detections" value={r.acoustic.detections} />
        </section>

        <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_16rem] print:grid-cols-[1fr_14rem]">
          <AreaMap r={r} />
          <div className="text-sm space-y-3">
            <div>
              <h2 className="font-semibold text-slate-100 print:text-black"><T k="Stations inside the area" /></h2>
              {r.stations.length === 0 && r.otherStations.length === 0 && <p className="text-slate-400 print:text-slate-700"><T k="No listening station yet. The checklist comes from GBIF records only. A station here would add continuous, comparable data." /> <Link href="/contribute" className="text-cyan-400 hover:underline print:hidden"><T k="Add one" /></Link></p>}
              <ul className="mt-1 space-y-0.5">
                {r.stations.map((s) => <li key={s.id}>{s.name ?? s.id} <span className="text-slate-400">· {s.sensor}</span></li>)}
                {r.otherStations.map((o) => <li key={o.source}>{o.n} {o.source === "birdweather" ? "BirdWeather" : o.source} <span className="text-slate-400"><T k="(counted, not named)" /></span></li>)}
              </ul>
            </div>
            <div className="text-xs text-slate-400 print:text-slate-600">
              <T k="Boundary" />: {area.source === "osm" ? <>OpenStreetMap contributors (ODbL){area.osm_ref ? ` · ${area.osm_ref}` : ""}</> : <T k="supplied by the person who made the report" />}. <T k="Not an official boundary unless your department supplied it." />
            </div>
          </div>
        </div>

        {r.gbif.error && <p className="mt-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200 print:text-black"><T k="GBIF did not answer, so this report has no GBIF records. Reload in a minute." /></p>}

        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold text-slate-100 print:text-black"><T k="Species checklist" /></h2>
            <div className="flex flex-wrap gap-3 text-sm print:hidden">
              <a href={`${api}&format=csv`} className="text-cyan-400 hover:underline">CSV</a>
              <a href={`${api}&format=kml`} className="text-cyan-400 hover:underline">KML</a>
              <a href={`${api}&format=geojson`} className="text-cyan-400 hover:underline">GeoJSON</a>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400 print:text-slate-600">
            <T k="Usual arrival is the regional estimate for the 5 degree area around this place (90% interval), shown only when it is well supported. It is a guide to the season, not a record from inside the boundary." />
            {r.sensitiveHidden > 0 && <> {r.sensitiveHidden} <T k="sensitive species are counted but not named." /></>}
            {r.gbif.truncated && <> <T k="GBIF lists at most 1,000 species per query, so the rarest may be missing." /></>}
            {r.unnamed > 0 && <> {r.unnamed} <T k="more species are still being named and will appear when the report is opened again." /></>}
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-slate-400 print:text-slate-700">
              <tr><th className="py-1 pr-2">#</th><th className="py-1 pr-2"><T k="Species" /></th><th className="py-1 pr-2"><T k="Class" /></th><th className="py-1 pr-2 text-right"><T k="GBIF records" /></th><th className="py-1 pr-2 text-right"><T k="Station detections" /></th><th className="py-1 text-right"><T k="Usual arrival" /></th></tr>
            </thead>
            <tbody className="divide-y divide-white/5 print:divide-slate-200">
              {r.checklist.map((s, i) => (
                <tr key={s.scientificName} className="break-inside-avoid">
                  <td className="py-1 pr-2 text-slate-400">{i + 1}</td>
                  <td className="py-1 pr-2"><Link href={`/species/${speciesSlug(s.scientificName)}`} className="text-slate-100 hover:underline print:text-black">{s.vernacularName ?? s.scientificName}</Link> <i className="text-slate-400">{s.scientificName}</i></td>
                  <td className="py-1 pr-2 text-slate-400 print:text-slate-700">{GROUP_LABEL[s.group] ?? s.group}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{s.gbif ? s.gbif.toLocaleString("en") : ""}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{s.acoustic ? s.acoustic.toLocaleString("en") : ""}</td>
                  <td className="py-1 text-right text-slate-400 print:text-slate-700">{s.arrival ? <>{fmtWeek(s.arrival.week)}{s.arrival.low && s.arrival.high ? <span className="text-xs"> ({fmtWeek(s.arrival.low)}–{fmtWeek(s.arrival.high)})</span> : null}</> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.checklist.length === 0 && <p className="mt-3 text-slate-400"><T k="Nothing recorded inside this boundary in the period. Try a longer period or all classes." /></p>}
        </section>

        <section className="mt-8 text-sm break-inside-avoid">
          <h2 className="text-lg font-semibold text-slate-100 print:text-black"><T k="Sources and method" /></h2>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li><T k="GBIF: records inside the boundary in the period, under CC0 or CC BY 4.0 only, counted by GBIF at the time of the report. Records reach GBIF one to two weeks after they are made, sometimes much later." />{" "}
              {r.gbif.datasets.length > 0 && <><T k="Main datasets" />: {r.gbif.datasets.slice(0, 8).map((d, i) => <span key={d.key}>{i ? "; " : ""}<a href={`https://www.gbif.org/dataset/${d.key}`} className="text-cyan-400 hover:underline print:text-black">{d.title}</a> ({d.n.toLocaleString("en")})</span>)}.</>}
            </li>
            <li><T k="Stations: detections by devices that publish to Wildlife Network, from their weekly counts. Automated identifications; treat single detections with care." /></li>
            <li><T k="Usual arrival: Wildlife Network's arrival estimate for the region, with a 90% interval." /> <Link href="/methods" className="text-cyan-400 hover:underline print:text-black"><T k="Methods" /></Link>.</li>
          </ul>
          <p className="mt-3"><b><T k="Cite as" />:</b> Wildlife Network ({new Date(r.generatedAt).getUTCFullYear()}). {area.name}: area report, {period.from} to {period.to}. {SITE}{href}. <T k="Generated" /> {fmtDate(r.generatedAt.slice(0, 10))}. <T k="Also cite the GBIF datasets listed above." /></p>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 print:border-slate-300 print:bg-white">
      <div className="text-2xl font-semibold text-slate-100 tabular-nums print:text-black">{value.toLocaleString("en")}</div>
      <div className="text-xs text-slate-400 print:text-slate-700"><T k={label} /></div>
    </div>
  );
}

/** Outline of the boundary with the stations, as SVG (prints sharply, needs no map tiles). */
function AreaMap({ r }: { r: AreaReport }) {
  const [w, s, e, n] = r.area.bbox;
  const k = Math.cos(((s + n) / 2) * Math.PI / 180);
  const W = 520, pad = 12;
  const sx = (W - 2 * pad) / Math.max((e - w) * k, 1e-6);
  const H = Math.min(420, Math.max(160, (n - s) * sx + 2 * pad));
  const scale = Math.min(sx, (H - 2 * pad) / Math.max(n - s, 1e-6));
  const x = (lon: number) => pad + (lon - w) * k * scale;
  const y = (lat: number) => pad + (n - lat) * scale;
  const d = r.area.geojson.coordinates.map((poly) => poly.map((ring) => ring.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("") + "Z").join("")).join("");
  // Faint graticule over the visible extent (at most ~6 lines a side) and a scale bar about a quarter of the width.
  const lonMax = w + (W - pad) / (k * scale), latMin = n - (H - pad) / scale;
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10].find((v) => Math.max(lonMax - w, n - latMin) / v <= 6) ?? 20;
  const ticks = (a: number, b: number) => { const out: number[] = []; for (let v = Math.ceil(a / step) * step; v <= b; v += step) out.push(Number(v.toFixed(4))); return out; };
  const kmPerPx = 111.32 / scale;
  const raw = (W / 4) * kmPerPx, mag = 10 ** Math.floor(Math.log10(raw));
  const barKm = [5, 2, 1].map((m) => m * mag).find((v) => v <= raw) ?? mag;
  const barPx = barKm / kmPerPx;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-lg border border-white/10 bg-slate-900 print:border-slate-300 print:bg-white" role="img" aria-label={r.area.name}>
        <g className="stroke-white/10 print:stroke-slate-200" strokeWidth={0.75}>
          {ticks(w, lonMax).map((v) => <line key={`x${v}`} x1={x(v)} x2={x(v)} y1={0} y2={H} />)}
          {ticks(latMin, n).map((v) => <line key={`y${v}`} y1={y(v)} y2={y(v)} x1={0} x2={W} />)}
        </g>
        <g className="fill-slate-500 print:fill-slate-500" fontSize={9}>
          {ticks(w, lonMax).map((v) => <text key={`tx${v}`} x={x(v) + 2} y={H - 3}>{v}°</text>)}
          {ticks(latMin, n).map((v) => <text key={`ty${v}`} x={W - 3} y={y(v) - 2} textAnchor="end">{v}°</text>)}
        </g>
        <path d={d} fill="rgba(34,211,238,0.15)" stroke="#22d3ee" strokeWidth={1.5} fillRule="evenodd" />
        {r.stations.map((st) => <circle key={st.id} cx={x(st.lon)} cy={y(st.lat)} r={4} fill="#f472b6" stroke="#0f172a" strokeWidth={1} />)}
        <g transform={`translate(${pad},${pad})`} className="fill-slate-300 stroke-slate-300 print:fill-slate-700 print:stroke-slate-700">
          <path d={`M0,4V8H${barPx.toFixed(1)}V4`} fill="none" strokeWidth={1.25} />
          <text x={barPx + 4} y={9} fontSize={10} stroke="none">{barKm >= 1 ? barKm : barKm.toFixed(1)} km</text>
        </g>
      </svg>
      <figcaption className="mt-1 text-xs text-slate-400 print:text-slate-600"><T k="Bounding box" />: <T k="longitude" /> {r.area.bbox[0].toFixed(2)}° … {r.area.bbox[2].toFixed(2)}°, <T k="latitude" /> {r.area.bbox[1].toFixed(2)}° … {r.area.bbox[3].toFixed(2)}°</figcaption>
    </figure>
  );
}

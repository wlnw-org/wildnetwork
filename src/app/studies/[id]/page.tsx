import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReviewButtons, { type Counts } from "@/components/ReviewButtons";
import ResearchSignIn from "@/components/ResearchSignIn";
import StudyAdmin from "@/components/StudyAdmin";
import { getSession, orcidUrl } from "@/lib/orcid";
import { speciesSlug } from "@/lib/site";
import { GROUP_LABEL, getStudy, studyDashboard } from "@/lib/studies";

export const dynamic = "force-dynamic";

const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await getStudy((await params).id);
  if (!s) return { title: "Study not found" };
  return { title: `${s.title} (study area)`, description: s.question ?? `A Wildlife Network study area: ${GROUP_LABEL[s.grp] ?? s.grp}, arrivals and records.`, alternates: { canonical: `/studies/${s.id}` } };
}

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await getStudy((await params).id);
  if (!s) notFound();
  const [me, d] = await Promise.all([getSession(), studyDashboard(s)]);
  const role = me?.orcid === s.owner ? "owner" : d.members.some((m) => m.orcid === me?.orcid) ? "member" : null;
  const reviews = new Map<string, Counts>();
  for (const r of d.reviews) {
    const k = `${r.scientific_name}|${r.cell_lat},${r.cell_lon}`;
    reviews.set(k, { ...(reviews.get(k) ?? {}), [r.verdict]: r.n });
  }
  const watched = d.coverage.filter((c) => c.watched >= 6).length;
  const cells = ((s.lat_max - s.lat_min) / 5 + 1) * ((s.lon_max - s.lon_min) / 5 + 1);
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-4xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/studies" className="text-cyan-400 hover:underline">Study areas</Link></nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{s.title}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {GROUP_LABEL[s.grp] ?? s.grp} · {s.lat_min}° to {s.lat_max + 5}° latitude, {s.lon_min}° to {s.lon_max + 5}° longitude ({cells} cells)
          {s.species.length > 0 && <> · following {s.species.length} species</>}
        </p>
        {s.question && <p className="mt-3 whitespace-pre-line">{s.question}</p>}
        <p className="mt-3 text-sm">
          Kept by <a href={orcidUrl(s.owner)} className="text-cyan-400 hover:underline">{s.owner_name}</a>
          {d.members.map((m) => <span key={m.orcid}>, <a href={orcidUrl(m.orcid)} className="text-cyan-400 hover:underline">{m.name}</a></span>)}
          .
        </p>
        <div className="mt-4"><ResearchSignIn next={`/studies/${s.id}`} /></div>
        {role && <StudyAdmin id={s.id} owner={role === "owner"} digest={s.digest} />}

        <H2>Coverage</H2>
        <p>
          {watched} of {cells} cells were watched in at least 6 of the last 12 weeks (enough {GROUP_LABEL[s.grp]?.toLowerCase() ?? ""} records to count, see{" "}
          <Link href="/methods#effort" className="text-cyan-400 hover:underline">effort</Link>). Cells that are not watched say nothing about absence.
        </p>

        <H2>Most recorded, last 8 weeks</H2>
        {d.top.length === 0 ? <p className="text-slate-500">No records in this area in the last 8 weeks.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium">Species</th><th className="font-medium text-right">Records</th><th className="font-medium text-right">Per 1,000 records</th><th className="font-medium text-right">Cells</th></tr></thead>
            <tbody>{d.top.map((t) => (
              <tr key={t.scientific_name} className="border-b border-white/5">
                <td className="py-1.5"><Link href={`/species/${speciesSlug(t.scientific_name)}`} className="text-cyan-400 hover:underline">{t.vernacular_name ?? t.scientific_name}</Link> <span className="text-slate-500 italic">{t.scientific_name}</span></td>
                <td className="text-right tabular-nums">{t.n.toLocaleString("en-GB")}</td><td className="text-right tabular-nums">{t.share.toFixed(1)}</td><td className="text-right tabular-nums">{t.cells}</td>
              </tr>))}</tbody>
          </table>
        )}

        <H2>Arrival estimates in this area</H2>
        <p className="text-sm text-slate-400">
          First week each species was recorded regularly after at least six weeks away, per cell, with the 90% interval and support (share of resamples that
          found a season). {me ? "Review the ones you know." : "Sign in with ORCID to review them."}{" "}
          <Link href="/research#review" className="text-cyan-400 hover:underline">How reviews work</Link>.
        </p>
        {d.arrivals.length === 0 ? <p className="mt-2 text-slate-500">No arrival estimates in this area yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium">Species</th><th className="font-medium">Cell</th><th className="font-medium">Arrival (90%)</th><th className="font-medium text-right">Support</th><th className="font-medium pl-3">Review</th></tr></thead>
              <tbody>{d.arrivals.map((a) => (
                <tr key={`${a.scientific_name}${a.cell_lat}${a.cell_lon}`} className="border-b border-white/5 align-top">
                  <td className="py-1.5 pr-2"><Link href={`/species/${speciesSlug(a.scientific_name)}`} className="text-cyan-400 hover:underline">{a.vernacular_name ?? a.scientific_name}</Link></td>
                  <td className="tabular-nums whitespace-nowrap pr-2">{a.cell_lat}°, {a.cell_lon}°</td>
                  <td className="whitespace-nowrap pr-2">{fmt(a.arrival)}{a.low && a.high ? <span className="text-slate-500"> ({fmt(a.low)} to {fmt(a.high)})</span> : null}</td>
                  <td className={`text-right tabular-nums ${a.support != null && a.support < 0.5 ? "text-amber-300" : ""}`}>{a.support != null ? a.support.toFixed(2) : ""}</td>
                  <td className="pl-3 py-1"><ReviewButtons species={a.scientific_name} cellLat={a.cell_lat} cellLon={a.cell_lon} counts={reviews.get(`${a.scientific_name}|${a.cell_lat},${a.cell_lon}`) ?? {}} signedIn={!!me} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}

        <H2>Data</H2>
        <p>
          <a href={`/api/v1/studies/${s.id}/export`} className="text-cyan-400 hover:underline" rel="nofollow">Download the weekly records (CSV)</a>: GBIF-derived records only
          (CC0 and CC BY 4.0), because counts from BirdWeather stations may be shown but not redistributed. Arrival dates for any species are in the{" "}
          <Link href="/developers" className="text-cyan-400 hover:underline">API</Link>. Cite the data as described on <Link href="/data" className="text-cyan-400 hover:underline">open data</Link>, and this page as
          https://wlnw.org/studies/{s.id}.
        </p>
      </div>
    </main>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">{children}</h2>;
}

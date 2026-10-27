import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ResearchSignIn from "@/components/ResearchSignIn";
import ReviewButtons, { type Counts } from "@/components/ReviewButtons";
import { sql } from "@/lib/db";
import { REGION } from "@/lib/methods";
import { getSession, orcidUrl } from "@/lib/orcid";
import { speciesSlug } from "@/lib/site";

export const dynamic = "force-dynamic";

const fmt = (d: string | null) => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

async function load(slug: string) {
  const [sp] = await sql<{ scientific_name: string }[]>`SELECT scientific_name FROM species_group WHERE lower(replace(scientific_name, ' ', '-')) = ${slug.toLowerCase()} AND is_species LIMIT 1`;
  if (!sp) return null;
  const name = sp.scientific_name;
  const [rows, reviews, reviewers] = await Promise.all([
    sql<{ vernacular_name: string | null; region: string; cell_lat: number; cell_lon: number; arrival: string; low: string | null; high: string | null; support: number | null }[]>`
      SELECT vernacular_name, ${REGION} AS region, cell_lat, cell_lon, arrival_week::text AS arrival, arrival_low::text AS low, arrival_high::text AS high, arrival_support AS support
      FROM phenology WHERE scientific_name = ${name} ORDER BY region, cell_lat, cell_lon`,
    sql<{ cell_lat: number; cell_lon: number; verdict: string; n: number }[]>`
      SELECT cell_lat, cell_lon, verdict, COUNT(*)::int AS n FROM arrival_reviews WHERE scientific_name = ${name} GROUP BY 1, 2, 3`,
    sql<{ orcid: string; name: string; n: number }[]>`
      SELECT r.orcid, r.name, COUNT(*)::int AS n FROM arrival_reviews a JOIN researchers r USING (orcid) WHERE a.scientific_name = ${name} GROUP BY 1, 2 ORDER BY 3 DESC`,
  ]);
  const counts = new Map<string, Counts>();
  for (const r of reviews) counts.set(`${r.cell_lat},${r.cell_lon}`, { ...(counts.get(`${r.cell_lat},${r.cell_lon}`) ?? {}), [r.verdict]: r.n });
  return { name, common: rows[0]?.vernacular_name ?? null, rows, counts, reviewers };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  return { title: d ? `Review arrival dates: ${d.common ?? d.name}` : "Not found", robots: { index: false, follow: true } };
}

export default async function Review({ params }: { params: Promise<{ slug: string }> }) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const me = await getSession();
  const title = d.common ?? d.name;
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-4xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500">
          <Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href={`/species/${speciesSlug(d.name)}`} className="text-cyan-400 hover:underline">{title}</Link> / Review
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Review arrival dates: {title}</h1>
        <p className="mt-3">
          One row per 5 degree cell. If you know this species there, say whether the estimate looks right, is a misidentification, or is a resident
          whose song starts rather than an arrival. Two agreeing rejections (outnumbering acceptances) drop the estimate at the next daily recompute.{" "}
          <Link href="/methods#review" className="text-cyan-400 hover:underline">Method</Link>.
        </p>
        <div className="mt-4"><ResearchSignIn next={`/species/${speciesSlug(d.name)}/review`} /></div>
        {d.reviewers.length > 0 && (
          <p className="mt-3 text-sm text-slate-400">Reviewed by {d.reviewers.map((r, i) => <span key={r.orcid}>{i > 0 && ", "}<a href={orcidUrl(r.orcid)} className="text-cyan-400 hover:underline">{r.name}</a></span>)}.</p>
        )}
        {d.rows.length === 0 ? <p className="mt-6 text-slate-500">No arrival estimates for this species.</p> : (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-white/10"><th className="py-1.5 font-medium">Region</th><th className="font-medium">Cell</th><th className="font-medium">Arrival (90%)</th><th className="font-medium text-right">Support</th><th className="font-medium pl-3">Review</th></tr></thead>
              <tbody>{d.rows.map((a) => (
                <tr key={`${a.cell_lat},${a.cell_lon}`} className="border-b border-white/5 align-top">
                  <td className="py-1.5 pr-2">{a.region}</td>
                  <td className="tabular-nums whitespace-nowrap pr-2">{a.cell_lat}°, {a.cell_lon}°</td>
                  <td className="whitespace-nowrap pr-2">{fmt(a.arrival)}{a.low && a.high ? <span className="text-slate-500"> ({fmt(a.low)} to {fmt(a.high)})</span> : null}</td>
                  <td className={`text-right tabular-nums ${a.support != null && a.support < 0.5 ? "text-amber-300" : ""}`}>{a.support?.toFixed(2) ?? ""}</td>
                  <td className="pl-3 py-1"><ReviewButtons species={d.name} cellLat={a.cell_lat} cellLon={a.cell_lon} counts={d.counts.get(`${a.cell_lat},${a.cell_lon}`) ?? {}} signedIn={!!me} /></td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

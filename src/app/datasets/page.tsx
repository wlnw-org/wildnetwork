import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/orcid";
import { LICENSES } from "@/lib/datasets";
import ResearchSignIn from "@/components/ResearchSignIn";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Contributed datasets",
  description: "Detection datasets uploaded by researchers and field teams: checked, credited, citable and downloadable under each owner's licence.",
  alternates: { canonical: "/datasets" },
};

type Row = { id: string; title: string; institution: string | null; license: string; records: number; species: number; sites: number; first_day: string | null; last_day: string | null; status: string };

export default async function Datasets() {
  const me = await getSession();
  const [live, mine] = await Promise.all([
    sql<Row[]>`SELECT id, title, institution, license, records, species, sites, first_day::text, last_day::text, status FROM datasets WHERE status = 'live' ORDER BY live_at DESC`.catch(() => []),
    me ? sql<Row[]>`SELECT id, title, institution, license, records, species, sites, first_day::text, last_day::text, status FROM datasets WHERE owner = ${me.orcid} AND status <> 'live' ORDER BY updated_at DESC`.catch(() => []) : Promise.resolve([] as Row[]),
  ]);
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/research" className="text-cyan-400 hover:underline">Research</Link> / Datasets</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Contributed datasets</h1>
        <p className="mt-3">
          Detections that researchers and field teams have uploaded from their own recorders: BirdNET, Kaleidoscope or any table with a date, a species
          and a place. Each one is checked before it counts (<Link href="/methods#datasets" className="text-cyan-400 hover:underline">how</Link>), has its own
          page and citation, and is credited wherever its records are used.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {me ? <Link href="/datasets/new" className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Upload a dataset</Link> : <ResearchSignIn next="/datasets/new" />}
          <span className="text-xs text-slate-500">Uploading needs an ORCID iD, so every dataset is credited to a real person.</span>
        </div>
        {mine.length > 0 && <>
          <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">Your drafts and submissions</h2>
          <List rows={mine} />
        </>}
        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">Live datasets</h2>
        {live.length ? <List rows={live} /> : <p className="text-slate-400">None yet. Yours could be the first.</p>}
      </div>
    </main>
  );
}

function List({ rows }: { rows: Row[] }) {
  const status: Record<string, string> = { draft: "Draft", review: "Waiting for review", live: "" };
  return (
    <ul className="space-y-2">
      {rows.map((d) => (
        <li key={d.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
          <Link href={`/datasets/${d.id}`} className="font-medium text-slate-100 hover:text-cyan-300">{d.title}</Link>
          {status[d.status] && <span className="ml-2 rounded bg-amber-400/15 px-1.5 py-0.5 text-xs text-amber-300">{status[d.status]}</span>}
          <div className="text-xs text-slate-400">
            {[d.institution, `${d.records.toLocaleString("en")} records`, `${d.species} species`, `${d.sites} ${d.sites === 1 ? "site" : "sites"}`,
              d.first_day && `${d.first_day} to ${d.last_day}`, LICENSES[d.license]].filter(Boolean).join(" · ")}
          </div>
        </li>
      ))}
    </ul>
  );
}

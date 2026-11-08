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
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400"><Link href="/research" className="text-cyan-400 hover:underline">Research</Link> / Datasets</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Contributed datasets</h1>
        <p className="mt-3">
          Detections that researchers and field teams have uploaded from their own recorders: BirdNET, Kaleidoscope or any table with a date, a species
          and a place. Each one is checked before it counts (<Link href="/methods#datasets" className="text-cyan-400 hover:underline">how</Link>), has its own
          page and citation, and is credited wherever its records are used.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {me ? <Link href="/datasets/new" className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Upload a dataset</Link> : <ResearchSignIn next="/datasets/new" />}
          <span className="text-xs text-slate-400">Uploading needs an ORCID iD, so every dataset is credited to a real person.</span>
        </div>
        {mine.length > 0 && <>
          <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">Your drafts and submissions</h2>
          <List rows={mine} />
        </>}
        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">Live datasets</h2>
        {live.length ? <List rows={live} /> : <EmptyState signedIn={!!me} />}
      </div>
    </main>
  );
}

/** No live dataset yet: say what one is, who it is for and what its page will show, rather than an empty list. */
function EmptyState({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <p className="text-slate-200">The first datasets are being prepared. Here is what one looks like and how to add yours.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="font-semibold text-slate-100">What a dataset is</h3>
          <p className="mt-1 text-sm">
            A table of detections from your own recorders or surveys: a date, a species and a place on each row. Exports from BirdNET-Pi, BirdNET-Go,
            BirdNET-Analyzer and Kaleidoscope are read as they are.
          </p>
        </div>
        <div>
          <h3 className="font-semibold text-slate-100">Who it is for</h3>
          <p className="mt-1 text-sm">
            Researchers, students, field teams, forest departments and NGOs with recordings or survey sheets that sit on a laptop and could inform others.
          </p>
        </div>
      </div>
      <h3 className="mt-5 font-semibold text-slate-100">What its page shows</h3>
      <div className="mt-2 rounded-lg border border-dashed border-white/15 p-3 text-sm" aria-label="Example dataset page">
        <p className="text-xs uppercase tracking-wider text-slate-400">Example</p>
        <p className="mt-1 font-medium text-slate-100">Dawn chorus, Western Ghats field stations, 2026</p>
        <p className="text-xs text-slate-400">Example University · 18,240 records · 142 species · 6 sites · 2026-01-05 to 2026-06-28 · CC BY 4.0</p>
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-slate-300">
          <li>A citation with your name and ORCID iD, and credit wherever its records are used</li>
          <li>The species list with counts, and the checks each record passed</li>
          <li>A Darwin Core CSV download, with positions rounded and sensitive species protected</li>
        </ul>
      </div>
      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <Link href="/datasets/new" className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">{signedIn ? "Upload a dataset" : "Start a dataset"}</Link>
        <Link href="/studio" className="rounded-md border border-white/15 px-4 py-2 text-slate-100 hover:bg-white/5">Have raw recordings? Process them first in Studio</Link>
      </div>
    </div>
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

import type { Metadata } from "next";
import Link from "next/link";
import CopyBlock from "@/components/CopyBlock";
import ProposalForm from "@/components/ProposalForm";
import ResearchSignIn from "@/components/ResearchSignIn";
import { sql } from "@/lib/db";
import { listProjects } from "@/lib/projects";
import { DATA_CONCEPT_DOI, DATA_USES } from "@/lib/site";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Research: study areas, expert review and open data",
  description: "For researchers: draw a study area and get a live dashboard and weekly digest, review arrival estimates with your ORCID iD, start from ready-made Python and R code, and propose a study.",
  alternates: { canonical: "/research" },
};

const PY = `import pandas as pd

url = "https://wlnw.org/api/v1/arrivals?species=Hirundo%20rustica&format=csv"
arr = pd.read_csv(url, comment="#", parse_dates=["arrivalWeek"])
arr = arr[arr.arrivalSupport >= 0.5]          # drop weak seasons
print(arr.groupby("region").arrivalWeek.min())`;

const R = `arr <- read.csv("https://wlnw.org/api/v1/arrivals?species=Hirundo%20rustica&format=csv",
                comment.char = "#")
arr <- subset(arr, arrivalSupport >= 0.5)
aggregate(as.Date(arrivalWeek) ~ region, arr, min)`;

/** Citation count of the data release from DataCite (daily, best effort). */
async function citations(): Promise<number | null> {
  try {
    const r = await fetch(`https://api.datacite.org/dois/${DATA_CONCEPT_DOI}`, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    return ((await r.json()) as { data?: { attributes?: { citationCount?: number } } }).data?.attributes?.citationCount ?? null;
  } catch { return null; }
}

export default async function Research() {
  const [cites, projects, [counts]] = await Promise.all([
    citations(),
    listProjects().catch(() => []),
    sql<{ studies: number; reviews: number; reviewers: number }[]>`
      SELECT (SELECT COUNT(*)::int FROM studies) AS studies, (SELECT COUNT(*)::int FROM arrival_reviews) AS reviews,
             (SELECT COUNT(DISTINCT orcid)::int FROM arrival_reviews) AS reviewers`.catch(() => [{ studies: 0, reviews: 0, reviewers: 0 }]),
  ]);
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / Research</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Research with Wildlife Network</h1>
        <p className="mt-3">
          Effort-corrected arrival dates, weekly records and range movement for birds, bats, amphibians and insects, from community acoustic stations and open
          records. Everything is open: the <Link href="/methods" className="text-cyan-400 hover:underline">methods</Link>, the{" "}
          <Link href="/developers" className="text-cyan-400 hover:underline">API</Link>, the <Link href="/data" className="text-cyan-400 hover:underline">data releases</Link> and the code.
          Here is how to use it, check it and build on it with others.
        </p>
        <div className="mt-5"><ResearchSignIn next="/research" /></div>
        <p className="mt-2 text-xs text-slate-500">Sign-in uses your ORCID iD and public name only. Needed for projects, study areas and reviews; nothing else on the site needs an account.</p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Card href="/projects" title="Projects" text="Questions researchers want help with. Ask to join one, or post your own and say what help you need." stat={`${projects.filter((p) => p.open).length} open`} />
          <Card href="/studies" title="Study areas" text="Draw an area, pick a class or species. Get a live dashboard, a weekly digest and an export, and invite collaborators." stat={`${counts.studies} ${counts.studies === 1 ? "study" : "studies"}`} />
          <Card href="#review" title="Expert review" text="Mark arrival estimates you know as right, misidentified or resident. Two agreeing reviewers change the published dates." stat={`${counts.reviews} reviews by ${counts.reviewers}`} />
          <Card href="/datasets" title="Contribute a dataset" text="Upload detections from your own recorders (BirdNET, Kaleidoscope, any CSV). Checked, credited by name, citable." stat="ORCID sign-in" />
          <Card href="#start" title="Start in 5 minutes" text="Copy a Python or R snippet, or open the starter notebook with the API and the open data release." stat="Python · R · notebook" />
        </div>

        <H2 id="start">Start in five minutes</H2>
        <p>Arrival dates for any species, with 90% intervals and support, straight from the API:</p>
        <CopyBlock>{PY}</CopyBlock>
        <CopyBlock>{R}</CopyBlock>
        <p>
          The <a href="/notebooks/wildlife-network-starter.ipynb" className="text-cyan-400 hover:underline" download>starter notebook</a> (Jupyter) goes further: arrival week against
          latitude, and effort-corrected shares from the open data release. Open it in{" "}
          <a href="https://colab.research.google.com/github/wlnw-org/wildnetwork/blob/main/public/notebooks/wildlife-network-starter.ipynb" className="text-cyan-400 hover:underline" rel="noopener">Google Colab</a>.
        </p>

        <H2 id="studies">Study areas</H2>
        <p>
          A study area is a box on the 5 degree grid with a class (birds, bats and so on) and, if you like, a species list. Its page shows which cells are
          watched, what is most recorded as a share of all records, and every arrival estimate inside it, with reviews. You can invite collaborators by
          ORCID iD or accept requests to join, receive a weekly email when species arrive in the area, and export the GBIF-derived weekly records as CSV.{" "}
          <Link href="/studies" className="text-cyan-400 hover:underline">Browse or create a study area</Link>.
        </p>

        <H2 id="review">Expert review of arrival dates</H2>
        <p>
          Automatic identification makes mistakes, and an acoustic &quot;arrival&quot; of a resident is often just the start of its song. If you know a species
          in a region, review its estimates: <i>looks right</i>, <i>misidentification</i>, <i>resident, not an arrival</i> or <i>unsure</i>. When at least two
          reviewers reject an estimate and they outnumber those who accept it, it is dropped at the next daily recompute
          (<Link href="/methods#review" className="text-cyan-400 hover:underline">methods</Link>). Reviews are public and credited with your name and ORCID iD.
          Review from any study area, or from a species page (&quot;Review these arrival dates&quot;).
        </p>

        <H2 id="questions">Open questions looking for collaborators</H2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          {projects.filter((p) => p.open).slice(0, 8).map((p) => <li key={p.id}><Link href={`/projects/${p.id}`} className="text-cyan-400 hover:underline">{p.title}</Link></li>)}
        </ul>
        <p className="mt-2"><Link href="/projects" className="text-cyan-400 hover:underline">All projects</Link>, or <Link href="/projects/new" className="text-cyan-400 hover:underline">post your own</Link>.</p>

        <H2 id="uses">Who uses the data</H2>
        {DATA_USES.length ? (
          <ul className="mt-2 list-disc pl-5 space-y-1">{DATA_USES.map((u) => <li key={u.url}><a href={u.url} className="text-cyan-400 hover:underline">{u.title}</a>, {u.authors} ({u.year}, {u.kind})</li>)}</ul>
        ) : (
          <p>No published uses yet: yours could be the first. Tell us when you use the data and it will be listed here.</p>
        )}
        <p className="mt-2 text-sm text-slate-500">
          Cite the data as DOI <a href={`https://doi.org/${DATA_CONCEPT_DOI}`} className="text-cyan-400 hover:underline">{DATA_CONCEPT_DOI}</a>
          {cites != null && ` (${cites} recorded ${cites === 1 ? "citation" : "citations"} so far, from DataCite)`}, plus the GBIF datasets it lists.
        </p>

        <H2 id="propose">Propose a study</H2>
        <p>A question that needs a new region, a different grid, a species group we do not cover yet, or a joint analysis? Tell us.</p>
        <ProposalForm />
      </div>
    </main>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-10 mb-2 text-xl font-semibold text-slate-100 scroll-mt-6">{children}</h2>;
}

function Card({ href, title, text, stat }: { href: string; title: string; text: string; stat: string }) {
  return (
    <Link href={href} className="block rounded-lg border border-white/10 bg-white/5 p-4 hover:border-cyan-400/50">
      <span className="block font-semibold text-slate-100">{title}</span>
      <span className="mt-1 block text-sm text-slate-400">{text}</span>
      <span className="mt-2 block text-xs text-cyan-300">{stat}</span>
    </Link>
  );
}

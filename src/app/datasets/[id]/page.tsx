import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession, orcidUrl } from "@/lib/orcid";
import { INCLUDED, LICENSES, LICENSE_URL, canManage, citation, getDataset, isReviewer } from "@/lib/datasets";
import { isSensitiveTaxon } from "@/lib/sensitiveTaxa";
import { speciesSlug } from "@/lib/site";
import CopyBlock from "@/components/CopyBlock";
import DatasetActions, { type FlagGroup } from "@/components/DatasetActions";
import DatasetForm from "@/components/DatasetForm";
import { GROUP_LABELS } from "@/lib/datasetLabels";
import DatasetUpload from "@/components/DatasetUpload";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await getDataset((await params).id).catch(() => null);
  if (!d) return { title: "Dataset" };
  return { title: d.title, description: `${d.records.toLocaleString("en")} detections of ${d.species} species${d.institution ? ` from ${d.institution}` : ""}, contributed to Wildlife Network.`,
    robots: d.status === "live" ? undefined : { index: false, follow: true }, alternates: { canonical: `/datasets/${d.id}` } };
}

export default async function DatasetPage({ params }: Props) {
  const [d, me] = await Promise.all([getDataset((await params).id), getSession()]);
  if (!d) notFound();
  const manage = canManage(d, me?.orcid);
  if (d.status !== "live" && !manage) notFound();
  const reviewer = isReviewer(me?.orcid);
  const [species, flagged, cells] = await Promise.all([
    sql<{ scientific_name: string; vernacular: string | null; n: number }[]>`
      SELECT r.scientific_name, (SELECT x.vernacular_name FROM species_weekly x WHERE x.scientific_name = r.scientific_name AND x.vernacular_name IS NOT NULL LIMIT 1) AS vernacular, COUNT(*)::int AS n
      FROM dataset_records r WHERE r.dataset_id = ${d.id} AND r.verification = ANY(${INCLUDED}) GROUP BY 1 ORDER BY 3 DESC LIMIT 60`,
    manage ? sql<FlagGroup[]>`SELECT scientific_name, site, flag, COUNT(*)::int AS n FROM dataset_records WHERE dataset_id = ${d.id} AND verification = 'flagged'
      GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 100` : Promise.resolve([] as FlagGroup[]),
    sql<{ n: number }[]>`SELECT COUNT(DISTINCT (FLOOR(lat / 5), FLOOR(lon / 5)))::int AS n FROM dataset_records WHERE dataset_id = ${d.id}`,
  ]);
  // Sensitive species are named only to the owner and reviewers.
  const shown = manage ? species : species.filter((s) => !isSensitiveTaxon([s.scientific_name]));
  const hidden = species.length - shown.length;
  const c = d.checks;
  const statusText: Record<string, string> = {
    draft: "Draft: only you can see this page. Add records, then submit.",
    review: "Submitted: waiting for a reviewer. The records do not count anywhere yet.",
    live: "",
  };
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/datasets" className="text-cyan-400 hover:underline">Datasets</Link></nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{d.title}</h1>
        {statusText[d.status] && <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-amber-200">{statusText[d.status]}</p>}
        {d.review_note && manage && <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-amber-200">Reviewer&apos;s note: {d.review_note}</p>}

        <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 text-sm">
          {d.institution && <><dt className="text-slate-500">Institution</dt><dd>{d.institution}</dd></>}
          <dt className="text-slate-500">People</dt>
          <dd>{d.people.map((p, i) => <span key={i}>{i > 0 && ", "}{p.orcid ? <a href={orcidUrl(p.orcid)} className="text-cyan-400 hover:underline" rel="noopener">{p.name}</a> : p.name}</span>)}</dd>
          <dt className="text-slate-500">Licence</dt><dd><a href={LICENSE_URL[d.license]} className="text-cyan-400 hover:underline" rel="license noopener">{LICENSES[d.license]}</a></dd>
          <dt className="text-slate-500">Animals</dt><dd>{GROUP_LABELS[d.grp] ?? d.grp}</dd>
          <dt className="text-slate-500">Identified by</dt><dd>{d.method === "human" ? "People" : `${d.classifier ?? "A classifier"}, confidence ${d.min_conf} or more`}</dd>
          {d.device && <><dt className="text-slate-500">Recorder</dt><dd>{d.device}</dd></>}
          <dt className="text-slate-500">Records</dt><dd>{d.records.toLocaleString("en")} detections, {d.species} species, {d.sites} {d.sites === 1 ? "site" : "sites"} in {cells[0]?.n ?? 0} grid {cells[0]?.n === 1 ? "cell" : "cells"}</dd>
          {d.first_day && <><dt className="text-slate-500">Dates</dt><dd>{d.first_day} to {d.last_day}</dd></>}
          {d.doi && <><dt className="text-slate-500">DOI</dt><dd><a href={`https://doi.org/${d.doi}`} className="text-cyan-400 hover:underline">{d.doi}</a></dd></>}
        </dl>
        {d.description && <p className="mt-4 whitespace-pre-line">{d.description}</p>}

        <h2 className="mt-8 mb-2 text-xl font-semibold text-slate-100">Cite this dataset</h2>
        <CopyBlock>{citation(d)}</CopyBlock>
        {d.status === "live" && (
          <p className="mt-2 text-sm">
            <a href={`/api/v1/datasets/${d.id}/csv`} className="text-cyan-400 hover:underline">Download the records (CSV, Darwin Core terms)</a>
            <span className="text-slate-500"> · {d.downloads} {d.downloads === 1 ? "download" : "downloads"} · positions rounded to about {d.precision_km} km{d.license === "CC-BY-NC-4.0" ? " · non-commercial use only" : ""}</span>
          </p>
        )}

        {c && (
          <>
            <h2 className="mt-8 mb-2 text-xl font-semibold text-slate-100">Checks</h2>
            <p className="text-sm">
              {c.passed.toLocaleString("en")} passed (recorded nearby at this time of year by other sources) · {c.unchecked.toLocaleString("en")} in areas too thinly watched to judge ·{" "}
              {c.confirmed.toLocaleString("en")} confirmed by a reviewer · {c.flagged.toLocaleString("en")} flagged · {c.rejected.toLocaleString("en")} rejected.
            </p>
            {Object.keys(c.reasons).length > 0 && <p className="mt-1 text-sm text-slate-400">Flagged: {Object.entries(c.reasons).map(([k, n]) => `${n.toLocaleString("en")} ${k}`).join("; ")}.</p>}
            {c.warnings.map((w, i) => <p key={i} className="mt-1 text-sm text-amber-300">{w}</p>)}
            <p className="mt-1 text-xs text-slate-500">Flagged and rejected records never count. <Link href="/methods#datasets" className="text-cyan-400 hover:underline">How the checks work</Link>.</p>
          </>
        )}

        {shown.length > 0 && (
          <>
            <h2 className="mt-8 mb-2 text-xl font-semibold text-slate-100">Species</h2>
            <ul className="columns-1 sm:columns-2 text-sm">
              {shown.map((s) => (
                <li key={s.scientific_name} className="break-inside-avoid py-0.5">
                  <Link href={`/species/${speciesSlug(s.scientific_name)}`} className="hover:text-cyan-300">{s.vernacular ?? <i>{s.scientific_name}</i>}</Link>
                  <span className="text-slate-500"> · {s.n.toLocaleString("en")}</span>
                </li>
              ))}
            </ul>
            {hidden > 0 && <p className="mt-1 text-xs text-slate-500">Plus {hidden} sensitive {hidden === 1 ? "species" : "species"}, not named to protect them.</p>}
          </>
        )}

        {manage && (
          <section className="mt-10 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-4">
            <h2 className="text-xl font-semibold text-slate-100">Manage</h2>
            {d.status === "draft" && <>
              <h3 className="mt-4 font-semibold text-slate-100">Add detection tables</h3>
              <DatasetUpload id={d.id} method={d.method} minConf={d.min_conf} />
            </>}
            <div className="mt-6"><DatasetActions id={d.id} status={d.status} records={d.records} reviewer={reviewer} flagged={flagged} /></div>
            <details className="mt-6">
              <summary className="cursor-pointer text-slate-200">Edit details</summary>
              <DatasetForm id={d.id} initial={d} live={d.status === "live"} />
            </details>
          </section>
        )}
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AskToJoin, JoinRequests } from "@/components/JoinPanel";
import ProjectAdmin from "@/components/ProjectAdmin";
import ResearchSignIn from "@/components/ResearchSignIn";
import { getSession, orcidUrl } from "@/lib/orcid";
import { NEEDS, getProject, joinState, pendingRequests, projectMembers } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await getProject((await params).id);
  if (!p) return { title: "Project not found" };
  return { title: `${p.title} (project)`, description: p.question.slice(0, 200), alternates: { canonical: `/projects/${p.id}` } };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await getProject((await params).id);
  if (!p) notFound();
  const target = { project: p.id };
  const [me, members] = await Promise.all([getSession(), projectMembers(p.id)]);
  const isOwner = me?.orcid === p.owner, isMember = members.some((m) => m.orcid === me?.orcid);
  const state = me ? await joinState(target, me.orcid) : null;
  const requests = isOwner ? await pendingRequests(target) : [];
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400"><Link href="/projects" className="text-cyan-400 hover:underline">Projects</Link></nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">{p.title}</h1>
        <p className="mt-1 text-sm text-slate-400">{[p.species, p.region, `posted ${p.created}`, !p.open && "closed to new people"].filter(Boolean).join(" · ")}</p>
        <p className="mt-4 whitespace-pre-line">{p.question}</p>
        <p className="mt-4"><span className="text-slate-400">Looking for:</span> {p.needs.map((n) => NEEDS[n] ?? n).join(", ")}</p>
        {p.study_id && <p className="mt-2"><span className="text-slate-400">Live data:</span> <Link href={`/studies/${p.study_id}`} className="text-cyan-400 hover:underline">{p.study_title}</Link></p>}
        <p className="mt-2 text-sm">
          Kept by <a href={orcidUrl(p.owner)} className="text-cyan-400 hover:underline">{p.owner_name}</a>
          {members.map((m) => <span key={m.orcid}>, <a href={orcidUrl(m.orcid)} className="text-cyan-400 hover:underline">{m.name}</a></span>)}.
        </p>
        <div className="mt-4"><ResearchSignIn next={`/projects/${p.id}`} /></div>
        {!me && p.open && <p className="mt-2 text-sm text-slate-400">Sign in with ORCID to ask to join.</p>}
        {me && !isOwner && !isMember && (p.open || state?.request) && <AskToJoin target={target} request={state?.request ?? null} hasEmail={!!state?.hasEmail} />}
        {isOwner && <JoinRequests requests={requests} hasEmail={!!state?.hasEmail} />}
        {me && (isOwner || isMember) && <ProjectAdmin id={p.id} owner={isOwner} open={p.open} myOrcid={me.orcid} />}
      </div>
    </main>
  );
}

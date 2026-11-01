import type { Metadata } from "next";
import Link from "next/link";
import ProjectForm from "@/components/ProjectForm";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/orcid";
import { NEEDS } from "@/lib/projects";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Post a project", robots: { index: false, follow: true } };

export default async function NewProject() {
  const me = await getSession();
  const [studies, [row]] = me ? await Promise.all([
    sql<{ id: string; title: string }[]>`SELECT id, title FROM studies WHERE owner = ${me.orcid}
      UNION SELECT s.id, s.title FROM studies s JOIN study_members m ON m.study_id = s.id WHERE m.orcid = ${me.orcid} ORDER BY title`,
    sql<{ has_email: boolean }[]>`SELECT email_enc IS NOT NULL AS has_email FROM researchers WHERE orcid = ${me.orcid}`,
  ]) : [[], []];
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/projects" className="text-cyan-400 hover:underline">Projects</Link> / New</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Post a project</h1>
        <ProjectForm needs={NEEDS} studies={[...studies]} hasEmail={!!row?.has_email} />
      </div>
    </main>
  );
}

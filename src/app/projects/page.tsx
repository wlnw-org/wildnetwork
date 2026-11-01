import type { Metadata } from "next";
import Link from "next/link";
import { NEEDS, listProjects } from "@/lib/projects";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
  description: "Open wildlife research questions looking for collaborators: ecology, species identification, field recordings, local knowledge, statistics and code.",
  alternates: { canonical: "/projects" },
};

export default async function Projects({ searchParams }: { searchParams: Promise<{ need?: string }> }) {
  const { need } = await searchParams;
  const active = need && need in NEEDS ? need : undefined;
  const rows = await listProjects(active);
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-cyan-400 text-cyan-300" : "border-white/15 text-slate-400 hover:border-white/30"}`;
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/research" className="text-cyan-400 hover:underline">Research</Link> / Projects</nav>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Projects</h1>
          <Link href="/projects/new" className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">Post a project</Link>
        </div>
        <p className="mt-3">Questions that researchers want help with. Ask to join one, or post your own. Signing in uses ORCID.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/projects" className={chip(!active)}>All</Link>
          {Object.entries(NEEDS).map(([k, v]) => <Link key={k} href={`/projects?need=${k}`} className={chip(active === k)}>{v}</Link>)}
        </div>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">Nothing here yet. <Link href="/projects/new" className="text-cyan-400 hover:underline">Post the first one</Link>.</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-cyan-400/50">
                  <span className="block font-medium text-slate-100">{p.title}{!p.open && <span className="ml-2 text-sm font-normal text-slate-500">closed</span>}</span>
                  <span className="block text-sm text-slate-400">Looking for: {p.needs.map((n) => NEEDS[n] ?? n).join(", ")}</span>
                  <span className="block text-sm text-slate-500">{[p.species, p.region, p.owner_name, p.created].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

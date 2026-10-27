import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { GROUP_LABEL } from "@/lib/studies";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Study areas",
  description: "Public study areas on Wildlife Network: live, effort-corrected dashboards of arrivals and records for a region, with collaborators and expert review.",
  alternates: { canonical: "/studies" },
};

export default async function Studies() {
  const rows = await sql<{ id: string; title: string; owner_name: string; grp: string; lat_min: number; lat_max: number; lon_min: number; lon_max: number; members: number; created: string }[]>`
    SELECT s.id, s.title, r.name AS owner_name, s.grp, s.lat_min, s.lat_max, s.lon_min, s.lon_max, s.created_at::date::text AS created,
           (SELECT COUNT(*)::int FROM study_members m WHERE m.study_id = s.id) AS members
    FROM studies s JOIN researchers r ON r.orcid = s.owner ORDER BY s.created_at DESC LIMIT 200`;
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/research" className="text-cyan-400 hover:underline">Research</Link> / Study areas</nav>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Study areas</h1>
          <Link href="/studies/new" className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400">New study area</Link>
        </div>
        <p className="mt-3">Each study area is a live dashboard of one region and class, kept by a researcher and their collaborators. All are public.</p>
        {rows.length === 0 ? (
          <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">No study areas yet. <Link href="/studies/new" className="text-cyan-400 hover:underline">Create the first one</Link>.</p>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/studies/${s.id}`} className="block rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-cyan-400/50">
                  <span className="block font-medium text-slate-100">{s.title}</span>
                  <span className="block text-sm text-slate-500">
                    {GROUP_LABEL[s.grp] ?? s.grp} · {s.lat_min}° to {s.lat_max + 5}° lat, {s.lon_min}° to {s.lon_max + 5}° lon · {s.owner_name}{s.members ? ` and ${s.members} ${s.members === 1 ? "collaborator" : "collaborators"}` : ""} · {s.created}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

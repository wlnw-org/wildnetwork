import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { usageStats } from "@/lib/appUsage";
import { getSession } from "@/lib/orcid";
import { MAINTAINER } from "@/lib/projects";

export const metadata: Metadata = { title: "App usage", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** GitHub's own download counts for every Studio installer, newest release first. */
async function githubDownloads(): Promise<{ tag: string; total: number; files: { name: string; n: number }[] }[]> {
  try {
    const r = await fetch("https://api.github.com/repos/wlnw-org/wlnw-studio/releases?per_page=20", { next: { revalidate: 3600 }, headers: { accept: "application/vnd.github+json" } });
    if (!r.ok) return [];
    const rel = (await r.json()) as { tag_name: string; assets: { name: string; download_count: number }[] }[];
    return rel.map((x) => {
      const files = x.assets.filter((a) => /\.(dmg|exe|msi|AppImage|deb)$/.test(a.name)).map((a) => ({ name: a.name, n: a.download_count }));
      return { tag: x.tag_name, total: files.reduce((s, f) => s + f.n, 0), files: files.filter((f) => f.n > 0) };
    });
  } catch { return []; }
}

const Card = ({ label, value, sub }: { label: string; value: number | string; sub: string }) => (
  <div className="rounded-lg border border-white/10 bg-white/5 p-4">
    <p className="text-sm text-slate-400">{label}</p>
    <p className="mt-1 text-3xl font-semibold text-slate-100">{typeof value === "number" ? value.toLocaleString() : value}</p>
    <p className="mt-1 text-xs text-slate-500">{sub}</p>
  </div>
);

/** Maintainer only: Studio starts (update checks), distinct installs and downloads. Everyone else gets a 404. */
export default async function AppUsage() {
  const s = await getSession();
  if (s?.orcid !== MAINTAINER.orcid) notFound();
  const [st, gh] = await Promise.all([usageStats("studio", 30), githubDownloads()]);
  const days = [...new Set(st.daily.map((d) => d.day))];
  const at = (day: string, ev: string) => st.daily.find((d) => d.day === day && d.event === ev);
  const sum = (ev: string) => st.daily.filter((d) => d.event === ev).reduce((a, d) => a + d.n, 0);
  const split = (ev: string, rows: typeof st.versions) => rows.filter((r) => r.event === ev);
  const ghTotal = gh.reduce((a, r) => a + r.total, 0);
  const th = "py-1.5 pr-4 text-left font-medium text-slate-400", td = "py-1.5 pr-4 tabular-nums";
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-4xl px-5 py-10 text-[15px]">
        <p className="text-sm"><a href="/admin" className="text-cyan-400 hover:underline">Admin</a></p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Studio usage</h1>
        <p className="mt-2 text-sm text-slate-400">Last 30 days. An app start is one update check. Installs are distinct (hashed) addresses, so a lab sharing one connection counts once and a laptop that travels may count twice. Counting started with Studio 0.1.5; older versions check GitHub directly.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Card label="Active installs, 7 days" value={st.active7} sub="distinct addresses that started Studio" />
          <Card label="Active installs, 30 days" value={st.active30} sub="distinct addresses that started Studio" />
          <Card label="App starts, 30 days" value={sum("check")} sub="update checks" />
          <Card label="Downloads, all time" value={ghTotal} sub={`GitHub count; ${sum("download").toLocaleString()} via wlnw.org in 30 days`} />
        </div>

        <h2 className="mt-10 text-lg font-semibold text-slate-100">By day</h2>
        {days.length === 0 ? <p className="mt-2 text-sm text-slate-400">Nothing counted yet.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr><th className={th}>Day</th><th className={th}>App starts</th><th className={th}>Installs</th><th className={th}>Downloads</th></tr></thead>
            <tbody>{days.map((d) => (
              <tr key={d} className="border-t border-white/5"><td className={td}>{d}</td><td className={td}>{at(d, "check")?.n ?? 0}</td><td className={td}>{at(d, "check")?.unique ?? 0}</td><td className={td}>{at(d, "download")?.n ?? 0}</td></tr>
            ))}</tbody>
          </table>
        )}

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {([["Versions in use", split("check", st.versions)], ["Systems in use", split("check", st.systems)], ["Downloads by system", split("download", st.systems)]] as const).map(([title, rows]) => (
            <section key={title}>
              <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
              <ul className="mt-2 space-y-1 text-sm">{rows.length ? rows.map((r) => <li key={r.key} className="flex justify-between gap-4"><span>{r.key || "unknown"}</span><span className="tabular-nums">{r.n.toLocaleString()}</span></li>) : <li className="text-slate-500">None yet</li>}</ul>
            </section>
          ))}
        </div>

        <h2 className="mt-10 text-lg font-semibold text-slate-100">Downloads per release (GitHub)</h2>
        <ul className="mt-2 space-y-2 text-sm">{gh.map((r) => (
          <li key={r.tag}><b className="text-slate-100">{r.tag}</b>: {r.total.toLocaleString()}{r.files.length > 0 && <span className="text-slate-500"> ({r.files.map((f) => `${f.name.replace(/^Wildlife[-.]Network[-.]Studio[-_.]/, "")} ${f.n}`).join(", ")})</span>}</li>
        ))}</ul>
      </div>
    </main>
  );
}

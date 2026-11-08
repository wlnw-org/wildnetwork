import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { decryptToken } from "@/lib/optin";
import { getSession, ORCID_ENABLED } from "@/lib/orcid";
import { MAINTAINER } from "@/lib/projects";
import { sharedTotals } from "@/lib/sharedAnswers";
import { databaseMb, STORAGE } from "@/lib/storage";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const fmt = (d: string | Date) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const safe = (enc: string | null) => { if (!enc) return null; try { return decryptToken(enc); } catch { return "(cannot decrypt)"; } };

const Card = ({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) => {
  const body = <>
    <p className="text-sm text-slate-400">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-slate-100">{typeof value === "number" ? value.toLocaleString() : value}</p>
    {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
  </>;
  return href ? <Link href={href} className="block rounded-lg border border-white/10 bg-white/5 p-4 hover:border-cyan-400/50">{body}</Link>
    : <div className="rounded-lg border border-white/10 bg-white/5 p-4">{body}</div>;
};

/** Maintainer only (signed in with the maintainer's ORCID iD): feedback, app usage, shared answers, datasets to review, storage. */
export default async function Admin() {
  const s = await getSession();
  if (s?.orcid !== MAINTAINER.orcid) {
    if (!s && ORCID_ENABLED) return (
      <main className="flex-1 bg-slate-950 text-slate-300"><div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="text-2xl font-semibold text-slate-100">Admin</h1>
        <p className="mt-3"><a href="/api/auth/orcid?next=/admin" className="text-cyan-400 hover:underline">Sign in with ORCID</a> to continue.</p>
      </div></main>
    );
    notFound();
  }
  const [mb, shared, feedback, fbCounts, datasets, usage, alerts, updates, optins] = await Promise.all([
    databaseMb().catch(() => null),
    sharedTotals().catch(() => null),
    sql<{ id: number; kind: string; product: string; message: string; email_enc: string | null; context: string | null; emailed: boolean; created_at: Date }[]>`
      SELECT id, kind, product, message, email_enc, context, emailed, created_at FROM feedback ORDER BY id DESC LIMIT 30`.catch(() => []),
    sql<{ week: number; total: number }[]>`SELECT COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS week, COUNT(*)::int AS total FROM feedback`.catch(() => [{ week: 0, total: 0 }]),
    sql<{ id: string; title: string; status: string; updated_at: Date }[]>`SELECT id, title, status, updated_at FROM datasets WHERE status IN ('review', 'live') ORDER BY (status = 'review') DESC, updated_at DESC LIMIT 20`.catch(() => []),
    sql<{ starts: number; installs: number }[]>`SELECT COALESCE((SELECT SUM(n) FROM app_usage WHERE event = 'check' AND day > CURRENT_DATE - 7), 0)::int AS starts,
      (SELECT COUNT(DISTINCT key_hash) FROM app_seen WHERE event = 'check' AND day > CURRENT_DATE - 7)::int AS installs`.catch(() => [{ starts: 0, installs: 0 }]),
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM alert_subs WHERE confirmed_at IS NOT NULL`.catch(() => [{ n: 0 }]),
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM update_subs WHERE confirmed_at IS NOT NULL`.catch(() => [{ n: 0 }]),
    sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM bw_optin`.catch(() => [{ n: 0 }]),
  ]);
  const toReview = datasets.filter((d) => d.status === "review");
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-5xl px-5 py-10 text-[15px]">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100">Admin</h1>
        <p className="mt-1 text-sm text-slate-400">Only visible to you. Signed in as {s.name}.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Card label="Feedback, last 7 days" value={fbCounts[0]?.week ?? 0} sub={`${(fbCounts[0]?.total ?? 0).toLocaleString()} in all`} href="#feedback" />
          <Card label="Studio installs, 7 days" value={usage[0]?.installs ?? 0} sub={`${(usage[0]?.starts ?? 0).toLocaleString()} app starts`} href="/admin/apps" />
          <Card label="Shared answers" value={shared?.answers ?? 0} sub={shared ? `${shared.species} species, ${shared.contributors} contributors, ${shared.cells} places` : undefined} />
          <Card label="Datasets to review" value={toReview.length} href="#datasets" />
          <Card label="Database" value={mb != null ? `${Math.round(mb)} MB` : "?"} sub={`warning at ${STORAGE.WARN_MB} MB`} href="/api/v1/health" />
          <Card label="Species alert subscribers" value={alerts[0]?.n ?? 0} />
          <Card label="Update email subscribers" value={updates[0]?.n ?? 0} />
          <Card label="BirdWeather opt-in stations" value={optins[0]?.n ?? 0} href="/stations" />
        </div>

        <h2 id="feedback" className="mt-10 text-xl font-semibold text-slate-100">Feedback</h2>
        <p className="text-sm text-slate-400">Newest 30. Each is also emailed to you; a dot marks one the daily mail cap held back.</p>
        <ul className="mt-3 space-y-3">
          {feedback.length === 0 && <li className="text-sm text-slate-500">No messages yet.</li>}
          {feedback.map((f) => {
            const email = safe(f.email_enc);
            return (
              <li key={f.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-slate-400">
                  {!f.emailed && <span className="mr-1 text-amber-300" title="Not emailed (daily cap)">●</span>}
                  #{f.id} · {fmt(f.created_at)} · {f.kind} about {f.product}{f.context ? ` · ${f.context}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-100">{f.message}</p>
                <p className="mt-2 text-sm">{email ? <a href={`mailto:${email}?subject=${encodeURIComponent("Re: your feedback on Wildlife Network")}`} className="text-cyan-400 hover:underline">Reply to {email}</a> : <span className="text-slate-500">No email given</span>}</p>
              </li>
            );
          })}
        </ul>

        <h2 id="datasets" className="mt-10 text-xl font-semibold text-slate-100">Datasets</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {datasets.length === 0 && <li className="text-slate-500">None yet.</li>}
          {datasets.map((d) => (
            <li key={d.id}><Link href={`/datasets/${d.id}`} className="text-cyan-400 hover:underline">{d.title}</Link>
              <span className={d.status === "review" ? "ml-2 text-amber-300" : "ml-2 text-slate-500"}>{d.status === "review" ? "waiting for review" : "live"}</span>
              <span className="ml-2 text-slate-500">{fmt(d.updated_at)}</span></li>
          ))}
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">Elsewhere</h2>
        <ul className="mt-3 list-disc space-y-1 pl-6 text-sm">
          <li><Link href="/admin/apps" className="text-cyan-400 hover:underline">Studio usage in detail</Link></li>
          <li><a href="https://analytics.google.com/analytics/web/#/p557061796/reports/intelligenthome" className="text-cyan-400 hover:underline">Website visitors (Google Analytics)</a></li>
          <li><a href="https://search.google.com/search-console?resource_id=sc-domain%3Awlnw.org" className="text-cyan-400 hover:underline">Search Console</a></li>
          <li><a href="https://github.com/wlnw-org/wildnetwork/issues" className="text-cyan-400 hover:underline">Issues (including help-guide and storage warnings)</a></li>
          <li><a href="https://github.com/wlnw-org/wlnw-studio/releases" className="text-cyan-400 hover:underline">Studio releases and download counts</a></li>
        </ul>
      </div>
    </main>
  );
}

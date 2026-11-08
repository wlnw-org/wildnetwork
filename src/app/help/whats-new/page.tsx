import type { Metadata } from "next";
import Link from "next/link";
import { Rich } from "@/components/HelpText";
import { STUDIO_RELEASES } from "@/lib/site";

export const metadata: Metadata = {
  title: "What's new in Wildlife Network Studio",
  alternates: { canonical: "/help/whats-new" },
  description: "Every Wildlife Network Studio version and what changed, newest first.",
};
export const revalidate = 3600;

interface Release { tag_name: string; published_at: string; body: string | null; draft: boolean; prerelease: boolean }

/** Read straight from the Studio releases on GitHub, so every new version appears here within an hour, with no site change. */
async function releases(): Promise<Release[]> {
  try {
    const r = await fetch("https://api.github.com/repos/wlnw-org/wlnw-studio/releases?per_page=30", { next: { revalidate: 3600 }, headers: { accept: "application/vnd.github+json" } });
    return r.ok ? ((await r.json()) as Release[]).filter((x) => !x.draft && !x.prerelease) : [];
  } catch { return []; }
}

/** Release notes are short Markdown: "## heading" and "- **Bold**: text" bullets. */
function Notes({ md }: { md: string }) {
  const lines = md.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^##\s*what'?s new/i.test(l));
  return <ul className="mt-2 list-disc space-y-1.5 pl-6">{lines.filter((l) => l.startsWith("- ")).map((l) => {
    const m = l.slice(2).match(/^\*\*(.+?)\*\*:?\s*(.*)$/);
    return <li key={l}>{m ? <><b className="text-slate-100">{m[1]}</b>: <Rich text={m[2]} /></> : <Rich text={l.slice(2).replace(/\*\*/g, "")} />}</li>;
  })}</ul>;
}

export default async function WhatsNew() {
  const list = await releases();
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="mt-4 text-sm"><Link href="/help" className="text-cyan-400 hover:underline">Help</Link> / <Link href="/help/studio" className="text-cyan-400 hover:underline">Wildlife Network Studio</Link></p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100">What&apos;s new in Studio</h1>
        <p className="mt-2">Every version, newest first. Studio offers each new version itself when it starts.</p>
        {list.length === 0 && <p className="mt-6">See the <a href={STUDIO_RELEASES} className="text-cyan-400 hover:underline">release notes on GitHub</a>.</p>}
        {list.map((r) => (
          <section key={r.tag_name} id={r.tag_name} className="mt-8 scroll-mt-6">
            <h2 className="text-xl font-semibold text-slate-100">{r.tag_name.replace(/^v/, "Version ")}</h2>
            <p className="text-sm text-slate-400">{new Date(r.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
            {r.body?.trim() ? <Notes md={r.body} /> : <p className="mt-2 text-sm text-slate-400">Fixes and small improvements.</p>}
          </section>
        ))}
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { TR } from "@/components/TR";
import Link from "next/link";
import HelpSearch from "@/components/HelpSearch";
import { HELP, type Block } from "@/data/help";

export const metadata: Metadata = {
  title: "Help and how-to guides",
  alternates: { canonical: "/help" },
  description: "Step-by-step guides for Wildlife Network Studio, the free desktop app for wildlife recordings and camera traps, and for the live map, reports, alerts and data on wlnw.org.",
};

const plain = (b: Block[]) => b.map((x) => ("p" in x ? x.p : "h" in x ? x.h : "tip" in x ? x.tip : "steps" in x ? x.steps.join(" ") : "list" in x ? x.list.join(" ") : x.keys.flat().join(" ")))
  .join(" ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").toLowerCase();

export default function Help() {
  const items = HELP.flatMap((s) => s.guides.map((g) => ({ href: `/help/${s.id}/${g.slug}`, title: g.title, summary: g.summary, section: s.title, text: plain(g.body) })));
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-4xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Help and how-to guides" /></h1>
        <p className="mt-3"><TR k="Short, step-by-step guides for the desktop app and the website. Can't find what you need? [Ask us](/feedback)." /></p>
        <HelpSearch items={items} />
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {HELP.map((s) => (
            <section key={s.id}>
              <h2 className="text-xl font-semibold text-slate-100"><Link href={`/help/${s.id}`} className="hover:underline"><TR k={s.title} /></Link></h2>
              <p className="mt-1 text-sm text-slate-400"><TR k={s.intro} /></p>
              <ul className="mt-3 space-y-2">
                {s.guides.map((g) => <li key={g.slug}><Link href={`/help/${s.id}/${g.slug}`} className="text-cyan-400 hover:underline"><TR k={g.title} /></Link></li>)}
                {s.id === "studio" && <li><Link href="/help/whats-new" className="text-cyan-400 hover:underline"><TR k="What's new in each Studio version" /></Link></li>}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

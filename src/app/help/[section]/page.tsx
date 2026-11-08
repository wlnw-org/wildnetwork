import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HELP, helpSection } from "@/data/help";

export const dynamicParams = false;
export function generateStaticParams() { return HELP.map((s) => ({ section: s.id })); }

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const s = helpSection((await params).section);
  return s ? { title: `${s.title}: guides`, description: s.intro, alternates: { canonical: `/help/${s.id}` } } : {};
}

export default async function HelpSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const s = helpSection((await params).section);
  if (!s) notFound();
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="mt-4 text-sm"><Link href="/help" className="text-cyan-400 hover:underline">Help</Link></p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100">{s.title}</h1>
        <p className="mt-2">{s.intro}</p>
        <ol className="mt-6 space-y-3">
          {s.guides.map((g, i) => (
            <li key={g.slug}><Link href={`/help/${s.id}/${g.slug}`} className="block rounded-lg border border-white/10 bg-white/5 p-4 hover:border-cyan-400/50">
              <span className="text-xs text-slate-500">{i + 1}</span>
              <span className="block font-medium text-slate-100">{g.title}</span>
              <span className="block text-sm text-slate-400">{g.summary}</span>
            </Link></li>
          ))}
        </ol>
        {s.id === "studio" && <p className="mt-6"><Link href="/help/whats-new" className="text-cyan-400 hover:underline">What&apos;s new in each Studio version</Link></p>}
      </div>
    </main>
  );
}

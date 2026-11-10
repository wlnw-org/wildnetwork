import type { Metadata } from "next";
import { TR } from "@/components/TR";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HelpBody } from "@/components/HelpText";
import { HELP, helpGuide, helpSection } from "@/data/help";

export const dynamicParams = false;
export function generateStaticParams() { return HELP.flatMap((s) => s.guides.map((g) => ({ section: s.id, slug: g.slug }))); }

export async function generateMetadata({ params }: { params: Promise<{ section: string; slug: string }> }): Promise<Metadata> {
  const { section, slug } = await params;
  const g = helpGuide(section, slug);
  return g ? { title: g.title, description: g.summary, alternates: { canonical: `/help/${section}/${slug}` } } : {};
}

export default async function HelpGuidePage({ params }: { params: Promise<{ section: string; slug: string }> }) {
  const { section, slug } = await params;
  const s = helpSection(section), g = helpGuide(section, slug);
  if (!s || !g) notFound();
  const i = s.guides.indexOf(g), prev = s.guides[i - 1], next = s.guides[i + 1];
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <article className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="mt-4 text-sm"><Link href="/help" className="text-cyan-400 hover:underline"><TR k="Help" /></Link> / <Link href={`/help/${s.id}`} className="text-cyan-400 hover:underline"><TR k={s.title} /></Link></p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100"><TR k={g.title} /></h1>
        <p className="mt-2 text-slate-400"><TR k={g.summary} /></p>
        <div className="mt-6"><HelpBody body={g.body} /></div>
        <nav className="mt-10 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-6 text-sm">
          {prev ? <Link href={`/help/${s.id}/${prev.slug}`} className="text-cyan-400 hover:underline"><TR k="Previous:" /> <TR k={prev.title} /></Link> : <span />}
          {next ? <Link href={`/help/${s.id}/${next.slug}`} className="text-cyan-400 hover:underline"><TR k="Next:" /> <TR k={next.title} /></Link> : <span />}
        </nav>
        <p className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
          Still stuck, or is something here wrong? <Link href={`/feedback?from=${s.id === "studio" ? "studio" : "website"}`} className="text-cyan-400 hover:underline">Tell us</Link> and we will help, and fix the guide.
        </p>
      </article>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { T } from "@/components/T";

export const metadata: Metadata = { title: "Page not found", robots: { index: false, follow: true } };

/** 404 for unknown URLs and notFound(): rendered inside the root layout, so it has the site header and footer. */
export default function NotFound() {
  const card = "block rounded-lg border border-white/10 bg-white/5 px-4 py-3 hover:border-cyan-400/60";
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-16 text-[15px] leading-relaxed">
        <p className="text-sm font-medium text-cyan-400">404</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100"><T k="Page not found" /></h1>
        <p className="mt-3"><T k="This page does not exist or has moved. Try one of these:" /></p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Link href="/" className={card}><span className="font-medium text-slate-100"><T k="Live map" /></span><span className="block text-sm text-slate-400"><T k="What is being heard and seen now" /></span></Link>
          <Link href="/species" className={card}><span className="font-medium text-slate-100"><T k="Species" /></span><span className="block text-sm text-slate-400"><T k="Arrival dates and movement" /></span></Link>
          <Link href="/report" className={card}><span className="font-medium text-slate-100"><T k="Reports" /></span><span className="block text-sm text-slate-400"><T k="For a place, district or protected area" /></span></Link>
        </div>
      </div>
    </main>
  );
}

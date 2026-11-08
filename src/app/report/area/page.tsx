import type { Metadata } from "next";
import Link from "next/link";
import { PageLang, T } from "@/components/T";
import AreaPicker from "@/components/AreaPicker";

export const metadata: Metadata = {
  title: "Area report: a checklist for a district or protected area",
  alternates: { canonical: "/report/area" },
  description: "Pick a district, protected area or your own boundary and get a printable species checklist from GBIF records and listening stations, with regional arrival dates, downloads for GIS and a citation.",
};

export default function AreaReportStart() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500 flex items-center gap-2">
          <span><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/report" className="text-cyan-400 hover:underline"><T k="Site report" /></Link> / <T k="Area report" /></span>
          <span className="ml-auto"><PageLang /></span>
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><T k="A report for your district or protected area" /></h1>
        <p className="mt-3"><T k="Choose an area and a period. The report lists every species recorded inside the boundary, from open GBIF records and from listening stations, with the usual arrival date in the region. It prints as a PDF with its sources and a citation, and the checklist and boundary download for spreadsheets and GIS." /></p>
        <AreaPicker />
        <p className="mt-6 text-sm text-slate-400"><T k="For a point and a radius, or to compare two periods at a station, use the" /> <Link href="/report" className="text-cyan-400 hover:underline"><T k="site report" /></Link>.</p>
      </div>
    </main>
  );
}

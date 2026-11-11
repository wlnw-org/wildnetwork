import type { Metadata } from "next";
import Link from "next/link";
import LostReportForm from "@/components/LostReportForm";
import { TR } from "@/components/TR";
import { lostSpeciesPublic, type LostPublic } from "@/lib/lostPublic";

export const metadata: Metadata = {
  robots: { index: false },
  title: "Send a possible lost species sighting",
  description: "Think you saw or heard a lost species? Send your photo or recording for private review by experts.",
  alternates: { canonical: "/lost-species/report" },
};

export default async function LostReport() {
  const list = await lostSpeciesPublic().catch(() => [] as LostPublic[]);
  const names = list.map((s) => (s.common_name ? `${s.scientific_name} (${s.common_name})` : s.scientific_name));
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="text-sm"><Link href="/lost-species" className="text-cyan-400 hover:underline"><TR k="Lost species" /></Link></p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Send a possible sighting" /></h1>
        <p className="mt-3"><TR k="Think you saw or heard a lost species? Tell us here. Your report goes to a private review by experts. It is never shown on the site, and we never publish where it was." /></p>
        <p className="mt-2"><TR k="A photo or sound recording helps most. If an expert thinks it is worth a closer look, we pass it to the conservation experts working on that species." /></p>
        <LostReportForm species={names} />
        <p className="mt-8 text-xs text-slate-500"><TR k="What we keep and why is on our" /> <Link href="/privacy#lost-species" className="hover:underline"><TR k="privacy page" /></Link>.</p>
      </div>
    </main>
  );
}

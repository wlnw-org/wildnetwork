import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/orcid";
import DatasetForm from "@/components/DatasetForm";
import ResearchSignIn from "@/components/ResearchSignIn";
import { STUDIO_URL } from "@/lib/site";

export const metadata: Metadata = { title: "Upload a dataset", robots: { index: false, follow: true } };

export default async function NewDataset() {
  const me = await getSession();
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-400"><Link href="/datasets" className="text-cyan-400 hover:underline">Datasets</Link> / New</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Upload a dataset</h1>
        <p className="mt-3 text-sm text-slate-400">
          Have raw recordings rather than detection tables? Process them first with{" "}
          <a href={STUDIO_URL} className="text-cyan-400 hover:underline" rel="noopener">Wildlife Network Studio</a>, a free desktop app that can publish straight to a dataset here.
        </p>
        <ol className="mt-3 list-decimal pl-5 text-slate-400 space-y-1">
          <li>Describe the dataset and who to credit.</li>
          <li>Add your detection tables. They are read in your browser first, so you can check the columns and names.</li>
          <li>Submit. The records are checked; your first datasets are also looked at by a reviewer before they count.</li>
        </ol>
        {me ? <DatasetForm /> : <div className="mt-6"><ResearchSignIn next="/datasets/new" /></div>}
      </div>
    </main>
  );
}

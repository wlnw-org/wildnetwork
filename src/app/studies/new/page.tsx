import type { Metadata } from "next";
import Link from "next/link";
import StudyForm from "@/components/StudyForm";

export const metadata: Metadata = { title: "New study area", robots: { index: false, follow: true } };

export default function NewStudy() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / <Link href="/studies" className="text-cyan-400 hover:underline">Study areas</Link> / New</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">New study area</h1>
        <StudyForm />
      </div>
    </main>
  );
}

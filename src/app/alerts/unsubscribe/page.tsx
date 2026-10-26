import type { Metadata } from "next";
import Unsubscribe from "@/components/Unsubscribe";

export const metadata: Metadata = { title: "Stop alert", robots: { index: false, follow: false } };

/** A button, not a page load: link scanners in mail systems open links and must not unsubscribe people. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-xl px-5 py-16 text-[15px] leading-relaxed">
        <h1 className="text-2xl font-semibold text-slate-100">Stop this alert</h1>
        <p className="mt-3">Your email address will be deleted for this species and place.</p>
        <Unsubscribe token={token} />
      </div>
    </main>
  );
}

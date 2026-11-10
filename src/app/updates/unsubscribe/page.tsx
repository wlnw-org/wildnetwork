import type { Metadata } from "next";
import Unsubscribe from "@/components/Unsubscribe";
import { TR } from "@/components/TR";

export const metadata: Metadata = { title: "Stop update emails", robots: { index: false, follow: false } };

/** A button, not a page load: link scanners in mail systems open links and must not unsubscribe people. */
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-xl px-5 py-16 text-[15px] leading-relaxed">
        <h1 className="text-2xl font-semibold text-slate-100"><TR k="Stop update emails" /></h1>
        <p className="mt-3"><TR k="Your email address will be deleted." /></p>
        <Unsubscribe token={token} endpoint="/api/v1/updates" />
      </div>
    </main>
  );
}

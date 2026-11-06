import type { Metadata } from "next";
import Link from "next/link";
import { confirm } from "@/lib/updates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Updates confirmed", robots: { index: false, follow: false } };

export default async function Confirm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const ok = await confirm((await searchParams).token ?? "");
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-xl px-5 py-16 text-[15px] leading-relaxed">
        <h1 className="text-2xl font-semibold text-slate-100">{ok ? "You are signed up" : "Link not valid"}</h1>
        <p className="mt-3">
          {ok
            ? "You will get a short email every week or two when there is something new. Every email has a link to stop them."
            : "This link has expired or was already used to unsubscribe. Unconfirmed sign-ups are deleted after 7 days."}
        </p>
        <p className="mt-4"><Link href="/updates" className="text-cyan-400 hover:underline">See all updates</Link></p>
      </div>
    </main>
  );
}

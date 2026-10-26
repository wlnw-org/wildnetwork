import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "@/lib/db";
import { speciesSlug } from "@/lib/site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alert confirmed", robots: { index: false, follow: false } };

export default async function Confirm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const [row] = /^[A-Za-z0-9_-]{10,64}$/.test(token)
    ? await sql<{ scientific_name: string; place: string }[]>`
        UPDATE alert_subs SET confirmed_at = COALESCE(confirmed_at, now()) WHERE token = ${token} RETURNING scientific_name, place`
    : [];
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-xl px-5 py-16 text-[15px] leading-relaxed">
        {row ? (
          <>
            <h1 className="text-2xl font-semibold text-slate-100">Alert confirmed</h1>
            <p className="mt-3">
              We will email you when <i>{row.scientific_name}</i> arrives in the 5 degree square around {row.place}: the first records after at least four watched weeks without it.
              Every email has a link to stop it.
            </p>
            <p className="mt-4"><Link href={`/species/${speciesSlug(row.scientific_name)}`} className="text-cyan-400 hover:underline">Back to the species</Link></p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-slate-100">Link not valid</h1>
            <p className="mt-3">This link has expired or was already used to unsubscribe. Unconfirmed requests are deleted after 7 days. <Link href="/species" className="text-cyan-400 hover:underline">Set up a new alert</Link> from any species page.</p>
          </>
        )}
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { TR } from "@/components/TR";
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
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-xl px-5 py-16 text-[15px] leading-relaxed">
        {row ? (
          <>
            <h1 className="text-2xl font-semibold text-slate-100"><TR k="Alert confirmed" /></h1>
            <p className="mt-3">
              <TR k="We will email you when" /> <i>{row.scientific_name}</i> <TR k="arrives in the wider area around {place} (about 550 km across): the first records after a month or more without it. Every email has a link to stop it." v={{ place: row.place }} />
            </p>
            <p className="mt-4"><Link href={`/species/${speciesSlug(row.scientific_name)}`} className="text-cyan-400 hover:underline"><TR k="Back to the species" /></Link></p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-slate-100"><TR k="Link not valid" /></h1>
            <p className="mt-3"><TR k="This link has expired or was already used to unsubscribe. Unconfirmed requests are deleted after 7 days. [Set up a new alert](/species) from any species page." /></p>
          </>
        )}
      </div>
    </main>
  );
}

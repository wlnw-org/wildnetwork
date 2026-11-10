import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Link from "next/link";
import { sql } from "@/lib/db";
import { REGION } from "@/lib/methods";
import { REGIONS } from "@/lib/regions";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "When do birds and other wildlife arrive? Arrival dates by region",
  description: "Month by month arrival dates for birds, bats and other wildlife in Europe, North America, South America, Africa, Asia and Oceania, from acoustic sensors and open biodiversity records.",
  alternates: { canonical: "/arrivals" },
};

export default async function ArrivalsIndex() {
  const counts = await sql<{ region: string; n: number }[]>`
    SELECT ${REGION} AS region, COUNT(DISTINCT scientific_name)::int AS n FROM phenology GROUP BY 1`;
  const n = (name: string) => counts.find((c) => c.region === name)?.n ?? 0;
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">When do birds and other wildlife arrive?</h1>
        <p className="mt-2"><HelpLink to="/help/site/arrivals" /></p>
        <p className="mt-3">
          The week each species was first heard or seen regularly after at least six weeks away, region by region, over the past year.
          Pick a region to see what arrives each month and what is arriving now.
        </p>
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {REGIONS.map((r) => (
            <li key={r.slug}>
              <Link href={`/arrivals/${r.slug}`} className="block rounded-lg border border-white/10 px-4 py-3 hover:border-cyan-400/60">
                <span className="text-slate-100 font-medium">Arrivals in {r.name}</span>
                <span className="block text-sm text-slate-400">{n(r.name).toLocaleString("en-GB")} species</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-sm text-slate-400">
          <Link href="/species" className="text-cyan-400 hover:underline">All species</Link> ·{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline">How arrival dates are measured</Link>
        </p>
      </div>
    </main>
  );
}

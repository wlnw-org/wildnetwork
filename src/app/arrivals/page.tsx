import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Link from "next/link";
import { TR } from "@/components/TR";
import { sql } from "@/lib/db";
import { REGION } from "@/lib/methods";
import { REGIONS } from "@/lib/regions";
import { COUNTRIES, OWN_PAGE, hasPage } from "@/lib/countries";

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
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="When do birds and other wildlife arrive?" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/arrivals" /></p>
        <p className="mt-3">
          <TR k="The week each species was first heard or seen regularly after at least six weeks away, region by region, over the past year. Pick a region to see what arrives each month and what is arriving now." />
        </p>
        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {REGIONS.map((r) => (
            <li key={r.slug}>
              <Link href={`/arrivals/${r.slug}`} className="block rounded-lg border border-white/10 px-4 py-3 hover:border-cyan-400/60">
                <span className="text-slate-100 font-medium"><TR k="Arrivals in {region}" v={{ region: r.name }} /></span>
                <span className="block text-sm text-slate-400"><TR k="{n} species" v={{ n: n(r.name).toLocaleString("en-GB") }} /></span>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/arrivals/uk" className="block rounded-lg border border-white/10 px-4 py-3 hover:border-cyan-400/60">
              <span className="text-slate-100 font-medium"><TR k="When birds arrive in the UK" /></span>
              <span className="block text-sm text-slate-400"><TR k="Summer and winter visitors, half month by half month" /></span>
            </Link>
          </li>
          <li>
            <Link href="/arrivals/india" className="block rounded-lg border border-white/10 px-4 py-3 hover:border-cyan-400/60">
              <span className="text-slate-100 font-medium"><TR k="Migratory birds in India" /></span>
              <span className="block text-sm text-slate-400"><TR k="Winter visitors, month by month" /></span>
            </Link>
          </li>
        </ul>
        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Migratory birds by country" /></h2>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {COUNTRIES.filter((c) => hasPage(c) || OWN_PAGE.has(c.slug)).map((c) => <Link key={c.slug} href={`/arrivals/${c.slug}`} prefetch={false} className="text-cyan-400 hover:underline">{c.name}</Link>)}
        </p>
        <p className="mt-8 text-sm text-slate-400">
          <Link href="/species" className="text-cyan-400 hover:underline"><TR k="All species" /></Link> ·{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline"><TR k="How arrival dates are measured" /></Link>
        </p>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import PLACES from "@/data/places.json";

export const metadata: Metadata = {
  title: "Birds and wildlife near you: city reports",
  description: "Pick a city to see which birds, bats and other animals arrived around it recently, which are expected in the coming weeks and which are recorded most. Or search any town on the live map.",
  alternates: { canonical: "/places" },
};

/** Index of ready-made city reports (src/data/places.json). Any other town is reachable from the map search. */
export default function Places() {
  const byCountry = Object.entries(PLACES.reduce<Record<string, typeof PLACES>>((a, p) => ({ ...a, [p.country ?? "Other"]: [...(a[p.country ?? "Other"] ?? []), p] }), {}))
    .sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / Places</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Birds and wildlife near you</h1>
        <p className="mt-3">
          Each report shows what arrived around a city in the last four weeks, what is expected in the next six, and what is recorded most, for birds, bats,
          frogs and insects. Not listed? Type any town into the search box on the <Link href="/" className="text-cyan-400 hover:underline">live map</Link>.
        </p>
        <div className="mt-6 space-y-4">
          {byCountry.map(([country, ps]) => (
            <section key={country}>
              <h2 className="text-sm font-semibold text-slate-100">{country}</h2>
              <p className="mt-1 text-sm">{ps.map((p, i) => <span key={p.slug}>{i > 0 && " · "}<Link href={`/places/${p.slug}`} className="text-cyan-400 hover:underline">{p.name}</Link></span>)}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

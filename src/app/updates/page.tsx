import type { Metadata } from "next";
import Link from "next/link";
import UpdatesForm from "@/components/UpdatesForm";
import { UPDATES, type UpdateItem } from "@/data/updates";
import { UPDATES_ENABLED } from "@/lib/updates";

export const metadata: Metadata = {
  title: "Updates: what is new",
  alternates: { canonical: "/updates" },
  description: "What changed on Wildlife Network, every week or two: new features, data and methods, in plain words. Sign up to get each update by email.",
};

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default function Updates() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">What is new</h1>
        <p className="mt-3">A short note every week or two on what changed: new features, new data and changes to the methods.</p>

        {UPDATES_ENABLED && (
          <section className="mt-6 rounded-lg border border-white/10 bg-white/5 p-4">
            <h2 className="text-lg font-semibold text-slate-100">Get updates by email</h2>
            <p className="mt-1 text-sm text-slate-400">
              One email per update, every week or two. Confirm by email first; every email has a link to stop them. Your address is stored encrypted and used for
              nothing else (<Link href="/privacy#updates" className="text-cyan-400 hover:underline">privacy</Link>).
            </p>
            <UpdatesForm />
          </section>
        )}

        {UPDATES.map((u) => (
          <article key={u.date} id={u.date} className="mt-10 scroll-mt-6">
            <p className="text-sm text-slate-400">{fmt(u.date)}</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-100">{u.title}</h2>
            <Items items={u.items.filter((i) => !i.forResearchers)} />
            {u.items.some((i) => i.forResearchers) && (
              <>
                <h3 className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-400">For researchers</h3>
                <Items items={u.items.filter((i) => i.forResearchers)} />
              </>
            )}
          </article>
        ))}

        <p className="mt-10 text-sm text-slate-400">
          Every change to how a measure is worked out is also listed in the <Link href="/methods#changes" className="text-cyan-400 hover:underline">methods changelog</Link>.
        </p>
      </div>
    </main>
  );
}

/** A descriptive link label for each place an update points to, instead of a bare "More". */
const LINK_LABEL: [string, string][] = [
  ["/studio", "Get Studio"], ["/datasets", "About datasets"], ["/institutions", "For institutions"], ["/report", "Make a report"],
  ["/projects", "See the projects"], ["/methods", "How it works"], ["/data", "Open data"], ["/places", "Find a place"],
  ["/research", "Research hub"], ["/arrivals", "See arrivals"], ["/species", "Species pages"],
];
const labelFor = (href: string) => LINK_LABEL.find(([p]) => href === p || href.startsWith(p + "/") || href.startsWith(p + "#") || href.startsWith(p + "?"))?.[1] ?? "Read more";

function Items({ items }: { items: UpdateItem[] }) {
  return (
    <ul className="mt-2 list-disc pl-5 space-y-1.5">
      {items.map((i) => (
        <li key={i.text}>{i.text}{i.href && <> <Link href={i.href} className="text-cyan-400 hover:underline">{labelFor(i.href)}</Link></>}</li>
      ))}
    </ul>
  );
}

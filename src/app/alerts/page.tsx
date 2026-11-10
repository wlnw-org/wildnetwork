import type { Metadata } from "next";
import Link from "next/link";
import { T } from "@/components/T";

export const metadata: Metadata = {
  title: "Species alerts: an email when a species arrives near you",
  alternates: { canonical: "/alerts" },
  description: "Get one email when a bird or other species arrives in your area after weeks away. Free, confirmed by email, one click to stop.",
};

/** How species alerts work. The sign-up itself lives on each species page, next to the species it is about. */
export default function Alerts() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100"><T k="Species alerts" /></h1>
        <p className="mt-3"><T k="Get one email when a species arrives in your area after weeks away. Alerts are free and you can stop them in one click." /></p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="How to get one" /></h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li><T k="Open the page of the species you are waiting for, from the species list or the search on the live map." /></li>
          <li><T k={'In the box "Get an email when it arrives near you", enter your email and your town, and press the button.'} /></li>
          <li><T k="Confirm with the link in the email we send. Nothing is sent before you confirm." /></li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/species" className="rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 hover:bg-cyan-400"><T k="Choose a species" /></Link>
          <Link href="/arrivals" className="rounded-md border border-white/15 px-4 py-2 text-slate-100 hover:bg-white/5"><T k="Arrivals by region" /></Link>
        </div>

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="When an alert is sent" /></h2>
        <p className="mt-2">
          <T k="When it is recorded at least three times in the wider area around your town (about 550 km across) this week or last, after a month or more without records. At most one email every eight weeks per species." />{" "}
          <Link href="/methods" className="text-cyan-400 hover:underline"><T k="Methods" /></Link>
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><T k="Your address" /></h2>
        <p className="mt-2">
          <T k="Your address is stored encrypted and used for nothing else." />{" "}
          <Link href="/privacy#alerts" className="text-cyan-400 hover:underline"><T k="Privacy" /></Link>
        </p>
      </div>
    </main>
  );
}

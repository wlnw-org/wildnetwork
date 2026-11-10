import type { Metadata } from "next";
import FeedbackForm from "@/components/FeedbackForm";
import { TR } from "@/components/TR";
import { CONTACT_EMAIL } from "@/lib/nav";

export const metadata: Metadata = {
  title: "Feedback and problem reports",
  alternates: { canonical: "/feedback" },
  description: "Tell us about a problem, a wrong record or an idea for Wildlife Network, the map, Studio, BirdEcho or a station. Every message is read.",
};

const PRODUCTS = ["website", "studio", "birdecho", "agent", "other"];
const clean = (v: string | string[] | undefined, max = 40) => (typeof v === "string" ? v.replace(/[^\w.\- ]/g, "").slice(0, max) : "");

export default async function Feedback({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const from = clean(q.from);
  const product = PRODUCTS.includes(from) ? from : "website";
  const context = [from === "studio" ? "Studio" : from, clean(q.v) && `version ${clean(q.v)}`, clean(q.os)].filter(Boolean).join(", ");
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Feedback" /></h1>
        <p className="mt-3">
          <TR k="Found a problem, a species that should not be there, or have an idea? Tell us here. Every message is read by the maintainer, and goes nowhere else. You can also email [{email}](mailto:{email})." v={{ email: CONTACT_EMAIL }} />
        </p>
        <FeedbackForm product={product} context={from ? context : ""} />
      </div>
    </main>
  );
}

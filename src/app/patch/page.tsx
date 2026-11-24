import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Patch from "@/components/Patch";
import { TR } from "@/components/TR";
import WatchForm from "@/components/WatchForm";

export const metadata: Metadata = {
  title: "Your patch: this year's birds around your place",
  description: "Follow your town or a place you love and see every bird recorded around it this year, what is new this week, and tick off the ones you saw or heard. Free, no sign-up.",
  alternates: { canonical: "/patch" },
};

export default function PatchPage() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Your patch" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/patch" /></p>
        <p className="mt-3"><TR k="Follow a place and watch its year: every bird recorded around it this year, what turned up this week, and your own list of the ones you saw or heard." /></p>
        <Patch />
        <div className="mt-8"><WatchForm /></div>
      </div>
    </main>
  );
}

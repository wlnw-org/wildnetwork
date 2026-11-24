import type { Metadata } from "next";
import Guess from "@/components/Guess";
import HelpLink from "@/components/HelpLink";
import { TR } from "@/components/TR";
import WatchForm from "@/components/WatchForm";

export const metadata: Metadata = {
  title: "Guess the arrival: when will the migrants come back?",
  description: "Guess when swallows, swifts and other migrants will arrive near you, then see how close you were when the birds come back. Free, no sign-up.",
  alternates: { canonical: "/guess" },
};

export default function GuessPage() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Guess the arrival" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/guess" /></p>
        <p className="mt-3"><TR k="Swallows, swifts, warblers: every year they come back at about the same time, but never quite the same day. Guess when they will reach your place, and see how close you were when they arrive." /></p>
        <Guess />
        <div className="mt-8"><WatchForm /></div>
      </div>
    </main>
  );
}

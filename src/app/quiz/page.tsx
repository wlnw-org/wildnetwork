import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Quiz from "@/components/Quiz";
import { TR } from "@/components/TR";

export const metadata: Metadata = {
  title: "Daily bird sound quiz",
  description: "One bird sound a day from your part of the world: listen, pick the bird from four, and keep your streak going. Free, no sign-up.",
  alternates: { canonical: "/quiz" },
};

export default function QuizPage() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Daily bird sound" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/quiz" /></p>
        <p className="mt-3">
          <TR k="Every day, one sound of a bird that people are recording a lot in your part of the world right now. Listen, pick it from four, and come back tomorrow to keep your run going." />
        </p>
        <Quiz />
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import { JoinBox, MakeClass } from "@/components/QuizClass";
import { TR } from "@/components/TR";

export const metadata: Metadata = {
  title: "Daily bird sound for a class",
  description: "Play the daily bird sound with a class: one link for everyone, the same sound for the whole room, and the class's answers revealed when you choose. Free, no accounts.",
  alternates: { canonical: "/quiz/class" },
};

export default function QuizClassPage() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Daily bird sound for a class" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/quiz" /></p>
        <p className="mt-3"><TR k="Make one link for your class. Everyone gets the same bird sound each day, you play it to the room, pupils answer on their own phones or computers, and you reveal how the class answered. No accounts and no names." /></p>
        <MakeClass />
        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Got a class code?" /></h2>
        <JoinBox />
      </div>
    </main>
  );
}

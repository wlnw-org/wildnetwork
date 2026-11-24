import type { Metadata } from "next";
import { ClassView } from "@/components/QuizClass";
import { TR } from "@/components/TR";
import { cleanCode } from "@/lib/quizClassCode";

// One class's live view: private to whoever has the code, never indexed.
export const metadata: Metadata = { title: "Class bird sound", robots: { index: false, follow: false } };

export default async function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const code = cleanCode((await params).code);
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Class bird sound" /></h1>
        {code ? <ClassView code={code} /> : <p className="mt-6"><TR k="This class link has expired or is not right. [Make a new one](/quiz/class)." /></p>}
      </div>
    </main>
  );
}

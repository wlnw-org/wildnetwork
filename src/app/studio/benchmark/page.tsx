import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How fast is Studio?",
  alternates: { canonical: "/studio/benchmark" },
  description: "How long Wildlife Network Studio takes to run BirdNET 2.4 on an hour of audio on a laptop, how the results were checked against BirdNET-Analyzer, and how to repeat the test.",
};

export default function Benchmark() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="mt-4 text-sm"><Link href="/studio" className="text-cyan-400 hover:underline">Studio</Link></p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100">How fast is Studio?</h1>
        <p className="mt-3">
          On a laptop with an Apple M3 chip, Studio runs BirdNET 2.4 on an hour of audio in <b className="text-slate-100">13 to 17 seconds</b>, about
          210 to 275 times faster than real time. A season of 1,000 hours of recordings takes roughly 4 to 5 hours on the same laptop.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">Same results as BirdNET-Analyzer</h2>
        <p className="mt-2">
          Studio runs BirdNET, the model made by the K. Lisa Yang Center for Conservation Bioacoustics at the Cornell Lab of Ornithology and Chemnitz
          University of Technology. It builds BirdNET&apos;s spectrograms itself and runs the model through ONNX Runtime, so we checked it against
          BirdNET-Analyzer 2.4.0, the BirdNET team&apos;s own program: on the same recording, place and week, both found the same 10 detections at the same
          times, with scores within 0.005 of each other.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">What was measured</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-6">
          <li>Computer: a Mac with an Apple M3 chip (8 cores) and 8 GB memory, macOS 27.2.</li>
          <li>Recording: one test recording, one hour, mono, 48 kHz, 16-bit WAV (346 MB), already in the computer&apos;s file cache.</li>
          <li>Studio&apos;s engine, built from the Studio source on 8 November 2026 and run from its command line, timed from start to finish including loading the model. Two runs: 17 s, then 13 s.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">Limits of this test</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-6">
          <li>One computer and one recording. Windows, Linux and slower laptops are still to be measured; results will be added here.</li>
          <li>Many short files carry more start-up cost per hour of audio than one long file.</li>
          <li>Perch 2.0 is a larger model and runs slower; it has not been timed here.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">Repeat it yourself</h2>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-slate-900 p-4 text-xs text-slate-200">{`# Wildlife Network Studio engine (from github.com/wlnw-org/wlnw-studio)
cargo build --release -p wlnw-engine --bin wlnw
wlnw scan test.wlnw <folder of recordings>
wlnw place test.wlnw 1 <latitude> <longitude> <UTC offset>
wlnw use test.wlnw birdnet-2.4
time wlnw run test.wlnw <models folder>`}</pre>
        <p className="mt-3 text-sm text-slate-400">
          Measured on 8 November 2026. Timed it on your own computer? <Link href="/feedback?from=studio" className="text-cyan-400 hover:underline">Send us the numbers</Link> and we will add them.
        </p>
      </div>
    </main>
  );
}

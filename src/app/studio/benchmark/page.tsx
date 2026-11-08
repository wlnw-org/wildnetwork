import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Studio speed benchmark: BirdNET in Studio and BirdNET-Analyzer",
  alternates: { canonical: "/studio/benchmark" },
  description: "How fast Wildlife Network Studio runs BirdNET 2.4 compared with BirdNET-Analyzer 2.4.0 on the same recording and the same computer, with identical results, and how to repeat the test.",
};

const RUNS: { tool: string; setting: string; seconds: string; speed: string; note?: string }[] = [
  { tool: "BirdNET-Analyzer 2.4.0", setting: "8 threads, batch size 1 (default)", seconds: "64", speed: "56x", note: "161 s wall time on its first run, which includes one-time setup" },
  { tool: "BirdNET-Analyzer 2.4.0", setting: "8 threads, batch size 32", seconds: "50", speed: "73x", note: "63 s wall time" },
  { tool: "Wildlife Network Studio engine", setting: "default (all 8 cores)", seconds: "13 to 17", speed: "210 to 275x", note: "including start-up and model loading" },
];

export default function Benchmark() {
  const th = "py-2 pr-4 text-left font-medium text-slate-400", td = "py-2 pr-4 align-top";
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <p className="mt-4 text-sm"><Link href="/studio" className="text-cyan-400 hover:underline">Studio</Link></p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-100">How fast is Studio?</h1>
        <p className="mt-3">
          On the same one-hour recording and the same laptop, Studio ran BirdNET 2.4 <b className="text-slate-100">3 to 4 times faster</b> than
          BirdNET-Analyzer 2.4.0, the official BirdNET program, and found <b className="text-slate-100">the same detections</b>.
        </p>

        <table className="mt-6 w-full text-sm">
          <thead><tr className="border-b border-white/10"><th className={th}>Program</th><th className={th}>Settings</th><th className={th}>Seconds for 1 hour of audio</th><th className={th}>Speed (times real time)</th></tr></thead>
          <tbody>{RUNS.map((r) => (
            <tr key={r.setting} className="border-b border-white/5">
              <td className={td}>{r.tool}</td><td className={td}>{r.setting}</td>
              <td className={td}>{r.seconds}{r.note && <span className="block text-xs text-slate-500">{r.note}</span>}</td>
              <td className={`${td} font-medium text-slate-100`}>{r.speed}</td>
            </tr>
          ))}</tbody>
        </table>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">Same results</h2>
        <p className="mt-2">
          With the same place and week (location filter on) and a minimum score of 0.25, both found the same 10 detections, at the same times, with
          scores within 0.005 of each other. Studio reads the audio and builds BirdNET&apos;s spectrograms itself, then runs the same model through ONNX
          Runtime, so a speed difference is only worth something if the answers match. They do.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">What was measured</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-6">
          <li>Computer: a Mac with an Apple M3 chip (8 cores) and 8 GB memory, macOS 27.2.</li>
          <li>Recording: one test recording, one hour, mono, 48 kHz, 16-bit WAV (346 MB).</li>
          <li>BirdNET-Analyzer 2.4.0 from PyPI with TensorFlow 2.21.0 on Python 3.11, run from the command line with <code>--lat --lon --week</code>. Times are its own &quot;Finished in&quot; figure; start-up shown separately.</li>
          <li>Studio: the engine the desktop app uses, built from the Studio source on 8 November 2026 and run from its command line, timed from start to finish including loading the model.</li>
          <li>BirdNET-Analyzer was run once with each setting and Studio twice (17 s, then 13 s). The recording had been read before, so it was in the computer&apos;s file cache for the timed runs.</li>
        </ul>
        <p className="mt-3">
          In the desktop app (Studio 0.1.5 and later), two cached hours of similar recordings took 11 to 12 seconds, with the window in front or hidden.
          The command-line figures above are the like-for-like comparison.
        </p>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">Limits of this test</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-6">
          <li>One computer and one recording. Windows, Linux, slower laptops and GPUs are still to be measured; results will be added here.</li>
          <li>BirdNET-Analyzer can use a GPU, which can change the picture on machines that have one. Studio runs on the CPU.</li>
          <li>Speed depends on file length: many short files carry more start-up cost per hour of audio in any program.</li>
          <li>This compares BirdNET only. Perch 2.0 is a larger model and runs slower; it has not been timed here.</li>
        </ul>

        <h2 className="mt-10 text-xl font-semibold text-slate-100">Repeat it yourself</h2>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-slate-900 p-4 text-xs text-slate-200">{`# BirdNET-Analyzer
python3.11 -m venv venv && venv/bin/pip install birdnet-analyzer==2.4.0
venv/bin/python -m birdnet_analyzer.analyze in -o out -t 8 -b 32 --lat 4.44 --lon 82.2 --week 47

# Wildlife Network Studio engine (from github.com/wlnw-org/wlnw-studio)
cargo build --release -p wlnw-engine --bin wlnw
wlnw scan test.wlnw in
wlnw place test.wlnw 1 4.44 82.2 0
wlnw use test.wlnw birdnet-2.4
time wlnw run test.wlnw <models folder>`}</pre>
        <p className="mt-3 text-sm text-slate-400">
          Measured on 8 November 2026. Ran it on your own machine? <Link href="/feedback?from=studio" className="text-cyan-400 hover:underline">Send us the numbers</Link> and
          we will add them, whichever program comes out ahead.
        </p>
      </div>
    </main>
  );
}

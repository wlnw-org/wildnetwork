import type { Metadata } from "next";
import Link from "next/link";
import StudioDownload from "@/components/StudioDownload";
import { STUDIO_DOWNLOADS, STUDIO_RELEASES } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wildlife Network Studio: free desktop app for wildlife recordings",
  alternates: { canonical: "/studio" },
  description: "Wildlife Network Studio is a free desktop app for Mac and Windows. Point it at a drive of recordings: it finds the species on your own computer with BirdNET or Perch, helps you check them in minutes, and exports them for GBIF or publishes them to Wildlife Network.",
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) =>
  href.startsWith("/") ? <Link href={href} className="text-cyan-400 hover:underline">{children}</Link> : <a href={href} className="text-cyan-400 hover:underline">{children}</a>;

export default function Studio() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <nav className="text-sm text-slate-500"><Link href="/" className="text-cyan-400 hover:underline">Wildlife Network</Link> / Studio</nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Wildlife Network Studio</h1>
        <p className="mt-3">
          A free desktop app for the recordings sitting on your drives. Point it at a folder or an SD card copy: it finds the species on your own computer,
          helps you check them in minutes, and exports them for GBIF or publishes them here. Nothing is uploaded unless you choose to publish.
        </p>

        <StudioDownload />
        <p className="mt-3 text-sm text-slate-400">
          Free, open source (Apache 2.0), no account needed. On first use the app downloads the Perch model (about 410 MB).{" "}
          <A href={STUDIO_RELEASES}>All versions and release notes</A>.
        </p>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">What it does</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Finds species fast</b>: BirdNET and Google&apos;s Perch run on your own computer, hundreds of times faster than real time with BirdNET. Perch is used first in Africa and South Asia, where it knows more species.</li>
          <li><b>Handles whole field seasons</b>: thousands of recordings and terabytes of audio. Pause any time; it carries on where it stopped.</li>
          <li><b>Quick review</b>: listen to clips with their spectrogram and answer yes or no. Studio sets a threshold per species from your answers.</li>
          <li><b>Learns your local species</b>: the Wildlife Network Classifier trains on your answers and examples, and can find more sounds like one you pick.</li>
          <li><b>Keeps a record</b>: a Files list shows every recording and its status, and History lists every run, export and publish.</li>
          <li><b>Exports</b>: Darwin Core Archive for GBIF, CSV, WDX, or Raven and Audacity tables, or publish straight to a <A href="/datasets/new">dataset here</A>.</li>
        </ul>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">Installing</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Mac</b>: open the downloaded file and drag Studio to Applications. The app is signed and notarized by Apple. Macs with an Intel processor are not supported yet.</li>
          <li><b>Windows</b>: run the installer. The installer is not code signed yet, so Windows may show a blue SmartScreen message: choose <i>More info</i>, then <i>Run anyway</i>. Prefer an MSI for managed computers? <A href={STUDIO_DOWNLOADS.windowsMsi}>Download the MSI</A>.</li>
        </ul>

        <p className="mt-10 text-sm text-slate-400">
          Source code: <A href="https://github.com/wlnw-org/wlnw-studio">github.com/wlnw-org/wlnw-studio</A>. Problems or ideas? <A href="https://github.com/wlnw-org/wlnw-studio/issues">Open an issue</A> or email arunrajiah@gmail.com.
        </p>
      </div>
    </main>
  );
}

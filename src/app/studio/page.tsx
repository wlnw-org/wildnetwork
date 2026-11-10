import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Link from "next/link";
import StudioDownload from "@/components/StudioDownload";
import { STUDIO_RELEASES, studioDownload } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wildlife Network Studio: free desktop app for wildlife recordings",
  alternates: { canonical: "/studio" },
  description: "Wildlife Network Studio is a free desktop app for Mac, Windows and Linux. Point it at a drive of recordings: it finds the species on your own computer with BirdNET or Perch, helps you check them in minutes, and exports them for GBIF or publishes them to Wildlife Network.",
};

const A = ({ href, children }: { href: string; children: React.ReactNode }) =>
  href.startsWith("/") ? <Link href={href} className="text-cyan-400 hover:underline">{children}</Link> : <a href={href} className="text-cyan-400 hover:underline">{children}</a>;

export default function Studio() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Wildlife Network Studio</h1>
        <p className="mt-2"><HelpLink to="/help/studio" label="Studio guides: how to use it" /></p>
        <p className="mt-3">
          A free desktop app for the recordings sitting on your drives. Point it at a folder or an SD card copy: it finds the species on your own computer,
          helps you check them in minutes, and exports them for GBIF or publishes them here. Nothing is uploaded unless you choose to publish.
        </p>

        <StudioDownload />
        <p className="mt-3 text-sm text-slate-400">
          Free, open source (Apache 2.0), no account needed. On first use the app downloads the Perch model (about 410 MB).{" "}
          <A href={STUDIO_RELEASES}>All versions and release notes</A>. If Studio saves you time, you can{" "}
          <A href="https://github.com/sponsors/arunrajiah">support it on GitHub Sponsors</A>.
        </p>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">What it does</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Finds species fast</b>: BirdNET and Google&apos;s Perch run on your own computer, hundreds of times faster than real time with BirdNET (<A href="/studio/benchmark">about an hour of audio in 15 seconds</A> on a laptop). Perch is used first in Africa and South Asia, where it knows more species.</li>
          <li><b>Handles whole field seasons</b>: thousands of recordings and terabytes of audio. Pause any time; it carries on where it stopped.</li>
          <li><b>Quick review</b>: listen to clips with their spectrogram and answer yes or no. Studio sets a threshold per species from your answers.</li>
          <li><b>Learns your local species</b>: the Wildlife Network Classifier trains on your answers and examples, and can find more sounds like one you pick.</li>
          <li><b>Keeps a record</b>: a Files list shows every recording and its status, and History lists every run, export and publish.</li>
          <li><b>Bats and camera traps</b>: BatDetect2 for UK bats (clips played 10 times slower so calls can be heard), and SpeciesNet with MegaDetector for camera-trap photos, checked against each camera&apos;s country.</li>
          <li><b>Brings in other tools&apos; results</b>: BirdNET-Analyzer, BirdNET-Pi, BirdNET-Go, Raven and Kaleidoscope tables, reviewed and published without processing the audio again. Two people can review the same recordings and compare.</li>
          <li><b>Exports</b>: Darwin Core Archive for GBIF, CSV, WDX, Raven and Audacity tables, Kaleidoscope id.csv or Camtrap DP, or publish straight to a <A href="/datasets/new">dataset here</A>.</li>
        </ul>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">See how it works</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            ["add-recordings", "1. Add a folder of recordings, then name each recorder and say where it was.", "Adding a folder of recordings and entering the recorder's name and place", 626],
            ["find-species", "2. Find species. The models run on your own computer.", "Finding species, with recordings done, minutes of audio and detections", 564],
            ["review", "3. Check the results. Play clips and answer yes, no or not sure.", "Reviewing Eurasian Blackbird clips on the spectrogram", 564],
            ["export", "4. Export for GBIF, as CSV or Raven tables, or publish here.", "The export screen with dataset details and export formats", 564],
          ].map(([name, caption, alt, h]) => (
            <figure key={name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/studio/${name}.gif`} alt={alt as string} width={960} height={h as number} loading="lazy" className="w-full rounded-lg border border-white/10" />
              <figcaption className="mt-2 text-sm text-slate-300">{caption}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-4">Video guides: <A href="https://youtu.be/vDXEllkJIJM">your first project, from recordings to results</A> (3 minutes) and <A href="https://youtu.be/wjGv_3yQeBk">find more of a sound and teach Studio your local species</A> (2 minutes).</p>
        <p className="mt-3 text-xs text-slate-500">The recordings in these clips are CC0 bird recordings shared by iNaturalist users.</p>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100">Installing</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><b>Mac</b>: open the downloaded file and drag Studio to Applications. The app is signed and notarized by Apple. Macs with an Intel processor have their own download, just below the buttons.</li>
          <li><b>Windows</b>: run the installer. The installer is not code signed yet, so Windows may show a blue SmartScreen message: choose <i>More info</i>, then <i>Run anyway</i>. Prefer an MSI for managed computers? <A href={studioDownload("windowsMsi")}>Download the MSI</A>.</li>
          <li><b>Linux</b> (64-bit, Ubuntu 22.04 or newer and similar): <A href={studioDownload("linux")}>AppImage</A> (make it executable, then run it) or <A href={studioDownload("linuxDeb")}>.deb package</A> for Debian and Ubuntu.</li>
          <li><b>Updates</b>: Studio checks for a new version when it starts and offers to install it. The check sends only the app version and system, counted on wlnw.org without identifying you (<A href="/privacy#apps">privacy</A>).</li>
        </ul>

        <p className="mt-10 text-sm text-slate-400">
          Source code: <A href="https://github.com/wlnw-org/wlnw-studio">github.com/wlnw-org/wlnw-studio</A>. Problems or ideas? <A href="/feedback?from=studio">Send feedback</A> or <A href="https://github.com/wlnw-org/wlnw-studio/issues">open an issue</A>.
        </p>
      </div>
    </main>
  );
}

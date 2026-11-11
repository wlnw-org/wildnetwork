import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import StudioDownload from "@/components/StudioDownload";
import { STUDIO_RELEASES, studioDownload } from "@/lib/site";
import { TR } from "@/components/TR";

export const metadata: Metadata = {
  title: "Wildlife Network Studio: free desktop app for wildlife recordings",
  alternates: { canonical: "/studio" },
  description: "Wildlife Network Studio is a free desktop app for Mac, Windows and Linux. Point it at a drive of recordings: it finds the species on your own computer with BirdNET or Perch, helps you check them in minutes, and exports them for GBIF or publishes them to Wildlife Network.",
};

export default function Studio() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100">Wildlife Network Studio</h1>
        <p className="mt-2"><HelpLink to="/help/studio" label="Studio guides: how to use it" /></p>
        <p className="mt-3">
          <TR k="A free desktop app for the recordings sitting on your drives. Point it at a folder or an SD card copy: it finds the species on your own computer, helps you check them in minutes, and exports them for GBIF or publishes them here. Nothing is uploaded unless you choose to publish." />
        </p>

        <StudioDownload />
        <p className="mt-3 text-sm text-slate-400">
          <TR k="Free and open source, no account needed. [Licences and credits](#credits) are below. On first use the app downloads the Perch model (about 410 MB). [All versions and release notes]({releases}). If Studio saves you time, you can [support it on GitHub Sponsors](https://github.com/sponsors/arunrajiah)." v={{ releases: STUDIO_RELEASES }} />
        </p>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100"><TR k="What it does" /></h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><TR k="**Finds species fast**: BirdNET and Google's Perch run on your own computer, hundreds of times faster than real time with BirdNET (about an hour of audio in 15 seconds on a laptop; [speed test details](/studio/benchmark), technical). Perch is used first in Africa and South Asia, where it knows more species." /></li>
          <li><TR k="**Handles whole field seasons**: thousands of recordings and terabytes of audio. Pause any time; it carries on where it stopped." /></li>
          <li><TR k="**Quick review**: listen to clips with their spectrogram and answer yes or no. Studio sets a threshold per species from your answers." /></li>
          <li><TR k="**Learns your local species**: the Wildlife Network Classifier trains on your answers and examples, and can find more sounds like one you pick." /></li>
          <li><TR k="**Keeps a record**: a Files list shows every recording and its status, and History lists every run, export and publish." /></li>
          <li><TR k="**Bats and camera traps**: BatDetect2 for UK bats (clips played 10 times slower so calls can be heard), and SpeciesNet with MegaDetector for camera-trap photos, checked against each camera's country." /></li>
          <li><TR k="**Brings in other tools' results**: BirdNET-Analyzer, BirdNET-Pi, BirdNET-Go, Raven and Kaleidoscope tables, reviewed and published without processing the audio again. Two people can review the same recordings and compare." /></li>
          <li><TR k="**Exports**: Darwin Core Archive for GBIF, CSV, WDX, Raven and Audacity tables, Kaleidoscope id.csv or Camtrap DP, or publish straight to a [dataset here](/datasets/new)." /></li>
        </ul>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100"><TR k="See how it works" /></h2>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            ["add-recordings", <TR key="c" k="1. Add a folder of recordings, then name each recorder and say where it was." />, "Adding a folder of recordings and entering the recorder's name and place", 626],
            ["find-species", <TR key="c" k="2. Find species. The models run on your own computer." />, "Finding species, with recordings done, minutes of audio and detections", 564],
            ["review", <TR key="c" k="3. Check the results. Play clips and answer yes, no or not sure." />, "Reviewing Eurasian Blackbird clips on the spectrogram", 564],
            ["export", <TR key="c" k="4. Export for GBIF, as CSV or Raven tables, or publish here." />, "The export screen with dataset details and export formats", 564],
          ].map(([name, caption, alt, h]) => (
            <figure key={name as string}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/studio/${name as string}.gif`} alt={alt as string} width={960} height={h as number} loading="lazy" className="w-full rounded-lg border border-white/10" />
              <figcaption className="mt-2 text-sm text-slate-300">{caption}</figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-4"><TR k="Video guides: [your first project, from recordings to results](https://youtu.be/vDXEllkJIJM) (3 minutes), [find more of a sound and teach Studio your local species](https://youtu.be/wjGv_3yQeBk) (2 minutes), [find the animals in your camera trap photos](https://youtu.be/4oAlzlFbEHM) (2 minutes), and [bring in your BirdNET-Pi or BirdNET-Go results](https://youtu.be/sbfrETlYG44) (1 minute)." /></p>
        <p className="mt-3 text-xs text-slate-500"><TR k="The recordings in these clips are CC0 bird recordings shared by iNaturalist users." /></p>

        <h2 className="mt-10 mb-2 text-xl font-semibold text-slate-100"><TR k="Installing" /></h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><TR k="**Mac**: open the downloaded file and drag Studio to Applications. The app is signed and notarized by Apple. Macs with an Intel processor have their own download, just below the buttons." /></li>
          <li><TR k="**Windows**: run the installer. The installer is not code signed yet, so Windows may show a blue SmartScreen message: choose" /> <i><TR k="More info" /></i>, <TR k="then" /> <i><TR k="Run anyway" /></i>. <TR k="Prefer an MSI for managed computers? [Download the MSI]({msi})." v={{ msi: studioDownload("windowsMsi") }} /></li>
          <li><TR k="**Linux** (64-bit, Ubuntu 22.04 or newer and similar): [AppImage]({appimage}) (make it executable, then run it) or [.deb package]({deb}) for Debian and Ubuntu." v={{ appimage: studioDownload("linux"), deb: studioDownload("linuxDeb") }} /></li>
          <li><TR k="**Updates**: Studio checks for a new version when it starts and offers to install it. The check sends only the app version and system, counted on wlnw.org without identifying you ([privacy](/privacy#apps))." /></li>
        </ul>

        <h2 id="credits" className="mt-10 mb-2 scroll-mt-16 text-xl font-semibold text-slate-100"><TR k="Credits and licences" /></h2>
        <p><TR k="Studio's own code is free and open source under the Apache 2.0 licence. The part of Studio that reproduces BatDetect2 is under BatDetect2's own licence, CC BY-NC 4.0, so the bat feature is for non-commercial use only. Each model keeps its own licence. Studio names the model and its paper in every export, so please cite them too." /></p>
        <ul className="mt-3 list-disc pl-5 space-y-2">
          <li><TR k="**BirdNET 2.4** by the K. Lisa Yang Center for Conservation Bioacoustics at the Cornell Lab of Ornithology and Chemnitz University of Technology. CC BY-NC-SA 4.0, used with the BirdNET team's permission for research and conservation. [Paper](https://doi.org/10.1016/j.ecoinf.2021.101236), [source](https://github.com/birdnet-team/BirdNET-Analyzer)." /></li>
          <li><TR k="**Perch 2.0** by Google DeepMind and Google Research. Apache 2.0. [Paper](https://arxiv.org/abs/2508.04665)." /></li>
          <li><TR k="**BatDetect2** by Oisin Mac Aodha, Santiago Martínez Balvanera and contributors. CC BY-NC 4.0, non-commercial use only. Its authors publish the model themselves, so you make the Studio files from their official package ([how](/help/studio/bats)). [Paper](https://doi.org/10.1101/2022.12.14.520490), [source](https://github.com/macaodha/batdetect2)." /></li>
          <li><TR k="**SpeciesNet** by Google, Apache 2.0, and **MegaDetector v6** by Microsoft's AI for Good Lab, MIT code with CC BY 4.0 weights. [SpeciesNet paper](https://doi.org/10.1049/cvi2.12318), [MegaDetector paper](https://arxiv.org/abs/2405.12930)." /></li>
        </ul>

        <p className="mt-10 text-sm text-slate-400">
          <TR k="Source code: [github.com/wlnw-org/wlnw-studio](https://github.com/wlnw-org/wlnw-studio). Problems or ideas? [Send feedback](/feedback?from=studio) or [open an issue](https://github.com/wlnw-org/wlnw-studio/issues)." />
        </p>
      </div>
    </main>
  );
}

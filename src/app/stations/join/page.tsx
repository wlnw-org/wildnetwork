import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import Link from "next/link";
import OptinForm from "@/components/OptinForm";
import { TR } from "@/components/TR";

export const metadata: Metadata = {
  title: "Add your BirdWeather station",
  alternates: { canonical: "/stations/join" },
  description: "Add your BirdWeather station to Wildlife Network: appear by name or anonymously, and share its daily species counts in open, citable data releases under your licence.",
};

export default function Join() {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/stations" className="text-sm text-cyan-400 hover:underline">← <TR k="Stations" /></Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Add your BirdWeather station" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/contribute" /></p>
        <p className="mt-3">
          <TR k="If your station reports to BirdWeather, a sample of its detections is already on the map, at an approximate position and without its name. Opting in puts you in control of more: your station appears on the [stations page](/stations) under a name you choose (or none), and its full daily species counts can go into Wildlife Network's [open data releases](/data), which researchers cite, under the licence you pick." />
        </p>

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="What happens with your token" /></h2>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li><TR k="It is checked with BirdWeather, then stored encrypted. It is used only to **read** your station's daily species counts; Wildlife Network never posts anything to your station." /></li>
          <li><TR k="Only counts per species per day are kept. No recordings, soundscapes or individual detections." /></li>
          <li><TR k="Your location is rounded to the precision you choose before anything is shown or published, and BirdWeather's own location privacy setting still applies." /></li>
          <li><TR k="Withdraw here at any time with the same token, or by email: the token is forgotten and your station's data deleted. Releases already published keep their copy; later ones leave your station out." /></li>
          <li><TR k="If you revoke the token at BirdWeather, your opt-in ends automatically and the data is deleted." /></li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold text-slate-100"><TR k="Where to find your token" /></h2>
        <p className="mt-2">
          <TR k="It is the token you entered in BirdNET-Pi or BirdNET-Go to connect to BirdWeather, and it is shown in your station's settings on [app.birdweather.com](https://app.birdweather.com). For a BirdWeather PUC, open the station in the BirdWeather app or website and look under its settings." />
        </p>

        <OptinForm />

        <p className="mt-6 text-sm text-slate-400">
          <TR k="Wildlife Network is independent of BirdWeather and non-commercial; data from BirdWeather stations is never used commercially. Questions or problems: {email}. See also the [privacy page](/privacy)." v={{ email: "arunrajiah@gmail.com" }} />
        </p>
      </div>
    </main>
  );
}

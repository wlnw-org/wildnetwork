import type { Metadata } from "next";
import Link from "next/link";
import CopyBlock from "@/components/CopyBlock";
import HelpLink from "@/components/HelpLink";
import { ClaimForm, DeviceCard } from "@/components/MyStations";
import { TR } from "@/components/TR";
import { getClaims, loadMyDevices } from "@/lib/myStations";

// Reads this browser's cookie: never cached, never indexed, not in the sitemap.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "My stations",
  alternates: { canonical: "/stations/mine" },
  description: "Manage your station from anywhere: its health, test mode and alerts.",
};

export default async function MyStationsPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  const devices = await loadMyDevices(await getClaims());
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-2xl px-5 py-10 text-[15px] leading-relaxed">
        <Link href="/stations" className="text-sm text-cyan-400 hover:underline">← <TR k="Stations" /></Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="My stations" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/manage-station" /></p>
        <p className="mt-3">
          <TR k="Check on your station and change its settings from anywhere, without being on the same Wi-Fi. Add it once with its device key: this browser then remembers the station, not the key." />
        </p>
        {link === "added" && (
          <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
            <TR k="Station added from the BirdEcho app. This browser now remembers it." />
          </p>
        )}
        {link === "expired" && (
          <p role="alert" className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            <TR k="That link from the BirdEcho app has expired (links last 10 minutes). Tap Manage from anywhere in the app again." />
          </p>
        )}

        {devices.length > 0 && (
          <ul className="mt-6 space-y-4">
            {devices.map((d) => <DeviceCard key={d.id} d={d} />)}
          </ul>
        )}

        <h2 className="mt-10 text-xl font-semibold text-slate-100">{devices.length ? <TR k="Add another station" /> : <TR k="Add your station" />}</h2>
        <ClaimForm />

        <h2 className="mt-10 text-xl font-semibold text-slate-100"><TR k="Where to find the device key" /></h2>
        <p className="mt-2">
          <TR k="Every station that sends to Wildlife Network has its own key, a line that starts with **wn_**. It is kept on the station itself, in the file /etc/wdx-agent.ini, on the line that starts with api_key. On the station (with a keyboard and screen, or over SSH), this shows it:" />
        </p>
        <CopyBlock>sudo grep api_key /etc/wdx-agent.ini</CopyBlock>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><TR k="A Wildlife Network Base gets its key by itself the first time it is online, and never shows it on its setup page. To read it over SSH, put your SSH key on the card first: see the [Base guide on GitHub](https://github.com/arunrajiah/wildnetwork-base#readme)." /></li>
          <li><TR k="Set up your Base with the BirdEcho app? Open the Base in the app and tap **Manage from anywhere**: it adds the station here without showing the key." /></li>
          <li><TR k="If you registered the station yourself (in the BirdEcho app or with the install command), you were shown the key once then. That is the same key." /></li>
          <li><TR k="Treat the key like a password: anyone who has it can send detections as your station. We check it once and do not keep it here. If you think someone else has it, [tell us](/feedback) and we will replace it." /></li>
        </ul>

        <p className="mt-8 text-sm text-slate-400">
          <TR k="This page uses one cookie that lists the stations you added on this browser, signed so it cannot be changed. It holds no key and no personal details. See the [privacy page](/privacy#stations)." />
        </p>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import HelpLink from "@/components/HelpLink";
import { STUDIO_URL } from "@/lib/site";
import CopyBlock from "@/components/CopyBlock";
import { sql } from "@/lib/db";
import { MIN_EFFORT_WEEK, REGION } from "@/lib/methods";
import { TR } from "@/components/TR";

export const metadata: Metadata = {
  title: "Contribute data: connect a bird station, bat detector or camera trap",
  alternates: { canonical: "/contribute" },
  description: "How to send detections from a bird station, bat detector or camera trap to Wildlife Network, whether you already have a device or want to set one up.",
};

const SITE = "https://wlnw.org";
/** Deployments that are people's observations rather than recorders. */
const OBSERVER_SOURCES = ["inaturalist", "gbif", "obis", "acartia"];
const AGENT = "https://github.com/arunrajiah/wdx-agent";
const BIRDECHO = "https://play.google.com/store/apps/details?id=dev.arunrajiah.birdecho";
export const revalidate = 86400;

interface Gap { region: string; stations: number; watched: number }

/**
 * Recording stations per continent (and India), and how many 5 degree areas they watch with the coverage map's rule
 * (/api/v1/coverage, /methods#coverage): MIN_EFFORT_WEEK bird detections a week, averaged over four weeks ending two
 * weeks ago. Stations are counted, never named (BirdWeather's conditions). Thinnest first.
 */
async function gaps(): Promise<Gap[]> {
  const india = (lat: ReturnType<typeof sql>, lon: ReturnType<typeof sql>) => sql`(${lat} BETWEEN 5 AND 30 AND ${lon} BETWEEN 65 AND 90)`;
  const [st, cov] = await Promise.all([
    sql<{ region: string; india: boolean; n: number }[]>`
      SELECT ${REGION} AS region, ${india(sql`cell_lat`, sql`cell_lon`)} AS india, COUNT(*)::int AS n
      FROM (SELECT (FLOOR(ST_Y(geom::geometry) / 5) * 5)::int AS cell_lat, (FLOOR(ST_X(geom::geometry) / 5) * 5)::int AS cell_lon
            FROM deployments WHERE last_seen > now() - interval '30 days' AND source_system <> ALL(${OBSERVER_SOURCES})) d
      GROUP BY 1, 2`,
    sql<{ region: string; india: boolean; n: number }[]>`
      SELECT ${REGION} AS region, ${india(sql`cell_lat`, sql`cell_lon`)} AS india, COUNT(*)::int AS n FROM (
        SELECT cell_lat, cell_lon FROM effort_weekly_source
        WHERE grp = 'avian' AND source_system = 'birdweather' AND week > CURRENT_DATE - 42 AND week <= CURRENT_DATE - 14
        GROUP BY 1, 2 HAVING SUM(detections)::float / 4 >= ${MIN_EFFORT_WEEK}) c
      GROUP BY 1, 2`,
  ]).catch(() => [[], []]);
  const by = new Map<string, Gap>();
  const add = (rows: { region: string; india: boolean; n: number }[], k: "stations" | "watched") => {
    for (const r of rows) for (const name of r.india ? [r.region, "India"] : [r.region]) {
      const g = by.get(name) ?? { region: name, stations: 0, watched: 0 };
      g[k] += r.n;
      by.set(name, g);
    }
  };
  add(st, "stations"); add(cov, "watched");
  return [...by.values()].sort((a, b) => a.stations - b.stations);
}

export default async function Contribute() {
  const g = await gaps();
  const n = (r: string) => g.find((x) => x.region === r)?.stations ?? 0;
  return (
    <main className="flex-1 bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-3xl px-5 py-10 text-[15px] leading-relaxed">
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-100"><TR k="Contribute data" /></h1>
        <p className="mt-2"><HelpLink to="/help/site/contribute" /></p>
        <p className="mt-3">
          <TR k="Wildlife Network is built from what people's devices hear and see. If you run a bird station, a bat detector or a camera trap, you can add it in a few minutes. If you don't have one yet, this page shows what to get and how to set it up. It is free, and you keep the rights to your data." />
        </p>
        <p className="mt-2 text-sm text-slate-400">
          <TR k="Connecting a whole network, a national system or a GBIF node? See [for institutions](/institutions)." />
        </p>

        <h2 className="mt-8 mb-3 text-xl font-semibold text-slate-100"><TR k="Where are you starting from?" /></h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card href="#computer" title={<TR k="I have recordings or photos on my computer" />} text={<TR k="Use the free Studio app for Mac, Windows and Linux. No typing commands." />} />
          <Card href="#birdweather" title={<TR k="My station is on BirdWeather" />} text={<TR k="You are already included. Nothing to install." />} />
          <Card href="#have" title={<TR k="I have a station running all the time" />} text={<TR k="BirdNET-Pi, BirdNET-Go, a camera trap, a bat detector, or other software." />} />
          <Card href="#new" title={<TR k="I want to set one up" />} text={<TR k="What to buy and how to build a bird, bat or camera station." />} />
        </div>

        <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
          <TR k="**On Android?** [BirdEcho]({birdecho}) is a free app for your BirdNET-Pi, BirdNET-Go or BirdWeather station: follow its detections from your phone, get notified when a species you care about shows up, and see Wildlife Network arrivals near it." v={{ birdecho: BIRDECHO }} />
        </p>

        {g.length > 0 && (
          <>
            <H2 id="needed"><TR k="Where stations are needed most" /></H2>
            <p>
              <TR k="Recording stations are spread very unevenly. Africa has {africa} active stations and India and its neighbours {india}, against {europe} in Europe and {na} in North America. Where there are few, a single new station adds far more: it can put a whole area on the map for arrival dates and change." v={{ africa: n("Africa").toLocaleString("en-GB"), india: n("India").toLocaleString("en-GB"), europe: n("Europe").toLocaleString("en-GB"), na: n("North America").toLocaleString("en-GB") }} />
            </p>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="text-left text-slate-400 border-b border-white/10">
                <th className="py-1.5 font-medium"><TR k="Region" /></th><th className="font-medium text-right"><TR k="Active recording stations" /></th>
                <th className="font-medium text-right"><TR k="Areas watched by stations" /></th>
              </tr></thead>
              <tbody>{g.map((r) => (
                <tr key={r.region} className={`border-b border-white/5 ${r.region === "Africa" || r.region === "India" ? "text-slate-100" : ""}`}>
                  <td className="py-1.5">{r.region === "India" ? <TR k="India and neighbours" /> : r.region}</td>
                  <td className="text-right tabular-nums">{r.stations.toLocaleString("en-GB")}</td>
                  <td className="text-right tabular-nums">{r.watched}</td>
                </tr>))}</tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">
              <TR k="Stations heard from in the last 30 days, from BirdWeather and devices sending here directly. An area is a square about 550 km across (5 degrees of latitude and longitude); it counts as watched at {min} bird detections a week, averaged over four recent weeks. India and neighbours is the box from 5 to 35° N and 65 to 95° E and is also counted in Asia. Turn on Coverage in the map legend to see each area." v={{ min: MIN_EFFORT_WEEK.toLocaleString("en-GB") }} />
            </p>
            <p className="mt-3">
              <TR k="In one of the thin regions? [Set up a station](#new), or [upload recordings you already have](/datasets/new) as a dataset. Institutions with a network of recorders: [connect it here](/institutions)." />
            </p>
          </>
        )}

        <H2 id="computer"><TR k="Recordings or photos on your computer" /></H2>
        <p>
          <TR k="Have a memory card or a drive full of recordings from an AudioMoth, a Song Meter or a phone, or photos from a camera trap? Download [Wildlife Network Studio](/studio), a free app for Mac, Windows and Linux. Point it at the folder: it finds the species on your own computer, helps you check them in minutes, and adds them here as a dataset with your name on it. Nothing is uploaded until you choose to share. [Step by step guides and videos](/help/studio)." />
        </p>
        <p className="mt-3">
          <TR k="Already have a results table from BirdNET or Kaleidoscope? [Upload it as a dataset](/datasets/new) straight from your browser." />
        </p>

        <H2 id="birdweather"><TR k="Already on BirdWeather? You are done" /></H2>
        <p>
          <TR k="Wildlife Network reads BirdWeather's public detections (never the recordings). If you have a BirdWeather PUC (a ready made listening device), or your BirdNET-Pi or BirdNET-Go station uploads to BirdWeather, your detections are on the map and in every measure. **Do not install the agent as well:** the same detections would arrive twice and be counted twice." />
        </p>
        <p className="mt-3">
          <TR k="Not sure? Look for your station on [app.birdweather.com](https://app.birdweather.com). If it is there, you are included." />
        </p>
        <p className="mt-3">
          <TR k="Want more say in how your station appears? [Add your BirdWeather station](/stations/join): choose a name or stay anonymous, pick how precisely it is located, and share its full daily counts in the open data releases under your licence." />
        </p>

        <H2 id="have"><TR k="I have a station running all the time" /></H2>
        <p>
          <TR k="This part needs a few typed commands on the computer that runs your station. If that is new to you, the [Studio app](/studio) above is the easier way to share recordings." />
        </p>
        <p className="mt-3">
          <TR k="You install one small program, [wdx-agent]({agent}), on the computer that holds your detections. It is a single open source Python file with no dependencies. It reads what your detector has already found and sends it. It never changes your detector's files, and it catches up by itself after being offline." v={{ agent: AGENT }} />
        </p>

        <H3 id="birdnet-pi">BirdNET-Pi</H3>
        <p><TR k="Open a terminal on the Pi (or connect to it from another computer with SSH), paste this line and press Enter:" /></p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | bash`}</CopyBlock>
        <p>
          <TR k="The installer finds BirdNET-Pi's database, registers your station, and starts a background service. It uses the location you set in BirdNET-Pi. That is all." />
        </p>

        <H3 id="birdnet-go">BirdNET-Go</H3>
        <p><TR k="Run the same command on the machine that runs BirdNET-Go:" /></p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | bash`}</CopyBlock>
        <p><TR k="If it cannot find the database, tell it where" /> <code className="text-slate-200">birdnet.db</code> <TR k="is:" /></p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | WDX_SOURCE=birdnet-go WDX_PATH=/path/to/birdnet.db bash`}</CopyBlock>
        <p className="text-sm text-slate-400"><TR k="Works with both BirdNET-Go database layouts, the current one and the original one. Detections BirdNET-Go marks as unlikely for your location are skipped." /></p>

        <H3 id="camera"><TR k="Camera trap" /></H3>
        <p>
          <TR k="Cameras take pictures; a classifier names the animals. Run [SpeciesNet](https://github.com/google/cameratrapai) over your images, then point the agent at the folder with its results. A camera has no GPS in the result file, so give its location:" />
        </p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | WDX_SOURCE=speciesnet WDX_PATH=/data/camtrap WDX_LAT=11.41 WDX_LON=76.69 bash`}</CopyBlock>
        <p className="text-sm text-slate-400"><TR k="Blank images, people and vehicles are never sent. One agent serves one location, so use one setup per camera site." /></p>
        <p>
          <TR k="**Want to check the photos yourself first?** Use [Wildlife Network Studio](/studio) instead of the agent: it finds the animals in your photos, lets you confirm or correct each one, and adds the checked results here as a dataset. No commands needed." />
        </p>
        <p className="text-sm text-slate-400"><TR k="Use one route per camera: the agent sends unchecked predictions automatically, Studio sends checked ones." /></p>

        <H3 id="bat"><TR k="Bat detector" /></H3>
        <p>
          <TR k="Record with an ultrasonic recorder, classify the recordings with [BatDetect2](https://github.com/macaodha/batdetect2), and point the agent at the results folder:" />
        </p>
        <CopyBlock>{`curl -fsSL ${SITE}/agent/install.sh | WDX_SOURCE=batdetect2 WDX_PATH=/data/bats/results WDX_LAT=51.51 WDX_LON=-0.13 bash`}</CopyBlock>
        <p className="text-sm text-slate-400">
          <TR k="BatDetect2's default model knows UK species. Elsewhere, use a model trained for your region, or the names will be wrong." />
        </p>

        <H3 id="csv"><TR k="Other software (Kaleidoscope, SonoBat and similar)" /></H3>
        <p>
          <TR k="If your software can export a table of detections, the agent can read it. You tell it which columns hold the species, the time and the score. The [CSV guide]({agent}#any-detections-table-csv) has a worked example." v={{ agent: AGENT }} />
        </p>
        <p className="mt-2">
          <TR k="Already have results sitting on a drive, from Song Meters, AudioMoths or past field seasons? [Upload them as a dataset](/datasets/new): BirdNET and Kaleidoscope tables are recognised, the records are checked, and the dataset gets its own page, citation and credit wherever it is used." />
        </p>
        <p className="mt-2">
          <TR k="Recordings that were never processed? [Wildlife Network Studio]({studio}) is a free desktop app for Mac, Windows and Linux: point it at a drive, it finds the species on your own computer (BirdNET or Perch), helps you check them in minutes, and publishes them here as a dataset or exports them for GBIF." v={{ studio: STUDIO_URL }} />
        </p>

        <H2 id="new"><TR k="I want to set one up" /></H2>
        <p><TR k="Three kinds of station, from easiest to most involved. Each links to the maker's own guide for the build, then you come back here to connect it." /></p>

        <H3 id="new-bird"><TR k="A bird listening station" /></H3>
        <p><TR k="The most popular way to start. It sits in a garden or on a balcony and identifies birds by their song, all day, every day." /></p>
        <Steps items={[
          <TR key="0" k="**Get the parts:** a Raspberry Pi (4B, 5, 3B+ or Zero 2 W), a microSD card of 32 GB or more, a USB microphone (or a USB sound card with a small lavalier microphone), and a power supply. For outdoors, add a weatherproof box." />,
          <TR key="1" k="**Install the listening software:** follow the [BirdNET-Pi](https://github.com/Nachtzuster/BirdNET-Pi) guide, or [BirdNET-Go](https://github.com/tphakala/birdnet-go) if you prefer. Set your latitude and longitude in its settings." />,
          <TR key="2" k="**Let it listen for a day** and check that it is identifying birds in its own web page." />,
          <TR key="3" k="**Connect it:** run the [one line install](#birdnet-pi) above." />,
        ]} />
        <p className="mt-3 text-sm text-slate-400">
          <TR k="Prefer something ready made? A [BirdWeather PUC](https://www.birdweather.com) is a finished device that reports to BirdWeather, and so to Wildlife Network, with nothing to build." />
        </p>

        <H3 id="new-bat"><TR k="A bat detector" /></H3>
        <p><TR k="Bats call above the range of human hearing, so you need a recorder that captures ultrasound." /></p>
        <Steps items={[
          <TR key="4" k="**Get a recorder:** an [AudioMoth](https://www.openacousticdevices.info/audiomoth) is the common low cost choice. Set it to a sample rate of 250 kHz or more and schedule it from dusk to dawn." />,
          <TR key="5" k="**Put it out** near water, a hedge line or a woodland edge, a few metres up, away from rustling leaves." />,
          <TR key="6" k="**Collect the recordings** and copy them to a computer." />,
          <TR key="7" k="**Classify them** with [BatDetect2](https://github.com/macaodha/batdetect2), which writes a result file for each recording." />,
          <TR key="8" k="**Connect it:** run the [bat detector install](#bat) above, pointing at the results folder." />,
        ]} />

        <H3 id="new-camera"><TR k="A camera trap" /></H3>
        <p><TR k="For mammals and ground birds. A camera takes a picture when something moves in front of it." /></p>
        <Steps items={[
          <TR key="9" k="**Get a trail camera** and an SD card. Any model that saves ordinary photos works." />,
          <TR key="10" k="**Mount it** at about knee height on a game trail or by water, facing north or south to avoid direct sun, with nothing moving in front." />,
          <TR key="11" k="**Collect the card** every few weeks and copy the images to a computer. Keep the file dates when copying, since the agent uses them as the time of each sighting." />,
          <TR key="12" k="**Find the animals:** open the folder in [Wildlife Network Studio](/studio), check the photos and share them. (Or classify them with [SpeciesNet](https://github.com/google/cameratrapai) and run the [camera trap install](#camera) above.)" />,
        ]} />

        <H2 id="check"><TR k="Check that it is working" /></H2>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li><TR k="Watch the agent:" /> <code className="text-slate-200">journalctl -u wdx-agent -f</code>. <TR k="A healthy line reads" /> <code className="text-slate-200">sent 12 (new 12, updated 0, rejected 0)</code>.</li>
          <li><TR k="See what would be sent, without sending anything:" /> <code className="text-slate-200">python3 /opt/wdx-agent/wdx_agent.py --config /etc/wdx-agent.ini --dry-run</code>.</li>
          <li><TR k="On the [map](/), detections from the last three hours appear as pink “Stations sending directly” dots at your rounded location." /></li>
          <li><TR k="Your detections join the movement measures within about an hour." /></li>
        </ul>

        <H2 id="privacy"><TR k="What is shared, and your rights" /></H2>
        <ul className="mt-2 list-disc pl-5 space-y-2">
          <li><TR k="**Your location is blurred on your device.** Coordinates are rounded to about 1 km before anything is sent. You can make that coarser (about 11 km) with" /> <code className="text-slate-200">round_coords = 1</code> <TR k="in" /> <code className="text-slate-200">/etc/wdx-agent.ini</code>.</li>
          <li><TR k="**What is sent:** species, time, confidence, the rounded location, the classifier's name, the file name of the clip or photo, and a station id. **Not sent:** the audio or the photos themselves." /></li>
          <li><TR k="**No account.** The installer registers a key for your device. A station name is optional." /></li>
          <li><TR k="**You choose the license.** The default is CC BY 4.0, which lets others use your detections with credit." /></li>
          <li><TR k="**Sensitive species.** If your station records a threatened species at a known site, use the coarser rounding or leave that station out." /></li>
          <li><TR k="**Stopping and removal.** Uninstall at any time with the commands in the [agent guide]({agent}#uninstall). To have your station's data removed, email [arunrajiah@gmail.com](mailto:arunrajiah@gmail.com) or use the [feedback form](/feedback), with your station id (the agent's log shows it on its first line)." v={{ agent: AGENT }} /></li>
        </ul>

        <H2 id="trouble"><TR k="If something goes wrong" /></H2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {[
                [<TR key="a" k="The installer finds no database" />, <TR key="b" k="Tell it the source and path, as in the BirdNET-Go example above." />],
                [<TR key="a" k="“no coordinates” in the log" />, <TR key="b" k="Add latitude and longitude to /etc/wdx-agent.ini." />],
                [<TR key="a" k="“server rejected the whole batch”" />, <TR key="b" k="The key was registered for a different source. Register a new one for the right source." />],
                [<TR key="a" k="Nothing is sent" />, <TR key="b" k="Run the dry run. If it shows 0 events, everything is below min_confidence or already sent." />],
                [<TR key="a" k="Something else" />, <TR key="b" k="The agent guide has a longer list, or write to us through the feedback form." />],
              ].map(([a, b], i) => (
                <tr key={i} className="border-b border-slate-900 align-top"><td className="py-2 pr-4 text-slate-200 w-2/5">{a}</td><td className="py-2">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          <TR k="Full reference, every setting, and manual install steps: the [wdx-agent guide]({agent}#readme). Problems or questions: [open an issue]({agent}/issues)." v={{ agent: AGENT }} />
        </p>

        <H2 id="api"><TR k="For developers: your own detector or code" /></H2>
        <p><TR k="Send detections straight to the API in our open data format ([WDX](https://github.com/arunrajiah/wildlife-detection-exchange)). Get a key, then post events:" /></p>
        <CopyBlock>{`curl -X POST ${SITE}/api/v1/register \\
  -H 'content-type: application/json' \\
  -d '{"name":"my-station","source":"other"}'

curl -X POST ${SITE}/api/v1/events \\
  -H "Authorization: Bearer wn_YOUR_KEY" \\
  -H "content-type: application/x-ndjson" \\
  --data-binary @events.wdx.ndjson`}</CopyBlock>

        <p className="mt-10 text-sm text-slate-400">
          <TR k="How your data is used in the measures: [Methods](/methods). Made by [Arun Rajiah](https://www.arunrajiah.com)." />
        </p>
      </div>
    </main>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-12 mb-2 text-xl font-semibold text-slate-100 scroll-mt-6">{children}</h2>;
}
function H3({ id, children }: { id: string; children: React.ReactNode }) {
  return <h3 id={id} className="mt-7 mb-1 text-base font-semibold text-slate-200 scroll-mt-6">{children}</h3>;
}
function Card({ href, title, text }: { href: string; title: React.ReactNode; text: React.ReactNode }) {
  return (
    <a href={href} className="block rounded-lg border border-slate-800 bg-slate-900/60 p-4 hover:border-cyan-700 hover:bg-slate-900">
      <div className="font-medium text-slate-100">{title}</div>
      <div className="mt-1 text-sm text-slate-400">{text}</div>
    </a>
  );
}
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-2 space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-medium text-slate-200">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  );
}

// Knowledge base for /help. Plain language, no em dashes. Links inside text use [label](/path).
// Keep in step with the apps: when a screen, button or rule changes in Studio or on the site, change its guide here.

/** Studio version the Studio guides were last checked against. .github/workflows/help-check.yml opens an issue when a newer
 * Studio release is out; update the guides, then raise this. */
export const HELP_CHECKED_STUDIO = "0.1.12";

export type Block =
  | { p: string }
  | { h: string }
  | { steps: string[] }
  | { list: string[] }
  | { tip: string }
  | { keys: [string, string][] };

export interface Guide { slug: string; title: string; summary: string; body: Block[] }
export interface Section { id: "studio" | "site"; title: string; intro: string; guides: Guide[] }

const studio: Guide[] = [
  {
    slug: "install",
    title: "Install Studio and keep it up to date",
    summary: "Download for Mac, Windows or Linux, first start, and how updates work.",
    body: [
      { p: "Wildlife Network Studio is free and needs no account. Download it from the [Studio page](/studio): the button for your system comes first." },
      { h: "Mac" },
      { steps: ["Open the downloaded .dmg file.", "Drag Wildlife Network Studio to Applications.", "Open it from Applications. The app is signed and notarized by Apple, so it opens without warnings."] },
      { tip: "Macs with an Intel processor have their own download, just below the main buttons. Not sure which you have? Apple menu, About This Mac: \"Chip: Apple\" means Apple Silicon." },
      { h: "Windows" },
      { steps: ["Run the downloaded setup file.", "If a blue SmartScreen message appears, choose More info, then Run anyway. The installer is not code signed yet.", "Start Studio from the Start menu."] },
      { p: "IT departments can use the MSI package instead, linked on the [Studio page](/studio)." },
      { h: "Linux" },
      { p: "Use the AppImage (make it executable, then run it) or the .deb package on Debian and Ubuntu. Ubuntu 22.04 or newer, 64-bit." },
      { h: "Updates" },
      { p: "Each time Studio starts it checks for a new version. When one is out, a box in the corner says so: choose Install and restart, or Later. Your projects are kept." },
      { tip: "The update check sends only the app version and your system. See [what Studio sends](/help/studio/privacy)." },
      { h: "Language" },
      { p: "Studio is in English, French and Portuguese. It follows your computer's language; to change it, open Settings and pick a language." },
    ],
  },
  {
    slug: "first-project",
    title: "Your first project",
    summary: "Create a project, add a folder of recordings and set where and when they were made.",
    body: [
      { p: "A project is one file (ending in .wlnw) that holds your recorders, results, answers and history. Keep it next to your recordings or anywhere you like; it can be moved and shared." },
      { steps: [
        "Open Studio and choose New project. Give it a name and choose where to save it.",
        "On the Recordings screen choose Add a folder or drive. Pick the folder or SD card copy. Subfolders are searched too.",
        "Studio lists each recorder it found (one per folder, or per AudioMoth or Song Meter). WAV, FLAC and MP3 recordings are read, and JPEG and PNG camera-trap photos.",
        "For each recorder, give the place: type latitude and longitude, or choose Map and click where it was. Then choose Save.",
        "Check the time zone (Times are UTC +). AudioMoths usually record in UTC, Song Meters in local time.",
      ] },
      { p: "The place matters: it decides which species are expected there and which model runs first. The date and time come from the file name (for example SMM01234_20250601_053000.wav) or from the recorder's own data." },
      { tip: "Adding the same folder again is safe: files already in the project are skipped. Add new SD card copies as the season goes on." },
      { p: "Next: [find the species](/help/studio/find-species)." },
    ],
  },
  {
    slug: "models",
    title: "Choose and add models",
    summary: "Perch, BirdNET, BatDetect2 and SpeciesNet: what each does, and how to add one from a folder.",
    body: [
      { p: "Models are the programs that recognise species. They run on your own computer. Studio lists them on the Find species screen under Models on this computer." },
      { list: [
        "Perch 2.0 (Google, Apache 2.0): about 15,000 species of birds, frogs, insects and mammals. Used first in Africa and South Asia. Downloaded by Studio on first use (about 410 MB).",
        "BirdNET 2.4 (K. Lisa Yang Center for Conservation Bioacoustics at the Cornell Lab of Ornithology and Chemnitz University, CC BY-NC-SA 4.0, non-commercial): about 6,500 species, mostly birds, filtered by place and week. Fast.",
        "BatDetect2 (UK bats, by Oisin Mac Aodha and colleagues, CC BY-NC 4.0, non-commercial): finds each echolocation call in ultrasonic recordings (192 kHz and above). See [bats](/help/studio/bats).",
        "SpeciesNet with MegaDetector (Google and Microsoft): animals, people and vehicles in camera-trap photos. Download it from the Find species screen (about 250 MB, from Studio 0.1.9). See [camera traps](/help/studio/camera-traps).",
      ] },
      { h: "Add a model from a folder" },
      { p: "Perch and SpeciesNet download inside Studio. BirdNET will download inside Studio soon. Until then, if you have the Studio BirdNET files, add them from a folder. BatDetect2's authors publish their model themselves, so Wildlife Network does not host a copy. You make the BatDetect2 files from their official package, as the [bats](/help/studio/bats) guide shows. To add model files from a folder:" },
      { steps: ["On Find species choose Add model files from a folder.", "Pick the folder that holds the model files.", "The model shows as Installed."] },
      { h: "Which models run" },
      { p: "With Best for each recorder's region (recommended), Studio picks for you: Perch first in Africa and South Asia with BirdNET as a second opinion, BirdNET elsewhere, and BatDetect2 for bat recordings when it is installed. Choose myself lets you tick the models to run on every recorder." },
    ],
  },
  {
    slug: "find-species",
    title: "Find species in your recordings",
    summary: "Run the models, follow progress, pause and carry on later.",
    body: [
      { steps: [
        "Go to Find species and check the models (see [models](/help/studio/models)).",
        "Choose Start. Progress shows recordings done, hours of audio, detections, speed and time left.",
        "Choose Pause after this file to stop. Start again later and Studio carries on where it stopped, even after closing the app or restarting the computer.",
      ] },
      { p: "Everything runs on your computer and nothing is uploaded. Studio checks there is enough disk space before it starts." },
      { h: "Recordings that could not be read" },
      { p: "Damaged or empty files are skipped and the run goes on. The progress box says how many, with a link to see which and why. Fix or replace them, then use Try failed ones again on the [Files screen](/help/studio/files-history)." },
      { tip: "Long runs: leave Studio open in the background. Your computer can be used for other work at the same time." },
    ],
  },
  {
    slug: "review",
    title: "Review clips and set thresholds",
    summary: "Listen to a few clips per species, answer yes or no, and let Studio set how strict to be.",
    body: [
      { p: "Models make mistakes. Reviewing a few clips per species tells Studio how far to trust each one." },
      { steps: [
        "Open Review and pick a species from the list. Clips are chosen from every confidence level, from sure to doubtful.",
        "Listen (the clip plays with its spectrogram) and answer.",
        "After 8 answers Studio sets that species' threshold so that what is kept is right at least 90% of the time.",
      ] },
      { keys: [["Y", "Yes, it is this species"], ["N", "No"], ["U", "Not sure"], ["Space", "Play or pause"], ["Arrow keys", "Move between clips"]] },
      { p: "Detections you answer yes to are always kept. Those you answer no to are never exported." },
      { h: "Unusual for the area" },
      { p: "When Studio is online, species with few or no records near the recorder are marked with a question mark, and the Wildlife Network box under the clip shows how often the species is recorded nearby. Check those clips first: they are the likeliest mistakes. You can turn this off in Settings." },
      { h: "Wrong or unknown sounds" },
      { p: "Heard something the model got wrong, or a species it does not know? Open Name this sound under any clip to give the right name, then Find more like this to look for that sound in all your recordings. Train the [Wildlife Network Classifier](/help/studio/classifier) and it will look for that species everywhere." },
    ],
  },
  {
    slug: "classifier",
    title: "Teach Studio your local species",
    summary: "Train the Wildlife Network Classifier on your answers and share it with others.",
    body: [
      { p: "The Wildlife Network Classifier learns from your yes and no answers and the sounds you named. It builds on Perch, so Perch must have run on the recordings." },
      { steps: [
        "Review some clips and name a few sounds (see [review](/help/studio/review)).",
        "In Review, under Wildlife Network Classifier, choose Train.",
        "Run Find species again: the classifier now runs too and its detections appear in Review like any other model's.",
      ] },
      { h: "Find more of a sound" },
      { p: "Under any clip, open Name this sound, give the species and choose Find more like this. Studio lists the 12 most similar 5 second clips in the project. Mark each one as the species or Not it, then choose Find more: from Studio 0.1.11 the next search uses every clip you marked as that species and skips the clips you already marked, so each round finds new and closer matches. Every mark is a training example." },
      { p: "Add shared loads a classifier someone else made and shared as a .wnc file, for example a colleague working in the same region." },
    ],
  },
  {
    slug: "two-reviewers",
    title: "Two people reviewing the same recordings",
    summary: "Review on your own, then compare answers to find disagreements.",
    body: [
      { p: "Two reviewers who agree make results much stronger, and journals and data centres often ask for it." },
      { steps: [
        "Each person reviews in their own copy of the project.",
        "In Review open Second reviewer, type your name and choose Save my answers. Send the file to the other person.",
        "The other person chooses Load other answers and picks that file.",
        "Choose Compare to see where you agree and which clips you answered differently. Listen to those together.",
      ] },
      { tip: "Your own answers are never overwritten by loading someone else's." },
      { h: "Figures for a paper" },
      { p: "The table shows, per species and overall, how often you agreed and Cohen's kappa, each with a 95% interval in brackets. Save table for a paper (CSV) also adds precision per species: of the reviewed detections at or above the species' threshold, the share answered yes, with its interval. Open Methods sentence for a ready sentence describing how the review was done (from Studio 0.1.10)." },
    ],
  },
  {
    slug: "bats",
    title: "Bat recordings",
    summary: "BatDetect2 for UK bats, and listening to calls slowed down.",
    body: [
      { p: "BatDetect2 runs on ultrasonic recordings, made at 192 kHz or more. It finds each echolocation call and names 17 UK bat species. It is for non-commercial use only." },
      { h: "Make the BatDetect2 files" },
      { p: "BatDetect2's authors publish the model only in their own Python package, and asked us not to host a copy, so that there is one up-to-date source. You make Studio's three files from it once. This needs Python 3 and a few typed commands. Ask a colleague who has done it if this is new to you." },
      { steps: ["Download the [Studio source code](https://github.com/wlnw-org/wlnw-studio/archive/refs/heads/main.zip) and unzip it.", "Open a terminal in its crates/batdetect2 folder.", "Run python3 -m venv bd2, then . bd2/bin/activate, then pip install batdetect2==2.0.0b3 onnx.", "Run python -I python/export_model.py batdetect2. This makes a batdetect2 folder with three files."] },
      { h: "Use it" },
      { steps: ["On Find species choose Add model files from a folder and pick the batdetect2 folder.", "Add your bat recordings and set their place as usual.", "Find species runs BatDetect2 on bat recordings by itself."] },
      { p: "In Review, bat clips play 10 times slower so the calls can be heard." },
      { tip: "BatDetect2 was trained on UK bats. Outside the UK, treat its names as a first guess and review carefully." },
      { p: "Please cite BatDetect2 when you share bat results. Mac Aodha et al. (2022), Towards a General Approach for Bat Echolocation Detection and Classification, bioRxiv ([paper](https://doi.org/10.1101/2022.12.14.520490), [source](https://github.com/macaodha/batdetect2)). Studio adds this to your exports. The part of Studio that runs BatDetect2 is under BatDetect2's own licence, CC BY-NC 4.0, so it is for non-commercial use only." },
    ],
  },
  {
    slug: "camera-traps",
    title: "Camera-trap photos",
    summary: "Find animals in photos with SpeciesNet and check them in a grid.",
    body: [
      { p: "Studio finds JPEG and PNG photos in the folders you add, next to or instead of recordings. Each camera is listed like a recorder." },
      { steps: [
        "On Recordings, set each camera's place and its country as three letters (for example KEN, IND, BRA, or USA with the state code). SpeciesNet uses the country to rule out species that do not live there.",
        "Add SpeciesNet (see [models](/help/studio/models)) and choose Start on Find species. MegaDetector finds animals, people and vehicles; SpeciesNet names each animal.",
        "Open Images. Pick a species to check its boxes, or browse by Animals, Empty, People, Vehicles and the rest.",
      ] },
      { keys: [["Y", "Yes, the box is right"], ["N", "No"], ["U", "Not sure"], ["Arrow keys", "Move between photos"], ["Enter", "Enlarge"]] },
      { p: "Photos with people in them stay on your computer: they are never exported or published. Photos without a date in their EXIF data are kept out of publishing." },
      { p: "Export camera-trap results as Camtrap DP for GBIF or Agouti, see [export](/help/studio/export)." },
    ],
  },
  {
    slug: "import",
    title: "Bring in results from other tools",
    summary: "BirdNET-Analyzer, BirdNET-Pi, BirdNET-Go, Raven and Kaleidoscope results, without processing again.",
    body: [
      { p: "Already ran another tool on the same recordings? Import its results to review and publish them in Studio." },
      { steps: [
        "Add the recordings first (Recordings, Add a folder or drive).",
        "Under Import results from another tool choose Import a results file, or Import a folder of results.",
        "Studio reports how many rows matched a recording. Rows are matched by path or file name (BirdNET-Pi and BirdNET-Go by date and time).",
      ] },
      { p: "Read: BirdNET-Analyzer CSV and Raven selection tables, BirdNET-Pi and BirdNET-Go exports, and Kaleidoscope id.csv. Kaleidoscope manual IDs count as review answers. Importing again adds nothing twice." },
    ],
  },
  {
    slug: "export",
    title: "Export and publish your results",
    summary: "Darwin Core for GBIF, Camtrap DP, CSV, Raven, Kaleidoscope, or publish to Wildlife Network.",
    body: [
      { p: "Only accepted detections leave Studio: in range for their place and week, at or above each species' reviewed threshold, and not marked wrong. Detections you marked yes are always included." },
      { steps: ["Open Export and publish.", "Fill in About this dataset: title, institution, people to credit, how it was collected, and the licence.", "Choose a format and where to save it."] },
      { list: [
        "Darwin Core Archive: upload to your IPT or send to your GBIF node.",
        "Camtrap DP: camera-trap deployments, photos and observations, as CSV files (deployments.csv, media.csv, observations.csv) that open in R with read.csv or the camtraptor package.",
        "CSV: one row per detection, for R, Python or a spreadsheet. From Studio 0.1.12 it also lists camera-trap photos, one row per animal box; the media column says audio or image and the bbox columns give the box position (0 to 1).",
        "Raven and Audacity: selection tables and labels next to each recording.",
        "Kaleidoscope id.csv, and WDX (one event per line, the format Wildlife Network uses).",
        "From Studio 0.1.13 every export names the model and the paper to cite. The CSV has a model_reference column, Darwin Core fills in identificationReferences, and Raven, Audacity and Kaleidoscope files get a CITATION.txt beside them.",
        "Occupancy by day or by week (from Studio 0.1.11): one row per species and site, one column per day or week. 1 = detected, 0 = recorded and analysed but not detected, NA = nothing recorded. A second file, ending in -effort.csv, gives the minutes recorded per site in the same columns.",
      ] },
      { h: "Occupancy tables in R" },
      { p: "Days are the recorder's local calendar days and weeks run Monday to Sunday. A recording that runs past midnight counts for both days. Recordings without a start time are left out. Read the table, keep one species and drop the first five columns to get the detection matrix, for example for unmarked::unmarkedFrameOccu(y = ...). Use the effort file as an observation covariate." },
      { h: "Publish to Wildlife Network" },
      { steps: ["Create a dataset at [wlnw.org/datasets](/datasets/new) (sign in with ORCID).", "On the dataset page create its upload key.", "Paste the dataset id and key into Studio and send. Sending again is safe: duplicates are ignored."] },
      { p: "The site checks every record again and credits your dataset by name wherever it is used." },
    ],
  },
  {
    slug: "files-history",
    title: "Files, History and fixing problems",
    summary: "See every recording's status, retry failures, and look back at what was done.",
    body: [
      { h: "Files" },
      { p: "Files lists every recording with its recorder, time, length, status per model and number of detections. Filter by Done, Partly done, To do or Could not read, by recorder, or search by name." },
      { list: ["Show opens the recording's folder.", "Retry, or Try failed ones again for all, runs failed recordings on the next run.", "Save list as CSV gives the whole list for your records."] },
      { h: "History" },
      { p: "History lists every run, folder added, training, export and publish, with when it happened and a one-line summary. It is saved in the project file, so it moves with the project." },
      { h: "Common problems" },
      { list: [
        "A recorder is marked in yellow: it needs a place or time zone.",
        "Nothing found for a species you expect: check the place and date are right, then look in Review with a lower threshold.",
        "The app window is blank: click inside it once, or restart Studio.",
        "Still stuck? Use Send feedback or report a problem in Studio, or the [feedback form](/feedback?from=studio).",
      ] },
    ],
  },
  {
    slug: "share-answers",
    title: "Share your checked answers to improve species ID",
    summary: "An opt-in setting that helps build free classifiers for your region.",
    body: [
      { p: "BirdNET and Perch know some regions far better than others. Your yes and no answers in Review are exactly what is needed to build classifiers that work better where you record. If you choose to share them, we combine answers from many people into free regional classifiers that anyone can use in Studio." },
      { steps: [
        "Open Settings (bottom of the sidebar, or on the start screen).",
        "Turn on Share my checked answers to improve species ID.",
        "Keep reviewing as usual. Studio sends new answers in the background when a project is open, and the Settings box shows how many were shared.",
      ] },
      { h: "What is sent" },
      { list: [
        "The species, and your answer (yes or no). Not sure answers are not sent.",
        "The clip's Perch embedding: 1,536 numbers that describe the sound. It is not audio and cannot be played back. Answers are only shared where Perch has run on the recording.",
        "The model that made the detection and its score.",
        "The recorder's place rounded to about 100 km (about 500 km for sensitive species), and the year and week of the recording.",
      ] },
      { p: "Never audio, file or project names, exact times, or anything about you. Shared answers are open data (CC0)." },
      { h: "Stop or delete" },
      { p: "Turn the setting off at any time. Delete everything I shared removes every answer your computer has sent from wlnw.org at once and turns sharing off. Full details are on the [privacy page](/privacy#shared-answers)." },
    ],
  },
  {
    slug: "privacy",
    title: "What Studio sends over the internet",
    summary: "Your recordings and results stay on your computer. Here is everything that goes online.",
    body: [
      { list: [
        "Update check when Studio starts: the app version and system only.",
        "Model downloads, when you choose them.",
        "With Wildlife Network online (Settings, on by default): the recorder's place, rounded, to show species known nearby and protected areas. Turn it off in Settings.",
        "Publishing, only when you choose it: the accepted detections of that dataset.",
        "Sharing checked answers, only if you turn it on in Settings: for each clip you answered, the species, your answer, the clip's Perch embedding (numbers, not audio), the place rounded to about 100 km, and the year and week. See [sharing answers](/help/studio/share-answers).",
      ] },
      { p: "Recordings, photos, answers and projects are never uploaded. Full details are on the [privacy page](/privacy#apps)." },
    ],
  },
];

const site: Guide[] = [
  {
    slug: "map",
    title: "Read the live map",
    summary: "What the dots mean, the time slider, classes and the side panels.",
    body: [
      { p: "The [map](/) shows where birds, bats, frogs, insects and other animals were detected, from sound recorders, observers and research datasets around the world." },
      { list: [
        "Each dot is a recent detection. Click one to see the species and its source.",
        "The slider at the bottom picks the time: the last hour or 3 hours live, or the last 7 days, 30 days or 12 months.",
        "The class buttons show one group, for example only bats or only frogs.",
        "The search box finds a place or a species.",
        "The side rail opens Now (what is being detected), the Feed, Research, Contribute and more.",
      ] },
      { tip: "The map starts near you (from your connection's rough location, never stored). Search for any place to move it." },
    ],
  },
  {
    slug: "species",
    title: "Look up a species",
    summary: "Species pages, arrival dates, movement through the year and recordings to listen to.",
    body: [
      { steps: ["Search for the species on the map, or open the [species list](/species).", "The panel shows a photo, how often it is being recorded, where its range centre is moving and the weather there.", "Choose Play the year (when a species is selected) to watch it move week by week."] },
      { p: "Species pages give the typical arrival week per region with an uncertainty range, plus recordings from xeno-canto to listen to, credited to their recordists." },
      { tip: "Every number has a plain explanation on the [methods page](/methods)." },
    ],
  },
  {
    slug: "arrivals",
    title: "Arrivals and what is coming",
    summary: "When species arrive in your region, and the ones possibly arriving now.",
    body: [
      { p: "[Arrivals](/arrivals) lists, per region, the week each migrant usually arrives, worked out from a year of records. Weak estimates are left out." },
      { p: "On the map's Now panel, Possibly arriving lists species that have just started being recorded in an area after weeks without records." },
      { h: "What the date range means" },
      { p: "A species reaches the south of a region before the north, so a region shows a first and a last arrival. Each species page also gives the likely spread of its date in each area. Dates come from last year's records, so this year can differ by a week or two." },
      { h: "Why a bird that stays all year may have an arrival date" },
      { p: "The records only show when a bird is heard or seen. A resident bird that goes quiet in winter and starts singing in spring can look like a new arrival. We remove most of these, but some remain, so treat a date for a resident bird as the week it became easy to hear." },
      { h: "Get told when one arrives" },
      { p: "Open a species page and use Get an email when it arrives near you. You get one email when it turns up in your area after weeks away, at most once every two months. See [Species alerts](/alerts)." },
    ],
  },
  {
    slug: "places",
    title: "What lives near a place",
    summary: "Search a town or click the map to see the species recorded around it.",
    body: [
      { steps: ["Type a town or city in the map's search box and choose it under Places.", "The panel lists the species recorded in that area, the most recorded ones and the recording stations nearby."] },
      { p: "Popular cities also have their own pages on the [places list](/places)." },
    ],
  },
  {
    slug: "lost-species",
    title: "Lost species, and how to help find them",
    summary: "Animals not confirmed in the wild for 10 years or more, and what happens when a record of one reaches us.",
    body: [
      { p: "[Lost species](/lost-species) lists animals that nobody has confirmed in the wild for 10 years or more, with the countries and region where each was last known. Filter by country or animal group, or choose Use my area to see the ones last known in your country." },
      { p: "Every record that reaches Wildlife Network is checked against this list. A record of a lost species never appears on the map or in our data. It goes to a private review by experts, because most turn out to be a similar species. We never publish the exact place of one." },
      { h: "If you think you found one" },
      { steps: ["Open [Send a possible sighting](/lost-species/report).", "Choose the species, give the date and the place, and add a link to your photo or recording if you have one.", "Send it. It goes to the private review only. If an expert thinks it is worth a closer look, we pass the details, without your email, to Re:wild."] },
      { p: "To help without a sighting, put up a listening station or run your recordings through [Studio](/studio) in places where lost species were last known. We announce possible rediscoveries in our [update emails](/updates), only after an expert has checked them and Re:wild has been told." },
    ],
  },
  {
    slug: "reports",
    title: "Reports for a site or a protected area",
    summary: "Printable species reports for a station, a 5 degree area or your own boundary.",
    body: [
      { h: "Site report" },
      { p: "[Site reports](/report) summarise one place: with a recording station nearby, its weekly records; otherwise the species of the surrounding area. Compare two periods and download CSV where the data allows it." },
      { h: "Area report" },
      { steps: [
        "Open [Area report](/report/area).",
        "Search a park or reserve by name, upload its boundary (KML or GeoJSON) or draw it on the map.",
        "The report lists the species recorded inside, the stations there and expected arrivals. Print it or download CSV, KML or GeoJSON.",
      ] },
      { tip: "Sensitive species are never named in public reports, to protect them." },
    ],
  },
  {
    slug: "alerts",
    title: "Get an email when a species arrives",
    summary: "Species alerts for your area, and update emails.",
    body: [
      { steps: ["Open a species page and find Email me when it arrives.", "Enter your town and email, and confirm from the email we send.", "You get one email when the species is recorded in your area after weeks without records, at most once every 8 weeks."] },
      { p: "Every email has a link to stop it. For news about the site itself, sign up on [Updates](/updates)." },
    ],
  },
  {
    slug: "contribute",
    title: "Send your own data",
    summary: "Stations, BirdWeather, uploads from other tools and the free Studio app.",
    body: [
      { list: [
        "Have a BirdWeather station? [Join here](/stations/join) with its token: no extra software needed.",
        "Run BirdNET-Pi, BirdNET-Go or another recorder? Install the small wdx-agent: see [Contribute](/contribute).",
        "Have a folder of recordings or camera-trap photos? Process them with [Studio](/studio) and publish from there.",
        "Have results in a spreadsheet? Upload them as a [dataset](/datasets/new).",
      ] },
      { p: "Your data is credited by name wherever it is used. [Contribute](/contribute) also shows where new stations are needed most." },
    ],
  },
  {
    slug: "data",
    title: "Download data and cite it",
    summary: "Open records, data releases and the API.",
    body: [
      { list: [
        "Download records for a species or area as CSV from its page, or from [Get the data](/data).",
        "Yearly open data releases with a DOI are on [Data](/data).",
        "Developers: the API is documented on [Developers](/developers).",
      ] },
      { p: "Only openly licensed records (CC0 and CC BY) are in downloads. Cite the release DOI and the original datasets listed with it." },
    ],
  },
  {
    slug: "research",
    title: "For researchers",
    summary: "Sign in with ORCID, study areas, expert review, projects and datasets.",
    body: [
      { list: [
        "Sign in with ORCID on [Research](/research): no passwords.",
        "Create a [study area](/studies) to follow coverage, species and arrivals in your region, with weekly digests.",
        "Review arrival estimates for species you know: the estimates change when experts disagree.",
        "Post or join [projects](/projects), and publish your own [datasets](/datasets).",
      ] },
      { p: "Institutions and GBIF nodes: see [For institutions](/institutions)." },
    ],
  },
  {
    slug: "account-privacy",
    title: "Languages, privacy and feedback",
    summary: "Change the language, what we collect, and how to reach us.",
    body: [
      { list: [
        "Language: the map and most pages are in English, Spanish, French, German, Portuguese, Hindi and Tamil. Use the language menu. Studio is in English, French and Portuguese.",
        "Privacy: everything we collect and keep is listed on the [privacy page](/privacy).",
        "Problems or ideas: use the [feedback form](/feedback). Every message is read.",
      ] },
    ],
  },
];

export const HELP: Section[] = [
  { id: "studio", title: "Wildlife Network Studio", intro: "The free desktop app for your recordings and camera-trap photos.", guides: studio },
  { id: "site", title: "The map and website", intro: "Finding species, places, reports, alerts and data on wlnw.org.", guides: site },
];

export const helpSection = (id: string) => HELP.find((s) => s.id === id);
export const helpGuide = (section: string, slug: string) => helpSection(section)?.guides.find((g) => g.slug === slug);

/**
 * Public updates, newest first. Shown on /updates and sent by scripts/send-update.mts (which Arun runs himself).
 * Plain language, what changed for people using the site. No internal details, no em dashes.
 */
/** forResearchers: shown under a separate "For researchers" heading so other readers can skip it. */
export interface UpdateItem { text: string; href?: string; forResearchers?: boolean }
export interface Update { date: string; title: string; items: UpdateItem[] }

export const UPDATES: Update[] = [
  {
    date: "2026-11-14",
    title: "Wind and night migration on the map, and pages in more languages",
    items: [
      { text: "A wind and temperature layer on the map: arrows show where the wind blows about 1.5 km up, where most migrating birds fly. Switch it on in the map's Legend. Weather from Open-Meteo, updated every 3 hours.", href: "/" },
      { text: "Night migration over Europe: weather radars show how many birds were flying at night, which way, and whether the night was busier than usual. Also in the map's Legend.", href: "/methods#radar" },
      { text: "Tracked journeys: for species that scientists have followed with GPS tags, the map draws the real routes of up to 12 animals, from published studies in the Movebank Data Repository.", href: "/methods#tracks" },
      { text: "Arrival pages for India and its states in Hindi and Tamil, and country pages in Spanish, Portuguese, French and German.", href: "/arrivals" },
      { text: "Lost species by country: a page for each of 65 countries listing the species not seen for years that could still be there.", href: "/lost-species" },
    ],
  },
  {
    date: "2026-11-07",
    title: "Upload your datasets, download more easily, and reports for parks",
    items: [
      { text: "Wildlife Network Studio 0.1.0, a free desktop app for Mac, Windows and Linux: point it at a drive of recordings, it finds the species on your own computer with BirdNET or Perch, helps you check them in minutes, and publishes them here or exports them for GBIF. Its own classifier learns local species from your answers.", href: "/studio" },
      { text: "Contributed datasets: upload detection tables from BirdNET, Kaleidoscope or any CSV. Records are checked automatically, and each dataset gets its own page, citation and credit wherever it is used.", href: "/datasets", forResearchers: true },
      { text: "Upload keys let desktop tools and scripts add records to a dataset without a browser.", href: "/institutions#in", forResearchers: true },
      { text: "Download buttons on every species page and on area reports: weekly records you may reuse (GBIF and openly licensed datasets), plus arrival dates. The open data page now lists every way to get the data.", href: "/data#get" },
      { text: "A new page for institutions and GBIF nodes: how to send data in, take it out, which licences are accepted, how sensitive species are protected and how credit works.", href: "/institutions", forResearchers: true },
      { text: "Site reports can carry a place name, such as a national park, and have a link to share. Area reports show species and records per week, with thinly covered weeks marked.", href: "/report" },
      { text: "Site reports can be opened from the map, for the area you are looking at or a place you searched." },
    ],
  },
  {
    date: "2026-11-03",
    title: "Site reports and projects",
    items: [
      { text: "Site reports: pick a place and dates to see what was recorded around it, week by week, and compare two periods, such as before and after a restoration. Where no station keeps its history here, the report uses the wider area around it (about 550 km across).", href: "/report" },
      { text: "A project board for research questions, where anyone signed in with ORCID can ask to join a project or a study area.", href: "/projects", forResearchers: true },
      { text: "Species photos are no longer cropped, on the site and in alert emails." },
      { text: "GBIF records are refreshed back a full year, so late records are counted.", forResearchers: true },
    ],
  },
  {
    date: "2026-10-31",
    title: "Fewer false arrival dates, and species possibly arriving",
    items: [
      { text: "An arrival date now needs a real absence first, so resident birds that go quiet for a while no longer get one. Dates with very wide uncertainty are left out.", href: "/methods" },
      { text: "A new list of species possibly arriving: recent returns that are not yet confirmed. In tests, about two in three were confirmed the following week." },
      { text: "Open data release 5 is on Zenodo with the new rules.", href: "/data", forResearchers: true },
      { text: "Species pages, place pages and map panels show species names and dates in your language." },
    ],
  },
  {
    date: "2026-10-28",
    title: "History on the map, places, languages and research tools",
    items: [
      { text: "Look back over the last 7 days, 30 days or 12 months on the map, with the most recorded species in each area." },
      { text: "Search for a town to see what is recorded around it, with a page for 97 cities.", href: "/places" },
      { text: "The map and species pages are available in Spanish, French, German, Portuguese, Hindi and Tamil." },
      { text: "A research hub with ORCID sign-in, study areas with weekly digests and shared access, and expert review of arrival dates.", href: "/research", forResearchers: true },
      { text: "Open data release 4 is on Zenodo.", href: "/data", forResearchers: true },
      { text: "A new welcome tour for first-time visitors." },
    ],
  },
  {
    date: "2026-10-26",
    title: "Arrival alerts by email",
    items: [
      { text: "Get one email when a species arrives near you after weeks away. Confirm first, unsubscribe in one click." },
      { text: "The map starts near your area, and the Listen button prefers recordings from your country." },
      { text: "Pages for each region's arrivals, month by month.", href: "/arrivals" },
      { text: "Open data release 3 is on Zenodo.", href: "/data", forResearchers: true },
    ],
  },
];

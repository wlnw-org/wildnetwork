export const SITE = "https://wlnw.org";
export const SITE_NAME = "Wildlife Network";
export const SITE_DESCRIPTION =
  "A live, open map of bird, bat and other animal movement, built from thousands of community sensors. See where a species is now, when it arrives, and how it moves through the year.";

/** "Hirundo rustica" -> "hirundo-rustica" */
export const speciesSlug = (scientificName: string) => scientificName.toLowerCase().replace(/\s+/g, "-");

/** Open data releases (GBIF-derived only), newest first. Built by scripts/release.mts and attached to a GitHub release. */
/** Concept DOI: always resolves to the newest release, so it is the one to cite for "the Wildlife Network open data". */
export const DATA_CONCEPT_DOI = "10.5281/zenodo.23193453";

export const DATA_RELEASES: { date: string; url: string; zip: string; weeks: string; rows: { weekly: number; effort: number; arrivals: number; datasets: number; taxa?: number }; doi?: string; notes?: string; period?: string }[] = [
  {
    date: "2026-10-28",
    url: "https://github.com/wlnw-org/wildnetwork/releases/tag/data-2026-10-28",
    zip: "https://github.com/wlnw-org/wildnetwork/releases/download/data-2026-10-28/wildnetwork-open-2026-10-28.zip",
    weeks: "27 Oct 2025 to 12 Oct 2026",
    period: "2025-10-27/2026-10-18",
    rows: { weekly: 352350, effort: 15986, arrivals: 4724, datasets: 284, taxa: 16765 },
    doi: "10.5281/zenodo.23731681",
    notes: "Release 4: methods 0.13 (arrival estimates on the site can be reviewed by researchers; this file's GBIF-only arrivals are unfiltered so the two can be compared), a year up to 12 October 2026.",
  },
  {
    date: "2026-10-25",
    url: "https://github.com/wlnw-org/wildnetwork/releases/tag/data-2026-10-25",
    zip: "https://github.com/wlnw-org/wildnetwork/releases/download/data-2026-10-25/wildnetwork-open-2026-10-25.zip",
    weeks: "20 Oct 2025 to 5 Oct 2026",
    period: "2025-10-20/2026-10-11",
    rows: { weekly: 364108, effort: 16345, arrivals: 4716, datasets: 287, taxa: 17069 },
    doi: "10.5281/zenodo.23649030",
    notes: "Release 3: a year up to 5 October 2026, arrival weeks with 90% intervals and how often a season was found (arrival_low, arrival_high, arrival_support), methods 0.12, published as Wildlife Network at wlnw.org.",
  },
  {
    date: "2026-10-07",
    url: "https://github.com/wlnw-org/wildnetwork/releases/tag/data-2026-10-07",
    zip: "https://github.com/wlnw-org/wildnetwork/releases/download/data-2026-10-07/wildnetwork-open-2026-10-07.zip",
    weeks: "6 Oct 2025 to 21 Sep 2026",
    rows: { weekly: 376243, effort: 16874, arrivals: 4693, datasets: 284, taxa: 17549 },
    doi: "10.5281/zenodo.23206867",
    notes: "Release 2: GBIF species keys on every row, taxa.csv, and reproducibility notes.",
  },
  {
    date: "2026-10-06",
    url: "https://github.com/wlnw-org/wildnetwork/releases/tag/data-2026-10-06",
    zip: "https://github.com/wlnw-org/wildnetwork/releases/download/data-2026-10-06/wildnetwork-open-2026-10-06.zip",
    weeks: "6 Oct 2025 to 21 Sep 2026",
    rows: { weekly: 376243, effort: 16874, arrivals: 4693, datasets: 284 },
    doi: "10.5281/zenodo.23193454",
  },
];

/** Published uses of the data (papers, theses, notebooks, reports), newest first, shown on /research. Add entries as they appear. */
export const DATA_USES: { title: string; authors: string; year: number; url: string; kind: "paper" | "preprint" | "thesis" | "notebook" | "report" }[] = [];

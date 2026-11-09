/** Site sections for the header and footer of every page except the map. Labels are English message keys (see PAGEUX). */
export const NAV: { label: string; links: { label: string; href: string }[] }[] = [
  { label: "Species", links: [
    { label: "All species", href: "/species" },
    { label: "Arrivals by region", href: "/arrivals" },
    { label: "Places", href: "/places" },
    { label: "Lost species", href: "/lost-species" },
  ] },
  { label: "Reports", links: [
    { label: "Site report", href: "/report" },
    { label: "Area report", href: "/report/area" },
    { label: "Species alerts", href: "/alerts" },
  ] },
  { label: "Contribute", links: [
    { label: "How to contribute", href: "/contribute" },
    { label: "Studio app", href: "/studio" },
    { label: "Upload a dataset", href: "/datasets/new" },
    { label: "Join with a BirdWeather station", href: "/stations/join" },
    { label: "Stations", href: "/stations" },
  ] },
  { label: "Research and data", links: [
    { label: "Research", href: "/research" },
    { label: "Open data", href: "/data" },
    { label: "Developers and API", href: "/developers" },
    { label: "Study areas", href: "/studies" },
    { label: "Projects", href: "/projects" },
    { label: "Datasets", href: "/datasets" },
    { label: "For institutions", href: "/institutions" },
  ] },
  { label: "About", links: [
    { label: "Methods", href: "/methods" },
    { label: "Validation", href: "/validation" },
    { label: "Updates", href: "/updates" },
    { label: "Privacy", href: "/privacy" },
    { label: "Help", href: "/help" },
    { label: "Feedback", href: "/feedback" },
  ] },
];

export const CONTACT_EMAIL = "arunrajiah@gmail.com";

/** Site sections for the header and footer of every page except the map. Labels are English message keys (see PAGEUX). */
/** footer: true keeps a link out of the header menu (footer only), so the menu stays short for first-time visitors. */
export const NAV: { label: string; links: { label: string; href: string; footer?: true }[] }[] = [
  { label: "Explore", links: [
    { label: "All species", href: "/species" },
    { label: "Arrivals by region", href: "/arrivals" },
    { label: "Places", href: "/places" },
    { label: "Lost species", href: "/lost-species" },
  ] },
  { label: "Reports and alerts", links: [
    { label: "Site report", href: "/report" },
    { label: "Area report", href: "/report/area", footer: true },
    { label: "Species alerts", href: "/alerts" },
  ] },
  { label: "Take part", links: [
    { label: "How to contribute", href: "/contribute" },
    { label: "Studio app", href: "/studio" },
    { label: "Stations", href: "/stations" },
    { label: "Upload a dataset", href: "/datasets/new", footer: true },
  ] },
  { label: "For researchers", links: [
    { label: "Research", href: "/research" },
    { label: "Open data", href: "/data" },
    { label: "Developers and API", href: "/developers" },
    { label: "Study areas", href: "/studies", footer: true },
    { label: "Projects", href: "/projects", footer: true },
    { label: "Datasets", href: "/datasets", footer: true },
    { label: "For institutions", href: "/institutions", footer: true },
    { label: "Validation", href: "/validation", footer: true },
  ] },
  { label: "About", links: [
    { label: "Methods", href: "/methods" },
    { label: "Updates", href: "/updates" },
    { label: "Feedback", href: "/feedback" },
    { label: "Privacy", href: "/privacy" },
  ] },
];

export const CONTACT_EMAIL = "arunrajiah@gmail.com";

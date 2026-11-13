import IndiaArrivals, { indiaMetadata } from "@/components/IndiaArrivals";

// Same page in Hindi and Tamil at /hi/arrivals/india and /ta/arrivals/india (src/app/hi, src/app/ta). Revalidated daily so
// "arriving now" follows the calendar.
export const revalidate = 86400;
export const metadata = indiaMetadata("en");
export default function Page() { return <IndiaArrivals lang="en" />; }

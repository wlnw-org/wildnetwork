import IndiaArrivals, { indiaMetadata } from "@/components/IndiaArrivals";

export const revalidate = 86400;
export const metadata = indiaMetadata("ta");
export default function Page() { return <IndiaArrivals lang="ta" />; }

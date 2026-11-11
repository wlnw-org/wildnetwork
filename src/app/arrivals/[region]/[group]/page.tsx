// /arrivals/<region>/<class>: the same page as /arrivals/<region> for one class (bats, insects...). A path, not ?group=, so
// it can be cached. Old ?group= links redirect here (next.config.ts).
import type { Metadata } from "next";
export { default } from "../page";
export const revalidate = 86400;
export async function generateStaticParams() { return []; }
export async function generateMetadata({ params }: { params: Promise<{ region: string; group: string }> }): Promise<Metadata> {
  const { region } = await params;
  // Each class has its own list, but the region page stays the one to show in search results.
  return { alternates: { canonical: `/arrivals/${region}` } };
}

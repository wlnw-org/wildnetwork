import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IndiaStateArrivals, { stateMetadata } from "@/components/IndiaStateArrivals";
import { indiaState } from "@/lib/indiaStates";

// Same page in Hindi and Tamil under /hi and /ta (src/app/hi, src/app/ta). ISR: made on first visit,
// refreshed daily so "arriving now" follows the calendar.
export const revalidate = 86400;
export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ state: string }> }): Promise<Metadata> {
  const s = indiaState((await params).state);
  return s ? stateMetadata("en", s) : {};
}
export default async function Page({ params }: { params: Promise<{ state: string }> }) {
  const s = indiaState((await params).state);
  if (!s) notFound();
  return <IndiaStateArrivals lang="en" s={s} />;
}

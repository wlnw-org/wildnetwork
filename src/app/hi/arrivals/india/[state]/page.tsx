import type { Metadata } from "next";
import { notFound } from "next/navigation";
import IndiaStateArrivals, { stateMetadata } from "@/components/IndiaStateArrivals";
import { indiaState } from "@/lib/indiaStates";

export const revalidate = 86400;
export function generateStaticParams() { return []; }

export async function generateMetadata({ params }: { params: Promise<{ state: string }> }): Promise<Metadata> {
  const s = indiaState((await params).state);
  return s ? stateMetadata("hi", s) : {};
}
export default async function Page({ params }: { params: Promise<{ state: string }> }) {
  const s = indiaState((await params).state);
  if (!s) notFound();
  return <IndiaStateArrivals lang="hi" s={s} />;
}

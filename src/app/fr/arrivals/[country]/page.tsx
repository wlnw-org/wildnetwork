import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CountryArrivals, { countryMetadata } from "@/components/CountryArrivals";
import { countryBySlug } from "@/lib/countries";
import { countryLangs } from "@/lib/pageLang";

// Only countries listed for this language in COUNTRY_LANGS (src/lib/pageLang.ts); anything else is a 404.
export const revalidate = 86400;
export function generateStaticParams() { return []; }
const pick = (slug: string) => { const c = countryBySlug(slug); return c && countryLangs(c.slug).includes("fr") ? c : null; };

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }): Promise<Metadata> {
  const c = pick((await params).country);
  return c ? countryMetadata("fr", c) : {};
}
export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const c = pick((await params).country);
  if (!c) notFound();
  return <CountryArrivals c={c} lang="fr" />;
}

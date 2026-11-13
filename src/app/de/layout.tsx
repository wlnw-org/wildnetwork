import { PageLanguage } from "@/components/TR";
import { bodyPick } from "@/lib/pageLang";

// /de/...: country pages in this language, translated on the server (src/components/ServerTr.tsx) so search engines index
// them. Client components get only the few keys they need, not the whole dictionary.
const CLIENT_KEYS = ["Species", "When", "All year", "Mainly {from} to {to}"] as const;
export default function Layout({ children }: { children: React.ReactNode }) {
  return <PageLanguage lang="de" body={bodyPick("de", CLIENT_KEYS)}>{children}</PageLanguage>;
}

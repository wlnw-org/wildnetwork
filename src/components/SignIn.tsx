"use client";
import { useEffect, useState } from "react";

export interface Me { enabled: boolean; user: { orcid: string; name: string } | null }

/** Fetches who is signed in. undefined while loading. */
export function useMe(): Me | undefined {
  const [me, setMe] = useState<Me>();
  useEffect(() => { fetch("/api/v1/me").then((r) => r.json()).then(setMe).catch(() => setMe({ enabled: false, user: null })); }, []);
  return me;
}

/** ORCID sign-in button, or the signed-in name with a sign-out link. */
export default function SignIn({ me, next }: { me: Me | undefined; next?: string }) {
  if (!me) return null;
  if (!me.enabled) return <p className="text-sm text-slate-500">Sign-in with ORCID is coming soon.</p>;
  if (me.user) return (
    <p className="text-sm text-slate-400">
      Signed in as <a href={`https://orcid.org/${me.user.orcid}`} className="text-cyan-400 hover:underline">{me.user.name}</a>{" "}
      <button onClick={() => fetch("/api/auth/logout", { method: "POST" }).then(() => location.reload())} className="ml-2 text-slate-500 hover:text-slate-300 underline">Sign out</button>
    </p>
  );
  const href = `/api/auth/orcid?next=${encodeURIComponent(next ?? (typeof window !== "undefined" ? location.pathname : "/research"))}`;
  return (
    <a href={href} className="inline-flex items-center gap-2 rounded-md bg-[#a6ce39] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[#b8dc4f]">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-[#a6ce39]">iD</span>
      Sign in with ORCID
    </a>
  );
}

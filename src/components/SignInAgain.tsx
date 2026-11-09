import { ADMIN_HOURS } from "@/lib/orcid";

/** Shown when the session is older than ADMIN_HOURS: admin pages want a recent ORCID sign-in. */
export default function SignInAgain({ next = "/admin" }: { next?: string }) {
  return (
    <main className="flex-1 bg-slate-950 text-slate-300"><div className="mx-auto max-w-xl px-5 py-16">
      <h1 className="text-2xl font-semibold text-slate-100">Admin</h1>
      <p className="mt-3">For safety, admin pages ask you to sign in again every {ADMIN_HOURS} hours.</p>
      <p className="mt-3"><a href={`/api/auth/orcid?next=${encodeURIComponent(next)}`} className="text-cyan-400 hover:underline">Sign in again with ORCID</a></p>
    </div></main>
  );
}


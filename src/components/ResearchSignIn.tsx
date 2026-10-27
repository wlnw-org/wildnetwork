"use client";
import SignIn, { useMe } from "./SignIn";

export default function ResearchSignIn({ next }: { next?: string }) {
  const me = useMe();
  return <SignIn me={me} next={next} />;
}

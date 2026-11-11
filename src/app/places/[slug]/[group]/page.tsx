// /places/<slug>/<class>: the same page as /places/<slug>, for bats, frogs and toads, or insects. A path, not ?group=, so
// it can be cached. Old ?group= links redirect here (next.config.ts).
export { default, generateMetadata } from "../page";
export const revalidate = 86400;
export async function generateStaticParams() { return []; }

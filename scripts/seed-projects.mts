import postgres from "postgres";

// Starter projects from the open questions on /research, owned by the maintainer. Fixed ids, so it is safe to rerun.
const OWNER = process.argv[2];
if (!OWNER) throw new Error("usage: seed-projects.mts <owner ORCID iD>");
const PROJECTS = [
  { id: "mic-vs-observer", title: "Do microphones detect species before human observers?", question: "Do microphones detect some species earlier in spring than human observers do, and which traits predict the lag? The heard versus seen comparison on species pages is a starting point.", needs: ["ecology", "stats"] },
  { id: "arrival-latitude", title: "Arrival week against latitude by migration distance", question: "How does arrival week change with latitude for short-distance compared with long-distance migrants? The arrivals API and the starter notebook give the dates; classifying the species by migration distance needs someone who knows them.", needs: ["ecology", "taxonomy"] },
  { id: "temperature-at-arrival", title: "Temperature at first detection across a species' range", question: "Is the temperature at first detection stable across a species' range, or does it shift from south to north?", needs: ["ecology", "stats", "code"] },
  { id: "bat-autumn-movements", title: "Autumn movements of migratory bats from ultrasonic stations", question: "Can ultrasonic stations reveal the autumn movements of migratory bats such as Nathusius' pipistrelle? This needs people who can judge the identifications, and more stations along the routes.", needs: ["taxonomy", "fieldwork", "local"] },
  { id: "next-station", title: "Where would one new station add the most?", question: "Where would one new station add the most information, given the current coverage gaps? The coverage layer on the map shows which cells are watched.", needs: ["stats", "code", "local"] },
];
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const [known] = await sql`SELECT 1 FROM researchers WHERE orcid = ${OWNER}`;
if (!known) throw new Error("That iD has not signed in yet.");
for (const p of PROJECTS) await sql`INSERT INTO projects (id, owner, title, question, needs) VALUES (${p.id}, ${OWNER}, ${p.title}, ${p.question}, ${p.needs}) ON CONFLICT (id) DO NOTHING`;
console.log(await sql`SELECT id, title FROM projects WHERE owner = ${OWNER}`);
await sql.end();

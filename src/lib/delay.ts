import { sql } from "@/lib/db";
import { DELAYS } from "@/lib/sources";

/**
 * SQL condition hiding delayed records (delayHours in src/config/sources.json, optionally only for delayTaxa)
 * until they are old enough. Mirrors isPublicNow().
 */
export const delayFilter = (alias = "e") =>
  DELAYS.reduce(
    (acc, [source, hours, taxa]) => sql`${acc} AND NOT (${sql(`${alias}.source_system`)} = ${source}
      ${taxa ? sql`AND ${sql(`${alias}.scientific_name`)} = ANY(${taxa as string[]})` : sql``}
      AND ${sql(`${alias}.event_start`)} > now() - make_interval(hours => ${hours}))`,
    sql``,
  );

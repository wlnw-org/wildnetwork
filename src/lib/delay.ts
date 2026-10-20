import { sql } from "@/lib/db";
import { SOURCE_DELAY_HOURS } from "@/lib/sources";

/** SQL condition hiding records of delayed sources (SOURCE_DELAY_HOURS) until they are old enough. Mirrors isPublicNow(). */
export const delayFilter = (alias = "e") =>
  Object.entries(SOURCE_DELAY_HOURS).reduce(
    (acc, [source, hours]) => sql`${acc} AND NOT (${sql(`${alias}.source_system`)} = ${source} AND ${sql(`${alias}.event_start`)} > now() - make_interval(hours => ${hours}))`,
    sql``,
  );

-- Lost species watch (src/lib/lost.ts). Species not confirmed in the wild for 10 years or more. Any record of one, from any
-- source, is held back from every public table and goes to lost_flags for private expert review instead.
CREATE TABLE IF NOT EXISTS lost_species (
  id              serial PRIMARY KEY,
  scientific_name text NOT NULL UNIQUE,
  common_name     text,
  class_name      text,
  order_name      text,
  family          text,
  subspecies      boolean NOT NULL DEFAULT false,
  continent       text,
  countries       text,
  region          text,
  red_list        text,
  on_rewild_list  boolean,
  source          text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Every name that counts as a lost species, lower case: the listed name, plus other names only after a person approved them
-- (scripts/lost-species.mts reports GBIF renames and synonyms for checking; it never adds them by itself).
CREATE TABLE IF NOT EXISTS lost_names (
  name     text PRIMARY KEY,
  lost_id  integer NOT NULL REFERENCES lost_species(id) ON DELETE CASCADE,
  via      text NOT NULL
);
-- Held records. Exact coordinates are kept here only, for reviewers; nothing in this table is ever served publicly.
-- kind 'record' = one detection or observation (may have a photo or recording); 'count' = a count per cell and day or week
-- from an aggregate (BirdWeather, GBIF facets), with nothing to look at. flag_key stops the same record being flagged twice.
CREATE TABLE IF NOT EXISTS lost_flags (
  id              bigserial PRIMARY KEY,
  flag_key        text NOT NULL UNIQUE,
  lost_id         integer NOT NULL REFERENCES lost_species(id) ON DELETE CASCADE,
  name_received   text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('record', 'count')),
  source_system   text NOT NULL,
  source_record   text,
  source_url      text,
  observed_at     timestamptz,
  period          text,
  latitude        double precision,
  longitude       double precision,
  count           integer,
  confidence      double precision,
  media_type      text,
  media_url       text,
  detail          jsonb NOT NULL DEFAULT '{}',
  first_seen      timestamptz NOT NULL DEFAULT now(),
  last_seen       timestamptz NOT NULL DEFAULT now(),
  verdict         text CHECK (verdict IN ('likely_wrong', 'needs_checking', 'worth_investigating')),
  note            text,
  hide_area       boolean NOT NULL DEFAULT false,
  reviewed_by     text,
  reviewed_at     timestamptz,
  notified_at     timestamptz
);
CREATE INDEX IF NOT EXISTS lost_flags_open_idx ON lost_flags (verdict, first_seen DESC);

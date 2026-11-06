-- Contributed datasets: researchers upload detection tables (BirdNET, Kaleidoscope, any CSV), the site checks them,
-- and credits each one with its own page and citation. Records stay out of every measure until the dataset is live.
CREATE TABLE IF NOT EXISTS datasets (
  id                 text PRIMARY KEY,
  owner              text NOT NULL,
  title              text NOT NULL,
  institution        text,
  description        text,
  people             jsonb NOT NULL DEFAULT '[]',
  license            text NOT NULL,
  grp                text NOT NULL DEFAULT 'avian',
  method             text NOT NULL DEFAULT 'machine',
  device             text,
  classifier         text,
  min_conf           real NOT NULL DEFAULT 0.8,
  precision_km       integer NOT NULL DEFAULT 10,
  status             text NOT NULL DEFAULT 'draft',
  doi                text,
  records            integer NOT NULL DEFAULT 0,
  species            integer NOT NULL DEFAULT 0,
  sites              integer NOT NULL DEFAULT 0,
  first_day          date,
  last_day           date,
  checks             jsonb,
  review_note        text,
  downloads          integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  live_at            timestamptz
);
CREATE INDEX IF NOT EXISTS datasets_owner_idx ON datasets (owner);

-- One row per detection as uploaded (after the name check). verification: unchecked | passed | flagged | confirmed | rejected.
CREATE TABLE IF NOT EXISTS dataset_records (
  id              bigserial PRIMARY KEY,
  dataset_id      text NOT NULL REFERENCES datasets (id) ON DELETE CASCADE,
  site            text NOT NULL,
  lat             real NOT NULL,
  lon             real NOT NULL,
  ts              timestamptz NOT NULL,
  scientific_name text NOT NULL,
  confidence      real,
  individuals     smallint NOT NULL DEFAULT 1,
  verification    text NOT NULL DEFAULT 'unchecked',
  flag            text,
  file_name       text
);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_records_dedupe ON dataset_records (dataset_id, site, scientific_name, ts);
CREATE INDEX IF NOT EXISTS dataset_records_name_idx ON dataset_records (scientific_name);

-- Names as written in uploads, matched once against the GBIF backbone.
CREATE TABLE IF NOT EXISTS name_check (
  input_name      text PRIMARY KEY,
  scientific_name text,
  rank            text,
  class_name      text,
  order_name      text,
  match_type      text,
  checked_at      timestamptz NOT NULL DEFAULT now()
);

-- Trust grows with clean datasets: the first ones are reviewed by a person, later ones go live after the automatic checks.
CREATE TABLE IF NOT EXISTS contributors (
  orcid           text PRIMARY KEY,
  clean_datasets  integer NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

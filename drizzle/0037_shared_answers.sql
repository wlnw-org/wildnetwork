-- Checked answers shared from Wildlife Network Studio (opt-in), for training open regional classifiers (src/lib/sharedAnswers.ts).
-- One row per answer: species, yes or no, the Perch 2.0 embedding of the clip (1,536 half floats, 3 KB, not audio), place
-- rounded to 1 degree (5 degrees for sensitive species), year and week. No file names, exact times, audio or user identity:
-- contributor_hash is a hash of a random key only the contributor's Studio holds, used to delete everything they shared.
CREATE TABLE IF NOT EXISTS shared_answers (
  id               bigserial PRIMARY KEY,
  contributor_hash text NOT NULL,
  client_id        text NOT NULL,
  site             text NOT NULL,
  species          text NOT NULL,
  label            smallint NOT NULL,
  source           text NOT NULL,
  model            text NOT NULL,
  confidence       real,
  lat              real NOT NULL,
  lon              real NOT NULL,
  year             smallint NOT NULL,
  week             smallint NOT NULL,
  embed_model      text NOT NULL,
  embedding        bytea NOT NULL,
  app_version      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contributor_hash, client_id)
);
CREATE INDEX IF NOT EXISTS shared_answers_species_idx ON shared_answers (species);

-- Research features: study proposals (/research), ORCID accounts, study areas with collaborators, expert review of arrivals.
-- Emails are stored AES-GCM encrypted (src/lib/optin.ts encryptToken), never in clear.

CREATE TABLE IF NOT EXISTS research_proposals (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL,
  email_enc   text NOT NULL,
  affiliation text,
  question    text NOT NULL,
  area        text,
  ip_hash     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per ORCID iD that has signed in. Name is the public ORCID name at sign-in.
CREATE TABLE IF NOT EXISTS researchers (
  orcid       text PRIMARY KEY,
  name        text NOT NULL,
  email_enc   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now()
);

-- A study area: a box on the 5 degree grid (south-west corners, inclusive), a class, an optional species list.
CREATE TABLE IF NOT EXISTS studies (
  id          text PRIMARY KEY,
  owner       text NOT NULL REFERENCES researchers(orcid) ON DELETE CASCADE,
  title       text NOT NULL,
  question    text,
  lat_min     smallint NOT NULL,
  lat_max     smallint NOT NULL,
  lon_min     smallint NOT NULL,
  lon_max     smallint NOT NULL,
  grp         text NOT NULL DEFAULT 'avian',
  species     text[] NOT NULL DEFAULT '{}',
  digest      boolean NOT NULL DEFAULT true,
  last_digest timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS study_members (
  study_id    text NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
  orcid       text NOT NULL REFERENCES researchers(orcid) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'collaborator',
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (study_id, orcid)
);

-- Expert review of one arrival estimate (species x 5 degree cell). One current verdict per reviewer.
CREATE TABLE IF NOT EXISTS arrival_reviews (
  scientific_name text NOT NULL,
  cell_lat        smallint NOT NULL,
  cell_lon        smallint NOT NULL,
  orcid           text NOT NULL REFERENCES researchers(orcid) ON DELETE CASCADE,
  verdict         text NOT NULL CHECK (verdict IN ('correct', 'misid', 'resident', 'unsure')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scientific_name, cell_lat, cell_lon, orcid)
);
CREATE INDEX IF NOT EXISTS arrival_reviews_orcid_idx ON arrival_reviews (orcid);

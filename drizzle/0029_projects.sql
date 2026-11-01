-- Project board: a question a signed-in researcher wants help with. Public, with the owner's name and ORCID iD.
CREATE TABLE IF NOT EXISTS projects (
  id          text PRIMARY KEY,
  owner       text NOT NULL REFERENCES researchers(orcid) ON DELETE CASCADE,
  title       text NOT NULL,
  question    text NOT NULL,
  needs       text[] NOT NULL DEFAULT '{}',
  species     text,
  region      text,
  study_id    text REFERENCES studies(id) ON DELETE SET NULL,
  open        boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner);

CREATE TABLE IF NOT EXISTS project_members (
  project_id  text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  orcid       text NOT NULL REFERENCES researchers(orcid) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, orcid)
);

-- A request to join one project or one study. The message is seen only by the owner and is cleared once decided.
CREATE TABLE IF NOT EXISTS join_requests (
  id          bigserial PRIMARY KEY,
  project_id  text REFERENCES projects(id) ON DELETE CASCADE,
  study_id    text REFERENCES studies(id) ON DELETE CASCADE,
  orcid       text NOT NULL REFERENCES researchers(orcid) ON DELETE CASCADE,
  message     text,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  decided_at  timestamptz,
  CHECK ((project_id IS NULL) <> (study_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_project_uq ON join_requests (project_id, orcid) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS join_requests_study_uq ON join_requests (study_id, orcid) WHERE study_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS join_requests_orcid_idx ON join_requests (orcid, created_at);

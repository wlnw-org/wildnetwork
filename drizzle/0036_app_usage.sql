-- App usage counts (src/lib/appUsage.ts): Studio update checks (one per app start) and installer downloads from wlnw.org.
-- app_usage holds daily totals per version and system only. app_seen holds a keyed hash of the IP address per day, only to
-- count distinct installs; rows older than 35 days are deleted. No IP address, install id or file information is stored.
CREATE TABLE IF NOT EXISTS app_usage (
  day     date NOT NULL,
  app     text NOT NULL,
  event   text NOT NULL,
  version text NOT NULL DEFAULT '',
  os      text NOT NULL DEFAULT '',
  n       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, app, event, version, os)
);
CREATE TABLE IF NOT EXISTS app_seen (
  day      date NOT NULL,
  app      text NOT NULL,
  event    text NOT NULL,
  key_hash text NOT NULL,
  PRIMARY KEY (day, app, event, key_hash)
);

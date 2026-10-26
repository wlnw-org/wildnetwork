-- Species arrival alerts: one row per email + species + 5 degree cell. Email stored encrypted (src/lib/alerts.ts),
-- matched by a keyed hash. Unconfirmed rows are deleted after 7 days.
CREATE TABLE IF NOT EXISTS alert_subs (
  id              bigserial PRIMARY KEY,
  email_enc       text NOT NULL,
  email_hash      text NOT NULL,
  scientific_name text NOT NULL,
  place           text NOT NULL,
  cell_lat        smallint NOT NULL,
  cell_lon        smallint NOT NULL,
  role            text,
  token           text NOT NULL UNIQUE,
  created_ip_hash text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,
  last_alert_at   timestamptz,
  last_alert_week date,
  UNIQUE (email_hash, scientific_name, cell_lat, cell_lon)
);
-- Every email sent, for the daily cap of the free mail plan. Kept 2 days.
CREATE TABLE IF NOT EXISTS alert_mail_log (
  at   timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL
);

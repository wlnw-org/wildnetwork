-- Update emails (/updates): one row per email address, stored encrypted (src/lib/updates.ts), matched by a keyed hash.
-- Unconfirmed rows are deleted after 7 days. last_sent is the date of the last update sent (scripts/send-update.mts).
CREATE TABLE IF NOT EXISTS update_subs (
  id              bigserial PRIMARY KEY,
  email_enc       text NOT NULL,
  email_hash      text NOT NULL UNIQUE,
  token           text NOT NULL UNIQUE,
  created_ip_hash text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  confirmed_at    timestamptz,
  last_sent       date
);

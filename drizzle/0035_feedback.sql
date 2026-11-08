-- Feedback and problem reports from /feedback (src/app/api/v1/feedback). Emailed to the maintainer; kept here too in case the
-- daily mail cap is reached. Email is optional and stored encrypted. Rows older than a year are deleted by the route.
CREATE TABLE IF NOT EXISTS feedback (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,
  product    text NOT NULL,
  message    text NOT NULL,
  email_enc  text,
  context    text,
  ip_hash    text,
  emailed    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_ip_idx ON feedback (ip_hash, created_at);

-- Class mode for the daily bird sound (/quiz?class=CODE). A teacher creates a class link for one xeno-canto area; pupils
-- answer as usual and only anonymous counts are kept: how many picked each name on each day. No names, no addresses.
-- ip_hash (keyed hash, src/lib/auth.ts) only limits how many classes one address can create in a day.
CREATE TABLE IF NOT EXISTS quiz_classes (
  code        text PRIMARY KEY,
  area        text NOT NULL,
  ip_hash     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quiz_classes_ip_idx ON quiz_classes (ip_hash, created_at);
CREATE TABLE IF NOT EXISTS quiz_class_answers (
  code        text NOT NULL,
  day         date NOT NULL,
  pick        text NOT NULL,
  n           integer NOT NULL DEFAULT 0,
  PRIMARY KEY (code, day, pick)
);

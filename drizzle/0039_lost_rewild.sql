-- Lost species flags sent to Re:wild after a reviewer marked them worth investigating (src/lib/lostReview.ts).
ALTER TABLE lost_flags ADD COLUMN IF NOT EXISTS rewild_sent_at timestamptz;
ALTER TABLE lost_flags ADD COLUMN IF NOT EXISTS rewild_sent_by text;

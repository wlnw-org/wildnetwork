-- Upload keys per dataset, for desktop tools and scripts that cannot use the ORCID browser sign-in. Only the hash is stored.
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS upload_key_hash text;
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS upload_key_at timestamptz;

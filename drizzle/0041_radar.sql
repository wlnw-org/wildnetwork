-- Night bird migration from European weather radars (Aloft / ENRAM / BALTRAD vertical profiles, CC BY 4.0).
-- One row per radar, night and source file: a night spans two UTC daily files, so each file adds its own part.
CREATE TABLE IF NOT EXISTS radar_sites (
  radar text PRIMARY KEY,
  lat   double precision NOT NULL,
  lon   double precision NOT NULL
);
CREATE TABLE IF NOT EXISTS radar_part (
  radar    text NOT NULL,
  night    date NOT NULL,           -- local date of the evening the night starts
  file_day date NOT NULL,
  n        int NOT NULL,            -- 5-minute profiles in darkness
  vid_sum  double precision NOT NULL, -- birds per km2 aloft, summed over profiles
  mtr_sum  double precision NOT NULL, -- birds crossing 1 km per hour, summed over profiles
  mtr_max  double precision NOT NULL,
  u_sum    double precision NOT NULL, -- east and north movement weighted by traffic, for the mean direction
  v_sum    double precision NOT NULL,
  PRIMARY KEY (radar, night, file_day)
);
CREATE TABLE IF NOT EXISTS radar_files (
  radar    text NOT NULL,
  file_day date NOT NULL,
  status   text NOT NULL,           -- ok | missing
  PRIMARY KEY (radar, file_day)
);

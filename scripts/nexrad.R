# Vertical bird profiles from US NEXRAD Level II scans (NOAA open data on AWS, no account) with vol2birdR.
# Usage: Rscript scripts/nexrad.R <out.csv> <scan file> [<scan file> ...]
# Writes one vpts CSV (the format Aloft publishes) with the profiles of every scan that worked; scans that fail are skipped.
suppressMessages(library(vol2birdR))
args <- commandArgs(trailingOnly = TRUE)
out <- args[1]
conf <- vol2bird_config()
conf$singlePol <- FALSE    # NEXRAD is dual polarisation: rain is removed with the correlation coefficient (defaults: 5 to 35 km)
first <- TRUE
for (f in args[-1]) {
  tmp <- tempfile(fileext = ".csv")
  ok <- tryCatch({ vol2bird(f, tmp, config = conf, verbose = FALSE); file.exists(tmp) }, error = function(e) { message("failed ", basename(f), ": ", conditionMessage(e)); FALSE })
  if (!ok) next
  lines <- readLines(tmp)
  if (length(lines) < 2) next
  if (first) { writeLines(lines, out); first <- FALSE } else cat(lines[-1], file = out, sep = "\n", append = TRUE)
  unlink(tmp)
}
if (first) quit(status = 2)

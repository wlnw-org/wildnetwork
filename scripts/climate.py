"""Climate context per 5 degree cell, from two open monthly gridded datasets:

- temperature: NASA GISTEMP v4 (GHCNv4 + ERSSTv5, 1200 km smoothing, 2 degree grid), anomalies
- rainfall: GPCP v2.3 monthly precipitation (NOAA PSL, 2.5 degree grid), mm per day

Both are re-expressed against the 1991-2020 normal of the same calendar month. Output is one JSON file
(no database rows), read by src/lib/climate.ts. Run monthly:

    python3 scripts/climate.py <download dir> <output json>

Needs numpy and netCDF4 (Ubuntu: apt install python3-numpy python3-netcdf4).
"""
import gzip, json, math, os, shutil, sys, urllib.request
from datetime import datetime, timezone

import numpy as np
from netCDF4 import Dataset, num2date

GISTEMP = "https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz"
GPCP = "https://downloads.psl.noaa.gov/Datasets/gpcp/precip.mon.mean.nc"
FIRST_YEAR, BASE = 1991, (1991, 2020)
UA = {"user-agent": "WildlifeNetwork/0.1 (+https://wlnw.org)"}


def fetch(url, path):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
        shutil.copyfileobj(r, f)
    os.replace(path + ".part", path)


def monthly(ds, var):
    t = ds.variables["time"]
    dates = num2date(t[:], t.units, getattr(t, "calendar", "standard"))
    keep = [i for i, d in enumerate(dates) if d.year >= FIRST_YEAR]
    data = np.ma.filled(ds.variables[var][keep[0]:keep[-1] + 1].astype("f8"), np.nan)
    months = [(dates[i].year, dates[i].month) for i in keep]
    return months, data, ds.variables["lat"][:].astype("f8"), ds.variables["lon"][:].astype("f8")


def to_cells(months, data, lats, lons):
    """Mean of the grid points whose centre lies inside each 5 degree cell, weighted by cos(latitude)."""
    lons = np.where(lons >= 180, lons - 360, lons)
    out = {}
    for la0 in range(-90, 90, 5):
        rows = np.where((lats >= la0) & (lats < la0 + 5))[0]
        if not len(rows):
            continue
        w = np.cos(np.radians(lats[rows]))
        for lo0 in range(-180, 180, 5):
            cols = np.where((lons >= lo0) & (lons < lo0 + 5))[0]
            if not len(cols):
                continue
            block = data[:, rows][:, :, cols]  # time, rows, cols
            ww = np.broadcast_to(w[None, :, None], block.shape)
            ok = ~np.isnan(block)
            num = np.where(ok, block * ww, 0).sum(axis=(1, 2))
            den = np.where(ok, ww, 0).sum(axis=(1, 2))
            series = np.where(den > 0, num / np.where(den > 0, den, 1), np.nan)
            if np.isnan(series).all():
                continue
            out[f"{la0},{lo0}"] = series
    return out


def normals(months, series):
    """Mean of each calendar month over the base period."""
    n = np.full(12, np.nan)
    for m in range(1, 13):
        idx = [i for i, (y, mm) in enumerate(months) if mm == m and BASE[0] <= y <= BASE[1]]
        v = series[idx]
        if np.isfinite(v).sum() >= 20:
            n[m - 1] = np.nanmean(v)
    return n


def r(x, nd):
    return None if x is None or not math.isfinite(x) else round(float(x), nd)


def main():
    work, out_path = sys.argv[1], sys.argv[2]
    os.makedirs(work, exist_ok=True)
    gz, gis, gp = (os.path.join(work, n) for n in ("gistemp.nc.gz", "gistemp.nc", "gpcp.nc"))
    if "--no-download" not in sys.argv:
        fetch(GISTEMP, gz)
        with gzip.open(gz) as s, open(gis, "wb") as d:
            shutil.copyfileobj(s, d)
        fetch(GPCP, gp)
    with Dataset(gis) as ds:
        tm, td, tla, tlo = monthly(ds, "tempanomaly")
    with Dataset(gp) as ds:
        pm, pd, pla, plo = monthly(ds, "precip")
    tcells, pcells = to_cells(tm, td, tla, tlo), to_cells(pm, pd, pla, plo)
    cells = {}
    for key in sorted(set(tcells) | set(pcells)):
        c = {}
        if key in tcells:
            s = tcells[key]
            n = normals(tm, s)
            c["t"] = [r(v - n[m - 1], 2) for v, (_, m) in zip(s, tm)]  # anomaly vs 1991-2020, degrees C
        if key in pcells:
            s = pcells[key]
            n = normals(pm, s)
            c["p"] = [r(v, 2) for v in s]  # mm per day
            c["pn"] = [r(v, 2) for v in n]  # 1991-2020 normal per calendar month
        cells[key] = c
    doc = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "base": f"{BASE[0]}-{BASE[1]}",
        "t_start": f"{tm[0][0]}-{tm[0][1]:02d}", "t_end": f"{tm[-1][0]}-{tm[-1][1]:02d}",
        "p_start": f"{pm[0][0]}-{pm[0][1]:02d}", "p_end": f"{pm[-1][0]}-{pm[-1][1]:02d}",
        "sources": {"temperature": GISTEMP, "rainfall": GPCP},
        "cells": cells,
    }
    tmp = out_path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    os.replace(tmp, out_path)
    print(f"{len(cells)} cells, temperature {doc['t_start']}..{doc['t_end']}, rainfall {doc['p_start']}..{doc['p_end']}, "
          f"{os.path.getsize(out_path) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()

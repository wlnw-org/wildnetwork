#!/usr/bin/env python3
"""Land cover share per 1 degree square from ESA WorldCover 2021 v200 (10 m, CC BY 4.0, open on AWS, no account).

Reads only the smallest built-in overview of each 3 degree tile (562 x 562, about 600 m pixels) over HTTP, so a full run
moves a few hundred MB, not the 100+ GB of full-resolution tiles. Needs python3-gdal (apt).

Usage: python3 -I scripts/landcover.py <output json> [threads=8] [max_tiles]
Output: {generated, source, licence, classes: [...], cells: {"lat,lon": [percent per class...]}} with lat/lon the south-west
corner of the 1 degree square (floor), classes in the order of CLASSES, squares that are 99% or more water left out (open sea).
"""
import json, os, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import numpy as np
from osgeo import gdal

gdal.UseExceptions()
gdal.SetConfigOption("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
gdal.SetConfigOption("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
gdal.SetConfigOption("GDAL_HTTP_MAX_RETRY", "4")
gdal.SetConfigOption("GDAL_HTTP_RETRY_DELAY", "3")

BUCKET = "https://esa-worldcover.s3.eu-central-1.amazonaws.com"
PREFIX = "v200/2021/map/"
# WorldCover codes grouped into the classes shown on the map.
CLASSES = [
    ("forest", [10, 95]),          # tree cover, mangroves
    ("grass and shrub", [20, 30, 100]),  # shrubland, grassland, moss and lichen
    ("cropland", [40]),
    ("built-up", [50]),
    ("bare, snow and ice", [60, 70]),
    ("water and wetland", [80, 90]),
]
LUT = np.full(256, -1, dtype=np.int16)
for i, (_, codes) in enumerate(CLASSES):
    LUT[codes] = i


def list_tiles():
    keys, token = [], None
    while True:
        url = f"{BUCKET}/?list-type=2&prefix={PREFIX}" + (f"&continuation-token={urllib.parse.quote(token)}" if token else "")
        body = urllib.request.urlopen(url, timeout=60).read().decode()
        keys += re.findall(r"<Key>([^<]+_Map\.tif)</Key>", body)
        m = re.search(r"<NextContinuationToken>([^<]+)</NextContinuationToken>", body)
        if not m:
            return keys
        token = m.group(1)


def tile_counts(key):
    """Pixel counts per (1 degree cell, class) for one tile, from its smallest overview."""
    for attempt in range(3):
        try:
            ds = gdal.Open(f"/vsicurl/{BUCKET}/{key}")
            band = ds.GetRasterBand(1)
            ov = band.GetOverview(band.GetOverviewCount() - 1)
            a = ov.ReadAsArray()
            x0, px, _, y0, _, py = ds.GetGeoTransform()
            sx = ds.RasterXSize / ov.XSize
            sy = ds.RasterYSize / ov.YSize
            ny, nx = a.shape
            lon = x0 + (np.arange(nx) + 0.5) * px * sx
            lat = y0 + (np.arange(ny) + 0.5) * py * sy
            cls = LUT[a]
            ok = cls >= 0
            ci = np.floor(lat).astype(int)[:, None].repeat(nx, 1)[ok]
            cj = np.floor(lon).astype(int)[None, :].repeat(ny, 0)[ok]
            k = cls[ok]
            out = {}
            keys, counts = np.unique(np.stack([ci, cj, k]), axis=1, return_counts=True)
            for (la, lo, c), n in zip(keys.T, counts, strict=True):
                out.setdefault((int(la), int(lo)), np.zeros(len(CLASSES), dtype=np.int64))[int(c)] += int(n)
            return out
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(5 * (attempt + 1))
    print(f"failed {key}: {err}", file=sys.stderr)
    return {}


def main():

    out_path = sys.argv[1]
    threads = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    tiles = list_tiles()
    if len(sys.argv) > 3:
        tiles = tiles[: int(sys.argv[3])]
    print(f"{len(tiles)} tiles", flush=True)
    total = {}
    t0 = time.time()
    with ThreadPoolExecutor(threads) as ex:
        for i, res in enumerate(ex.map(tile_counts, tiles), 1):
            for cell, v in res.items():
                total[cell] = total.get(cell, 0) + v
            if i % 200 == 0:
                print(f"{i}/{len(tiles)} tiles, {time.time() - t0:.0f} s", flush=True)
    cells = {}
    for (la, lo), v in total.items():
        s = v.sum()
        if s == 0 or v[-1] >= 0.99 * s:  # open sea (and the odd all-water square): left out
            continue
        cells[f"{la},{lo}"] = [round(float(x) * 100 / s, 1) for x in v]
    doc = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "ESA WorldCover 10 m 2021 v200 (Zanaga et al. 2022, doi:10.5281/zenodo.7254221), read at about 600 m",
        "licence": "CC BY 4.0",
        "classes": [c for c, _ in CLASSES],
        "cells": cells,
    }
    with open(out_path + ".tmp", "w") as f:
        json.dump(doc, f, separators=(",", ":"))

    os.replace(out_path + ".tmp", out_path)
    print(f"done: {len(cells)} squares from {len(tiles)} tiles in {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()

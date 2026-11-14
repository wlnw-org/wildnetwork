import { test } from "node:test";
import assert from "node:assert/strict";
import { nightOf, parseVpts, solarElevation } from "./radar";

const HEAD = "radar,datetime,height,u,v,w,ff,dd,sd_vvp,gap,eta,dens,dbz,dbz_all,n,n_dbz,n_all,n_dbz_all,rcs,sd_vvp_threshold,vcp,radar_latitude,radar_longitude,radar_height,radar_wavelength,source_file";
const row = (dt: string, h: number, o: { u?: number; v?: number; ff?: number; sd?: number; gap?: boolean; dens?: number } = {}) =>
  ["x", dt, h, o.u ?? 0, o.v ?? -5, 0, o.ff ?? 5, 180, o.sd ?? 4, o.gap ? "TRUE" : "FALSE", 0, o.dens ?? 10, 0, 0, 0, 0, 0, 0, 11, 2, "", 51, 3, 50, 5.3, "f"].join(",");

test("night key follows the local evening", () => {
  assert.equal(nightOf(new Date("2026-11-12T02:00:00Z"), 3), "2026-11-11");
  assert.equal(nightOf(new Date("2026-11-12T20:00:00Z"), 3), "2026-11-12");
});

test("sun is down at midnight and up at noon in Belgium", () => {
  assert.ok(solarElevation(new Date("2026-11-12T00:00:00Z"), 51, 3) < -6);
  assert.ok(solarElevation(new Date("2026-11-12T12:00:00Z"), 51, 3) > 0);
});

test("integrates density over height; gaps count for density only; skips the lowest band, low sd_vvp and daylight", () => {
  const csv = [HEAD, row("2026-11-12T01:00:00Z", 0, { dens: 99 }),
    row("2026-11-12T01:00:00Z", 200), row("2026-11-12T01:00:00Z", 400, { gap: true, v: 50 }),
    row("2026-11-12T01:00:00Z", 800, { sd: 1 }), row("2026-11-12T12:00:00Z", 200, { dens: 500 })].join("\n");
  const r = parseVpts(csv)!;
  assert.equal(r.parts.length, 1);
  const p = r.parts[0];
  assert.equal(p.night, "2026-11-11");
  assert.equal(p.n, 1);
  assert.ok(Math.abs(p.vid - 4) < 1e-9); // 2 bins x 10 birds/km3 x 0.2 km
  assert.ok(Math.abs(p.mtr - 2 * 5 * 3.6) < 1e-9); // only the bin with velocity
  assert.ok(Math.abs(p.v - 10 * -5) < 1e-9);
});

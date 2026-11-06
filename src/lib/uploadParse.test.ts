import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanName, guessMapping, parseCsv, timeFromFileName, toRows, toUtc } from "./uploadParse";

const opts = { utcOffsetHours: 0, minConf: 0.8, method: "machine" as const };

test("parseCsv handles quotes, semicolons and CRLF", () => {
  assert.deepEqual(parseCsv('a;b\r\n"x;1";"say ""hi"""\r\n'), [["a", "b"], ["x;1", 'say "hi"']]);
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a\tb\n1\t2\n\n"), [["a", "b"], ["1", "2"]]);
});

test("BirdNET-Pi export", () => {
  const t = parseCsv("Date;Time;Sci_Name;Com_Name;Confidence;Lat;Lon;Cutoff\n2025-05-01;05:30:12;Turdus merula;Common Blackbird;0.91;51.5;-0.12;0.7\n2025-05-01;05:31:00;Erithacus rubecula;European Robin;0.62;51.5;-0.12;0.7");
  const { format, mapping } = guessMapping(t[0]);
  assert.equal(format, "BirdNET-Pi or BirdNET-Go");
  const { rows, skipped } = toRows(t.slice(1), mapping, { ...opts, utcOffsetHours: 1 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ts, "2025-05-01T04:30:12.000Z");
  assert.equal(rows[0].name, "Turdus merula");
  assert.equal(skipped["below confidence"], 1);
});

test("BirdNET-Analyzer table takes the time from the recording's file name plus the offset", () => {
  const t = parseCsv("Start (s),End (s),Scientific name,Common name,Confidence,File\n12.0,15.0,Copsychus saularis,Oriental Magpie-Robin,0.95,/sd/SMM07000_20251102_054500.wav\n0,3,Human vocal,Human vocal,0.99,/sd/SMM07000_20251102_054500.wav");
  const { format, mapping } = guessMapping(t[0]);
  assert.equal(format, "BirdNET-Analyzer");
  const { rows, skipped } = toRows(t.slice(1), mapping, { ...opts, utcOffsetHours: 5.5, lat: 13.08, lon: 80.27, site: "Guindy 1" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ts, "2025-11-02T00:15:12.000Z");
  assert.equal(rows[0].site, "Guindy 1");
  assert.equal(rows[0].file, "SMM07000_20251102_054500.wav");
  assert.equal(skipped["not an animal"], 1);
});

test("Kaleidoscope prefers the manual ID and adds the offset to the file time", () => {
  const t = parseCsv("INDIR,FOLDER,IN FILE,OFFSET,DATE,TIME,AUTO ID*,MANUAL ID\nx,Pond A,a.wav,30,2025-06-01,21:00:00,MYOLUC,Myotis lucifugus\nx,Pond A,b.wav,0,2025-06-01,21:05:00,EPTFUS,");
  const { format, mapping } = guessMapping(t[0]);
  assert.equal(format, "Kaleidoscope");
  const { rows } = toRows(t.slice(1), mapping, { ...opts, method: "human", lat: -19.4, lon: 15.9 });
  assert.deepEqual(rows.map((r) => [r.name, r.ts, r.site]), [
    ["Myotis lucifugus", "2025-06-01T21:00:30.000Z", "Pond A"],
    ["EPTFUS", "2025-06-01T21:05:00.000Z", "Pond A"],
  ]);
});

test("dates, names and locations", () => {
  assert.equal(toUtc("2025-01-02T03:04:05Z", undefined, 5), "2025-01-02T03:04:05.000Z");
  assert.equal(toUtc("2025/01/02 03:04", undefined, -2), "2025-01-02T05:04:00.000Z");
  assert.equal(toUtc("02/01/2025", "10:00", 0), null);
  assert.deepEqual(timeFromFileName("20240501_053000.WAV"), { date: "2024-05-01", time: "05:30:00" });
  assert.equal(cleanName("Turdus merula_Common Blackbird"), "Turdus merula");
  const { rows, skipped } = toRows([["2025-01-01", "Turdus merula", "0.9"]], { date: 0, species: [1], confidence: 2 }, opts);
  assert.equal(rows.length, 0);
  assert.equal(skipped["no location"], 1);
});

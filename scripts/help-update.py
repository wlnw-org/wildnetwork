#!/usr/bin/env python3
"""Change help guide text (src/data/help.ts) and its translations (public/i18n/body-<lang>.json) in one go.

Usage: python3 scripts/help-update.py spec.json
spec: [{"old": "...", "new": "...", "tr": {"es": "...", ...}}]   replace a guide string
      [{"old": "...", "new": null}]                              delete a list item
      [{"after": "...", "new": "...", "tr": {...}}]               insert a list item after another
Then run `pnpm i18n:body` to confirm nothing is missing.
"""
import json, re, sys

LANGS = ["es", "fr", "de", "pt", "hi", "ta"]
spec = json.load(open(sys.argv[1]))
H = "src/data/help.ts"
h = open(H).read()
D = {l: json.load(open(f"public/i18n/body-{l}.json")) for l in LANGS}
for x in spec:
    o, n, a = x.get("old"), x.get("new"), x.get("after")
    if o and n:
        assert json.dumps(o) in h, f"not found: {o[:60]}"
        h = h.replace(json.dumps(o), json.dumps(n), 1)
    elif o and not n:
        h, c = re.subn(r"\n\s*" + re.escape(json.dumps(o)) + r",", "", h)
        assert c == 1, f"not found: {o[:60]}"
    elif a and n:
        m = re.search(r"(\n(\s*))" + re.escape(json.dumps(a)) + ",", h)
        assert m, f"not found: {a[:60]}"
        h = h[: m.end()] + m.group(1) + json.dumps(n) + "," + h[m.end():]
    for l in LANGS:
        if o:
            D[l].pop(o, None)
        if n:
            D[l][n] = x["tr"][l]
open(H, "w").write(h)
for l in LANGS:
    open(f"public/i18n/body-{l}.json", "w").write(json.dumps(D[l], ensure_ascii=False, indent=1) + "\n")

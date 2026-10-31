#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later  Copyright (C) 2026 Lacustat
# INHALT / CONTENTS: 1. Datei lesen · read file  2. Einträge ersetzen · replace entries
# DE: Trägt Signaturen aus scripts/data/<name>.txt in plugins/<plugin>/functions.json ein (Eintrag bekommt Tag "unverified").
# EN: writes signatures from scripts/data/<name>.txt into plugins/<plugin>/functions.json (entry gets tag "unverified").
# Aufruf · usage: apply-signatures.py scripts/data/vanilla-signatures.txt plugins/vanilla-1.12/functions.json
import json, sys
src, dst = sys.argv[1], sys.argv[2]
def prm(s):
    out = []
    for p in [x for x in s.split(',') if x]:
        n, t = p.split(':'); opt = t.endswith('?'); t = t.rstrip('?')
        o = {"name": n, "type": t}
        if opt: o["optional"] = True
        out.append(o)
    return out
data = json.load(open(dst)); idx = {x["name"]: x for x in data}; n = 0
for line in open(src, encoding='utf-8'):
    if not line.strip() or line.startswith('#'): continue
    name, ps, rs, en, de = line.rstrip('\n').split('|')
    e = idx.get(name)
    if e is None: print("unbekannt · unknown:", name); continue
    if "signature-unknown" not in e.get("tags", []): continue
    e["params"], e["returns"] = prm(ps), prm(rs)
    e["description"] = {"en": en, "de": de}
    e["tags"] = [t for t in e["tags"] if t != "signature-unknown"] + ["unverified"]
    n += 1
json.dump(data, open(dst, 'w'), ensure_ascii=False, indent=2); open(dst, 'a').write("\n")
print("aktualisiert · updated:", n)

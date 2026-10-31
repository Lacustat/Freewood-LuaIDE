#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later  Copyright (C) 2026 Lacustat
# INHALT / CONTENTS: 1. Namensregeln · name rules  2. Anwenden · apply
# DE: Leitet Typen für Einträge mit Tag "types-unknown" aus Parameter-/Rückgabenamen ab (nur eindeutige Muster); Tag wird "types-inferred".
# EN: infers types for entries tagged "types-unknown" from parameter/return names (unambiguous patterns only); tag becomes "types-inferred".
# Aufruf · usage: infer-classicapi-types.py plugins/classicapi-1.12/functions.json
import json, re, sys
dst = sys.argv[1]
EXACT = {"unit": "UnitId", "targetUnit": "UnitId", "name": "string", "text": "string", "message": "string", "file": "string",
         "texture": "string", "guid": "string", "itemGUID": "string", "atlasName": "string", "notes": "string", "icon": "string",
         "slot": "number", "index": "number", "amount": "number", "x": "number", "y": "number", "value": "number",
         "enable": "boolean", "disable": "boolean", "reverse": "boolean", "exactMatch": "boolean", "placeGroundSpell": "boolean",
         "bookType": "string", "filter": "string", "event": "string", "separator": "string", "button": "string",
         "color": "table", "statTable": "table", "options": "table", "itemLocation": "table"}
def guess(n):
    if n in EXACT: return EXACT[n]
    if re.search(r'(ID|Id|Index|Slot|Count|Level|Height)$', n): return "number"
    if re.match(r'^(is|has|can|should|include|show)[A-Z]', n): return "boolean"
    return None
data = json.load(open(dst)); k = 0
for e in data:
    if "types-unknown" not in e.get("tags", []): continue
    for p in e["params"] + e["returns"]:
        if p["type"] == "any":
            g = guess(p["name"])
            if g: p["type"] = g
    e["tags"] = ["types-inferred" if t == "types-unknown" else t for t in e["tags"]]; k += 1
json.dump(data, open(dst, 'w'), ensure_ascii=False, indent=2); open(dst, 'a').write("\n")
print("bearbeitet · processed:", k)

#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later  Copyright (C) 2026 Lacustat
# INHALT / CONTENTS: 1. Überschriften lesen · parse headings  2. Parameter/Rückgaben/Text ableiten · derive  3. JSON schreiben · write
# DE: Liest docs/API.md des ClassicAPI-Repos (GPL-3.0) und füllt Parameter-Namen, Rückgabe-Namen (aus dem ersten
#     `local a, b = Name(...)`-Beispiel) und den ersten Absatz für Einträge mit "signature-unknown". Typen sind unbekannt ("any").
# EN: reads ClassicAPI's docs/API.md and fills parameter names, return names (from the first `local a, b = Name(...)`
#     example) and the first paragraph for entries tagged "signature-unknown". Types are unknown ("any").
# Aufruf · usage: import-classicapi-docs.py <API.md> plugins/classicapi-1.12/functions.json
import json, re, sys
md = open(sys.argv[1], encoding='utf-8').read(); dst = sys.argv[2]
data = json.load(open(dst)); idx = {x["name"]: x for x in data}
secs = re.split(r'^### ', md, flags=re.M)[1:]
def params(a):
    out = []
    a = a.strip()
    if not a: return out
    # optionale Teile in [...] · optional parts in [...]
    flat = a.replace('[', ',[').replace(']', '').replace(' ', '')
    for p in [x for x in flat.split(',') if x or False]:
        opt = p.startswith('[')
        n = p.lstrip('[').strip()
        if not n: continue
        n = re.sub(r'[^A-Za-z0-9_.]', '', n) or 'arg'
        o = {"name": n, "type": "any"}
        if opt or '=' in p: o["optional"] = True
        out.append(o)
    return out
done = 0
for s in secs:
    head, _, body = s.partition('\n')
    names = re.findall(r'`([A-Za-z_][\w.]*)\(([^`]*)\)`', head)
    if not names: continue
    para = []
    for ln in body.strip().split('\n'):
        if not ln.strip() or ln.startswith(('```', '|', '#')): break
        para.append(ln.strip())
    text = ' '.join(para)
    text = re.sub(r'\s+', ' ', text).replace('`', '')
    m = re.search(r'```lua\s*\n(.*?)```', body, re.S)
    code = m.group(1) if m else ''
    for name, args in names:
        e = idx.get(name)
        if e is None or "signature-unknown" not in e.get("tags", []): continue
        rets = []
        r = re.search(r'local\s+([\w, ]+?)\s*=\s*' + re.escape(name) + r'\s*\(', code)
        if r: rets = [{"name": v.strip(), "type": "any"} for v in r.group(1).split(',') if v.strip()]
        e["params"], e["returns"] = params(args), rets
        if text: e["description"] = {"en": text, "de": "(englisch) " + text}
        e["tags"] = [t for t in e["tags"] if t != "signature-unknown"] + ["types-unknown"]
        done += 1
json.dump(data, open(dst, 'w'), ensure_ascii=False, indent=2); open(dst, 'a').write("\n")
print("aktualisiert · updated:", done, "von · of", sum(1 for x in data if "signature-unknown" in x.get("tags", [])) + done)

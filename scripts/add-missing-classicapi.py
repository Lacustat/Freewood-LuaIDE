#!/usr/bin/env python3
# DE: Ergänzt in plugins/classicapi-1.12/functions.json Funktionen, die docs/API.md beschreibt, die Daten aber (noch) nicht kennen.
# EN: adds functions described in docs/API.md but missing from plugins/classicapi-1.12/functions.json (name only, tag signature-unknown).
# Aufruf · usage: add-missing-classicapi.py <API.md> plugins/classicapi-1.12/functions.json plugins/vanilla-1.12/functions.json
import re, json, sys
md = open(sys.argv[1], encoding='utf-8').read()
dst = sys.argv[2]
data = json.load(open(dst))
have = {f['name'] for f in data} | {f['name'] for f in json.load(open(sys.argv[3]))}
skip = {'OnCharComposition', 'OnMinMaxChanged', 'OnTextChanged', 'SelectOptionByIndex', 'DeleteAccount', 'SaveAccount', 'LoginWithSavedAccount',
        'GetSavedAccounts', 'GetSavedCharacterOrder', 'SetSavedCharacterOrder'}
names = []
for m in re.finditer(r'^###+ (.+)$', md, re.M):
    for part in re.split(r'\s+/\s+', m.group(1)):
        mm = re.match(r'`([A-Za-z_][\w\.]*)\(', part)
        if mm and mm.group(1) not in have and mm.group(1) not in skip and not mm.group(1).startswith('region') and mm.group(1) not in names:
            names.append(mm.group(1))
for n in names:
    system = n.split('.')[0][2:] if n.startswith('C_') else 'Misc'
    data.append({"name": n, "system": system, "params": [], "returns": [],
                 "description": {"en": "ClassicAPI function (%s). Signature not documented yet." % system, "de": "ClassicAPI-Funktion (%s). Signatur noch nicht dokumentiert." % system},
                 "tags": ["signature-unknown"]})
json.dump(data, open(dst, 'w'), ensure_ascii=False, indent=2)
print('added', len(names))

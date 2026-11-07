# Forever_Failure: Fehler und Stolpersteine im echten Client · Failures and pitfalls in the real client

<!-- Freewood LUA IDE – SPDX-License-Identifier: GPL-3.0-or-later – Copyright (C) 2026 Lacustat -->

**Deutsch & English.** Autor · Author: Lacustat. Angelegt · created 07.11.2026. Wird laufend ergänzt · continuously extended.

## Inhalt · Contents
1. [Wofür · Purpose](#wofür--purpose)
2. [So lesen · How to read](#so-lesen--how-to-read)
3. [Post und Taschen · Mail and bags](#post-und-taschen--mail-and-bags)
4. [Kampf, Secret Values, Haustiere · Combat, secret values, pets](#kampf-secret-values-haustiere--combat-secret-values-pets)
5. [Makros und Tastenbelegung · Macros and key bindings](#makros-und-tastenbelegung--macros-and-key-bindings)
6. [Laden, Neustart, SavedVariables · Loading, restart, SavedVariables](#laden-neustart-savedvariables--loading-restart-savedvariables)
7. [Eigene Fehler, die Tests hätten finden können · Own bugs tests could have found](#eigene-fehler-die-tests-hätten-finden-können--own-bugs-tests-could-have-found)
8. [Hinweise für Retail und die Simulation · Notes for Retail and the simulation](#hinweise-für-retail-und-die-simulation--notes-for-retail-and-the-simulation)
9. [Neuen Eintrag anlegen · Adding an entry](#neuen-eintrag-anlegen--adding-an-entry)

## Wofür · Purpose
**DE:** Hier stehen Fehler, die beim Testen von Freewood-Addons im echten Spiel (WoW Forever, Client 1.60.1, Interface 16001, Lua 5.1) aufgetreten sind, obwohl Syntax-Prüfung und Simulation grün waren. Ziel: die Simulation der IDE so zu verbessern, dass sie diese Fälle nachstellt, und anderen Chats (zum Beispiel für Retail) zu sagen, was sie beachten müssen.
**EN:** This file lists failures seen when testing Freewood addons in the real game (WoW Forever, client 1.60.1, Interface 16001, Lua 5.1) although syntax checks and the simulation were green. Goal: make the IDE simulation reproduce these cases, and tell other chats (for example for Retail) what to watch out for.

## So lesen · How to read
**DE:** Jeder Eintrag hat: **Symptom**, **Ursache**, **Lösung im Addon**, **Für die IDE** (was die Simulation tun sollte) und einen **Status**: *bestätigt* = im Spiel beobachtet; *übernommen* = aus einem im Spiel erprobten Modul (Creator) übernommen; *vermutet* = Ursache nicht belegt; *ungeprüft* = noch nicht im Spiel gesehen. Alle Beispieldaten sind erfunden; keine echten Namen.
**EN:** Each entry has: **symptom**, **cause**, **fix in the addon**, **For the IDE** (what the simulation should do) and a **status**: *confirmed* = observed in game; *adopted* = taken from a module proven in game (Creator); *suspected* = cause not proven; *unchecked* = not seen in game yet.

## Post und Taschen · Mail and bags

### F-01 Item aufnehmen füllt den Cursor nicht (Post)
- **Symptom:** Beim Senden eines Briefes mit Anhang meldet der Mailer „ließ sich nicht anhängen (pickup)“; `PickupContainerItem` auf das Item füllt den Cursor auch nach Wartezeit nicht, obwohl der Senden-Reiter aktiv ist und der Platz nicht gesperrt ist. · Mailer reports “could not be attached (pickup)”: `PickupContainerItem` does not fill the cursor even after waiting, with the Send tab active and the slot unlocked.
- **Ursache · Cause:** unbekannt · unknown (*vermutet · suspected*: Pickup aus einem Timer-/OnUpdate-Aufruf wird vom Client im Postfach-Kontext ignoriert).
- **Lösung · Fix:** Weg „Benutzen“ (`UseContainerItem(bag, slot)` bei offenem Senden-Reiter): das Spiel hängt das Item selbst an. Klappte im Spiel, brauchte aber vorher drei Pickup-Versuche (lange Wartezeit). Ab Freewood-Mail 0.1.12 zuerst „Benutzen“, der Weg wird gemerkt, Rückfall Aufnehmen/Klick.
- **Für die IDE:** `PickupContainerItem` darf im Modus „Forever-Post“ den Cursor leer lassen; `UseContainerItem` bei sichtbarem Senden-Reiter hängt an Platz 1 an. · In “Forever mail” mode `PickupContainerItem` may leave the cursor empty; `UseContainerItem` with the Send tab shown attaches to slot 1.
- **Status:** *bestätigt · confirmed* (Verhalten), Ursache *vermutet*.

### F-02 `ClickSendMailItemButton` ohne Platznummer
- **Symptom:** Anhang bleibt leer. · Attachment stays empty.
- **Ursache:** Im Creator-Modul (im Spiel erprobt) wird immer `ClickSendMailItemButton(slotIndex)` mit Platznummer aufgerufen, mit Pausen davor und danach.
- **Lösung:** Platznummer 1 mitgeben; im zweiten Versuch ohne Argument probieren.
- **Für die IDE:** Aufruf ohne Platznummer soll fehlschlagen oder nichts tun; mit Nummer klappt er nur, wenn der Cursor ein Item hält.
- **Status:** *übernommen · adopted*.

### F-03 Senden-Reiter des Blizzard-Postfachs muss aktiv sein
- **Symptom:** Anhängen (Benutzen oder Klick) greift nicht, wenn nur unser eigenes Fenster sichtbar ist. · Attaching does not work when only our own window is visible.
- **Ursache:** Unser Fenster liegt über dem unsichtbar offenen Blizzard-Postfach. Items legen sich nur in den Briefplatz, wenn dort der Reiter „Senden“ (`MailFrameTab2`, `SendMailFrame` sichtbar) aktiv ist.
- **Lösung:** Vor dem Anhängen `SendMailFrame:IsShown()` prüfen und sonst `MailFrameTab2:Click()` (Rückfall `MailFrameTab_OnClick`).
- **Für die IDE:** `UseContainerItem` und `ClickSendMailItemButton` hängen nur an, wenn `SendMailFrame` sichtbar ist.
- **Status:** *übernommen*; im Spiel war der Reiter bei der Diagnose bereits aktiv, war also nicht die Ursache von F-01.

### F-04 Der Anhang erscheint verzögert
- **Symptom:** `GetSendMailItem(1)` liefert direkt nach dem Klick noch leer.
- **Lösung:** Erst nach einer Pause (0,35 s) prüfen; bis zu 3 Versuche.
- **Für die IDE:** Anhang erst nach 0,2 bis 0,5 s Spielzeit sichtbar machen, nicht im selben Aufruf.
- **Status:** *übernommen*.

### F-05 Frisch bewegte oder geteilte Items sind kurz gesperrt
- **Symptom:** Pickup scheitert, `isLocked` ist wahr.
- **Lösung:** Bis zu 3 s in 0,2-s-Schritten warten, dann trotzdem versuchen.
- **Für die IDE:** Nach Teilen/Verschieben Platz für 0,5 bis 1 s als `isLocked` melden.
- **Status:** *übernommen*.

### F-06 Mailer-Ablauf muss in Schritten laufen
- **Symptom:** Synchrones Aufnehmen, Klicken und Prüfen in einem Aufruf liefert falsche Fehler.
- **Lösung:** Zustandsautomat mit Zeitpunkten (`pick`, `pickcheck`, `click`, `check`, `usecheck`), der von einem Treiber (`OnUpdate`) weitergeschaltet wird.
- **Für die IDE:** Zeit der Simulation vorspulen (`--advance`) und nach jedem Schritt prüfen; keine Instant-Ergebnisse.
- **Status:** *bestätigt*.

## Kampf, Secret Values, Haustiere · Combat, secret values, pets

### F-07 Secret Values im Kampf
- **Symptom:** Fokus-Wert und Abklingzeiten von Haustier-Fähigkeiten sind im Kampf nicht lesbar; Rechnen oder Vergleichen löst Fehler aus. Protokollzeilen mit solchen Werten landen in SavedVariables als `nil --[[ secret value ]]`.
- **Ursache:** Der Client 1.60.1 liefert im Kampf „Secret Values“.
- **Lösung:** `issecretvalue(x)` prüfen, bevor gerechnet oder geloggt wird; Anzeige in Hilfsfunktion (`S()`, `CdText()`) kapseln.
- **Für die IDE:** Modus „Kampf“: `UnitPower`, `GetSpellCooldown` usw. liefern ein Secret-Value-Objekt; Vergleich und Arithmetik schlagen fehl, `issecretvalue` ist wahr.
- **Status:** *bestätigt*.

### F-08 `TogglePetAutocast` im Kampf verboten
- **Symptom:** Aufruf im Kampf wird blockiert.
- **Lösung:** Autocast-Profile außerhalb des Kampfes setzen; im Kampf nur sichere Knöpfe oder `/click` (laufen im Kampf).
- **Für die IDE:** `InCombatLockdown()` wahr, geschützte Funktionen melden `ADDON_ACTION_FORBIDDEN`.
- **Status:** *bestätigt*.

### F-09 Haustier-Platz leer, wenn das Tier nicht gerufen ist
- **Symptom:** Test „Slot 4 leer“ ohne beschworenes Tier.
- **Lösung:** Vor Pet-Abfragen `UnitExists("pet")` prüfen.
- **Für die IDE:** Haustierleiste ohne Tier leer.
- **Status:** *bestätigt*.

### F-10 Tooltip mit `SetSpellByID` (Tiere)
- **Symptom:** Noch nicht im Spiel gesehen.
- **Lösung:** Mit `pcall` absichern, auf anderen Tooltip-Weg zurückfallen.
- **Status:** *ungeprüft*.

## Makros und Tastenbelegung · Macros and key bindings

### F-11 Makro-Grenzen
- **Regeln:** Text höchstens 255 Zeichen, Name höchstens 16. `CreateMacro` legt zuerst Charaktermakros an (höchstens 18), Account höchstens 120. `EditMacro` für bestehende Namen. Anlegen und Ändern nur außerhalb des Kampfes.
- **Für die IDE:** Diese Grenzen erzwingen, im Kampf `CreateMacro`/`EditMacro` ablehnen.
- **Status:** *bestätigt* (Verhalten des Clients bekannt, Grenzen im Spiel genutzt).

### F-12 `Bindings.xml` und `BINDING_*`
- **Symptom:** Neue Tastenbelegungen erscheinen nach `/reload` nicht.
- **Ursache:** `Bindings.xml` wird nur beim Spielstart gelesen und steht nicht in der `.toc`. Namen kommen aus den Globals `BINDING_HEADER_*` und `BINDING_NAME_*` (aus einer Lua-Datei in der `.toc`).
- **Lösung:** Eine `Bindings.xml` mit `header=` je Modul, Texte aus `GetLocale()`. Spiel neu starten.
- **Für die IDE:** `Bindings.xml` einlesen, Namen gegen die `BINDING_*`-Globals prüfen, `/reload` ändert die Liste nicht.
- **Status:** *bestätigt* (nach Neustart sichtbar und benutzbar).

## Laden, Neustart, SavedVariables · Loading, restart, SavedVariables

### F-13 Neue Dateien in der `.toc` brauchen einen Neustart
- **Symptom:** Neue Lua-Datei (zum Beispiel `UI/TabOrder.lua`) wird nach `/reload` nicht geladen.
- **Lösung:** Spiel neu starten; Nutzer darauf hinweisen. Geänderte, schon bekannte Dateien reichen mit `/reload`.
- **Für die IDE:** Neue Dateien erst nach „Neustart“ der Simulation laden, Änderungen an bekannten Dateien bei `/reload`.
- **Status:** *bestätigt*.

### F-14 SavedVariables stehen erst nach `/reload` oder Beenden auf der Platte
- **Folge:** Probeläufe lesen: erst `/reload`, dann Datei lesen.
- **Status:** *bestätigt*.

## Eigene Fehler, die Tests hätten finden können · Own bugs tests could have found

### F-16 Es gibt keinen Munitionsplatz (Inventarplatz 0)
- **Symptom:** Jäger-Addon meldete bei jeder Taschenänderung „Munition angelegt“, obwohl die Pfeile schon im Köcher lagen.
- **Ursache:** Auf Forever liefert `GetInventoryItemLink("player", 0)` dauerhaft nichts (Probe: „Munitionsplatz (0): leer oder nicht vorhanden“), obwohl Pfeile im Köcher liegen und genutzt werden. Der Vanilla-Munitionsplatz existiert dort nicht oder wird nicht gemeldet; Munition im Köcher gilt direkt.
- **Lösung:** Nicht versuchen, Munition anzulegen: nur ein Versuch je Item-ID, Wirkung prüfen, sonst aufgeben (Freewood-Class 0.4.1).
- **Für die IDE:** `GetInventoryItemLink("player", 0)` gibt `nil` zurück; Köcher (Klasse 11, Unterklasse 2) und Munition (Klasse 6) werden über Taschen gelesen. Aktionen mit Rückmeldung immer auf Wirkung prüfen, nicht auf „Aufruf ohne Fehler“.
- **Status:** *bestätigt* (Probe, Build 16001).

### F-17 Händler verkauft nur ganze Packungen
- **Symptom:** Das Addon wollte „auf den Punkt“ auffüllen (z. B. 142 Pfeile), der Händler verkauft Pfeile aber nur in Packungen zu 200 (Preis je 200, höchste Menge 200).
- **Ursache:** `GetMerchantItemInfo` meldet Menge 200 je Angebot; ein Kauf bringt immer 200. Eine Menge unter 200 gibt es nicht, 200 würden nicht in den Köcher passen.
- **Lösung:** Platz auf volle Angebotsmengen abrunden und nur diese kaufen (`WholeUnits`, Freewood-Class 0.4.2).
- **Für die IDE:** Händlerangebote mit Menge > 1 simulieren (Preis je Angebot, nicht je Stück) und prüfen, dass nie mehr als hineinpasst gekauft wird.
- **Status:** *bestätigt* für das Angebotsformat (Probe); der Kauf selbst ist noch nicht im Spiel geprüft.

### F-18 Zeilenrahmen ohne Breite zeigt seine Kinder nicht
- **Symptom:** Im Reiter „Munition/Pfeile“ blieben Beschriftung und Regler (Größe, Reserve, Warnschwelle) leer; nur die Lücke im Stapel war da.
- **Ursache:** Beschriftung und Regler hingen an einem Zeilenrahmen, dem nur Höhe und ein Ankerpunkt, aber keine Breite gegeben wurde. Auf Forever zeichnet so ein Rahmen seine Kinder nicht.
- **Lösung:** Beschriftung und Regler als eigene Bausteine in den Stapel (wie in ChatBubbles), jeder mit eigener Höhe (Freewood-Class 0.4.3).
- **Für die IDE:** Rahmen ohne Breite oder Höhe (`GetWidth() == 0`) im Test als Warnung melden; Kinder eines solchen Rahmens gelten als nicht sichtbar.
- **Status:** *bestätigt* (Screenshot).

### F-15 Namensprüfung ohne Leerzeichen
- **Symptom:** „Grindma Silberrücken“ (Name mit Leerzeichen) wurde in der Mailingliste als ungültig abgelehnt; nur „GrindmaSilberrücken“ ging.
- **Ursache:** Das Muster `[^%w\128-\255%-]` enthielt kein Leerzeichen.
- **Lösung:** Leerzeichen erlauben (`[^%w\128-\255%- ]`).
- **Für die IDE:** Testfälle für Namen mit Leerzeichen, Umlauten, Bindestrich und Apostroph in jeder Eingabeprüfung.
- **Status:** *bestätigt*, behoben in Freewood-Mail 0.1.8.

## Hinweise für Retail und die Simulation · Notes for Retail and the simulation
**DE:**
- Zeit zählt: Bag-, Cursor- und Postfach-Aufrufe sind in Wirklichkeit asynchron. Eine Simulation, die sofort antwortet, versteckt F-01 bis F-06. Bitte Verzögerungen (0,2 bis 0,5 s) und Sperren einbauen und die Prüfung erst nach `advance` zulassen.
- Retail und Forever bieten `C_Container.*` und `C_AddOns.GetAddOnMetadata`; Addons sollten beide Wege prüfen (`C_Container and C_Container.X or X`).
- Immer prüfen, ob Funktionen existieren (`CursorHasItem` kann fehlen; Ersatz `GetCursorInfo()`).
- Secret Values (F-07) gibt es in Retail im Kampf ebenfalls; `issecretvalue` verwenden, wenn vorhanden.
- Der Senden-Reiter muss aktiv sein, bevor etwas angehängt wird (F-03). Im Retail-Postfach ebenfalls prüfen.
- Tastenbelegungen brauchen einen Spielneustart (F-12), Namen und Überschriften je Modul.
- Eine bestandene Simulation ist kein Beweis für das Spiel. Jeden neuen Fehler hier eintragen.

**EN:**
- Time matters: bag, cursor and mailbox calls are really asynchronous. A simulation that answers instantly hides F-01 to F-06. Add delays (0.2 to 0.5 s) and locks and allow checks only after `advance`.
- Retail and Forever offer `C_Container.*` and `C_AddOns.GetAddOnMetadata`; addons should check both paths (`C_Container and C_Container.X or X`).
- Always check that functions exist (`CursorHasItem` may be missing; fall back to `GetCursorInfo()`).
- Secret values (F-07) exist in Retail in combat too; use `issecretvalue` when present.
- The Send tab must be active before anything is attached (F-03). Check this in the Retail mailbox as well.
- Key bindings need a game restart (F-12), names and headers per module.
- A passing simulation is no proof for the game. Record every new failure here.

## Neuen Eintrag anlegen · Adding an entry
**DE:** Nächste freie Nummer `F-NN` vergeben, Aufbau wie oben (Symptom, Ursache, Lösung, Für die IDE, Status), Inhaltsverzeichnis ergänzen, DE und EN pflegen. Keine echten Namen oder privaten Daten (öffentliches Repo).
**EN:** Use the next free number `F-NN`, same structure (symptom, cause, fix, For the IDE, status), update the table of contents, keep DE and EN. No real names or private data (public repo).

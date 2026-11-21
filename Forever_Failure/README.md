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
8. [Erfolge, die im Spiel bestätigt sind · Confirmed successes](#erfolge-die-im-spiel-bestätigt-sind--confirmed-successes)
9. [Hinweise für Retail und die Simulation · Notes for Retail and the simulation](#hinweise-für-retail-und-die-simulation--notes-for-retail-and-the-simulation)
10. [Neuen Eintrag anlegen · Adding an entry](#neuen-eintrag-anlegen--adding-an-entry)

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
- **Für die IDE:** `Bindings.xml` einlesen, Namen gegen die `BINDING_*`-Globals prüfen, `/reload` ändert die Liste nicht. *Umgesetzt in `fw check` (16.11.2026), siehe auch F-29.*
- **Status:** *bestätigt* (nach Neustart sichtbar und benutzbar).

### F-29 Eigener Bereich in der Tastaturbelegung (`category`)
- **Symptom:** Alle Freewood-Tasten standen in Optionen > Tastaturbelegung unter „AddOns“, gemischt mit anderen Addons. · All Freewood keys were listed under "AddOns" in Options > Key Bindings, mixed with other addons.
- **Ursache · Cause:** `category="ADDONS"` in jeder `Bindings.xml`. Das Spiel nennt einen Bereich nach `_G[category]`, wenn das ein Text ist, sonst nach dem Namen selbst (Blizzard `Blizzard_SettingsDefinitions_Frame/Keybindings.lua`, Funktion `GetBindingCategoryName`; `ADDONS` ist der Spiel-Text „AddOns“). Kopfzeilen (`header=`) zeigt das heutige Menü nur als Abstand, nicht als Text. · The game names a section after `_G[category]` if that is a string, otherwise the raw name; headers are shown only as a spacer.
- **Lösung · Fix:** In jeder `Bindings.xml` `category="BINDING_CATEGORY_FREEWOOD"`, in jeder `Bindings.lua` `BINDING_CATEGORY_FREEWOOD = "Freewood"` (alle Freewood-Forever-Module, 16.11.2026). Vorsilbe `BINDING_CATEGORY_`, damit der Name mit keinem anderen Global kollidiert (`_G.Freewood` ist eine Tabelle; das Menü fiele dann auf den rohen Namen zurück, ältere Menüs könnten daran scheitern). Neustart des Spiels nötig (F-12). · Use `category="BINDING_CATEGORY_FREEWOOD"` and `BINDING_CATEGORY_FREEWOOD = "Freewood"` in every module; game restart needed.
- **Für die IDE:** `fw check` meldet den Bereich, in dem die Einträge landen (`BINDINGS_CATEGORY`), warnt bei einer category ohne Text-Global (`BINDINGS_CATEGORY_RAW`) und bei fehlendem `BINDING_NAME_*` (`BINDINGS_NAME_MISSING`), dazu den Neustart-Hinweis (`BINDINGS_RESTART`). Datei `src/analysis/bindings-check.ts`, Test in `tests/cli.test.ts`. · `fw check` reports the menu section, warns about a category without a string global and missing `BINDING_NAME_*`, plus the restart hint.
- **Status:** *ungeprüft · unchecked* (Blizzard-Code gelesen, im Forever-Menü noch nicht gesehen).

### F-35 Keine Bewegung im Kampf nach dem Öffnen des Chats (`SetPropagateKeyboardInput`)
- **Symptom:** Chat geöffnet (Enter), dann in den Kampf: W/A/S/D und alle anderen Tasten tun nichts mehr, bis der Kampf vorbei ist. · Open the chat with Enter, enter combat: no key works (no movement) until combat ends.
- **Ursache · Cause:** Ein unsichtbarer Rahmen mit `EnableKeyboard(true)` hört auf Enter und schluckt diesen Druck mit `SetPropagateKeyboardInput(false)`. Zurückgestellt wurde erst beim nächsten Tastendruck. `SetPropagateKeyboardInput` ist in der Kampfsperre geschützt; kam der Kampf dazwischen, blieb die Weitergabe aus und der Rahmen verschluckte alle Tasten. · A key-listener frame swallowed Enter with `SetPropagateKeyboardInput(false)` and only restored it on the next key press; that call is protected in combat lockdown.
- **Lösung · Fix:** Nur den einen Druck schlucken und sofort zurückstellen (`C_Timer.After(0)` und `OnKeyUp`), beim Kampfbeginn (`PLAYER_REGEN_DISABLED`, kommt vor der Sperre) noch einmal freigeben, im Kampf nie etwas schlucken (Core 0.55.2, Test `tests/chatkeys_test.lua`). · Swallow only that press and restore at once, restore again on `PLAYER_REGEN_DISABLED`, never swallow in combat.
- **Für die IDE:** Warnung, wenn `SetPropagateKeyboardInput(false)` ohne Rückstellung im selben Bild steht; im Kampf-Szenario `SetPropagateKeyboardInput` als blockiert behandeln.
- **Status:** *gemeldet, Lösung ungeprüft · reported, fix unchecked* (Lacustat, 21.11.2026).

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

### F-19 Mehrzeiliger Text mit SetWordWrap(false) zeigt nur die erste Zeile
- **Symptom:** Im Statistik-Reiter stand je Kategorie nur die erste Zeile (zum Beispiel „Name“), obwohl der Platz für alle Zeilen reserviert war.
- **Ursache:** Ein Label mit `SetWordWrap(false)` und per `\n` verbundenen Zeilen zeichnet auf Forever nur die erste Zeile.
- **Lösung:** Eine Zeile je Label (Pool aus linkem und rechtem Label), Core 0.11.1.
- **Für die IDE:** Text mit `\n` in einem Label ohne Umbruch als Warnung melden.
- **Status:** *bestätigt* (Screenshot).

### F-20 `UnitName("player")` liefert nur den Vornamen
- **Symptom:** Flüstern an den eigenen Charakter („Dr“) ergab „Momentan ist kein Spieler mit dem Namen 'Dr' online“.
- **Ursache:** Charaktere haben auf Forever Vor- und Nachnamen („Dr Freewood“). `UnitName("player")` gibt nur den ersten Teil zurück; Flüstern und Addon-Nachrichten brauchen den vollen Namen.
- **Lösung:** `GetUnitName("player", true)` bzw. `UnitFullName("player")` verwenden und beide Teile mit Leerzeichen verbinden (`Whisper.SelfName`, Core 0.13.2).
- **Für die IDE:** Szenarien mit zweiteiligem Spielernamen anbieten; `UnitName` für den Spieler soll dort nur den Vornamen liefern, `GetUnitName(unit, true)` den vollen Namen.
- **Status:** *bestätigt* (Probe FreewoodNetProbe).

### F-21 `SendAddonMessage` meldet Erfolg, die Nachricht kommt trotzdem nicht an (Kanäle)
- **Symptom:** Senden in eigene Kanäle (und die Kanäle anderer Addons) liefert `Success(0)`, aber weder Addon-Nachricht noch Chat-Text kommt zurück, nicht einmal als Echo.
- **Ursache:** Der Server nimmt Nachrichten in benutzerdefinierte Kanäle an und verwirft sie. Der Rückgabewert sagt nur, dass der Aufruf gültig war.
- **Lösung:** Kanäle nicht als Datenweg benutzen; Flüstern (unsichtbar, an einen online bekannten Spieler), Gilde, Gruppe oder Schlachtzug verwenden.
- **Für die IDE:** `C_ChatInfo.SendAddonMessage(..., "CHANNEL", id)` gibt 0 zurück und stellt nichts zu (umgesetzt, Test in `sim-world.test.ts`). Merksatz: Rückgabewert „Erfolg“ ist kein Zustellbeweis.
- **Status:** *bestätigt* (Probe, drei Kanäle).

### F-22 Ergebnis-Codes und Sendearten von Addon-Nachrichten
- **Gemessen:** SAY, YELL, CLUB, COMMUNITY = `InvalidChatType(4)`. PARTY, RAID, INSTANCE_CHAT = `NotInGroup(5)`. GUILD, OFFICER = `NotInGuild(10)`. WHISPER = `Success(0)`, kommt als `CHAT_MSG_ADDON` (Art WHISPER) an, steht nicht im Chat, auch von fremden Spielern; 100 Nachrichten zu 240 Zeichen in einem Zug ohne Drosselung (an sich selbst). Grenze 255 Zeichen je Nachricht.
- **Für die IDE:** Alle Codes in `Enum.SendAddonMessageResult` und die Regeln in `C_ChatInfo.SendAddonMessage` nachgebildet (ClassicAPI- und Retail-Plugin-Daten, Tests). Das Präfix muss vorher mit `RegisterAddonMessagePrefix` angemeldet sein, sonst kommt nichts an.
- **Status:** *bestätigt*.

### F-23 Systemzeile bei Flüstern an Offline-Spieler
- **Symptom:** Jede Flüster-Addon-Nachricht an einen nicht angemeldeten Spieler schreibt „Momentan ist kein Spieler mit dem Namen 'X' online.“ in den Chat des Senders (auch bei fremden Addons wie `TTS_NET`).
- **Lösung:** Nach dem Senden `CHAT_MSG_SYSTEM` mit `ChatFrame_AddMessageEventFilter` filtern (Namen vergleichen, kurzes Zeitfenster) und den Empfänger als offline merken (Core 0.14.0).
- **Für die IDE:** Flüstern an unbekannte Namen löst `CHAT_MSG_SYSTEM` mit dieser Zeile aus (umgesetzt).
- **Status:** *bestätigt*.

### F-24 `|t` im protokollierten Text ist eine Textur-Escape
- **Symptom:** Im Protokoll stand „Test“ statt „T|test“.
- **Ursache:** `|t` beendet im Text eine Textur; ein senkrechter Strich vor `t` verschwindet oder verändert die Ausgabe.
- **Lösung:** `|` vor der Anzeige durch `/` ersetzen.
- **Für die IDE:** Textfelder, die `|` ungeprüft ausgeben, als Warnung melden.
- **Status:** *bestätigt*.

### F-25 `GetChannelName(name)` liefert die Nummer, nicht den Namen
- **Symptom:** Meine Prüfung „Kanal beigetreten“ las den zweiten Rückgabewert als Namen und beurteilte den Beitritt falsch.
- **Ursache:** Erster Rückgabewert = Kanalnummer (0 = nicht beigetreten).
- **Lösung:** Auf `id > 0` prüfen.
- **Für die IDE:** `GetChannelName` liefert Nummer und Namen laut Vanilla-Signatur; Test für beide Rückgabewerte.
- **Status:** *bestätigt*.

### F-26 Antwort kommt vor dem Zustandswechsel (eigener Fehler im Sender)
- **Symptom (Simulation):** Der Sender wartete nie auf die Quittung, schickte dasselbe Paket endlos erneut.
- **Ursache:** „Warte auf Quittung“ wurde erst nach dem letzten Teil gesetzt; die Quittung kann vor dem nächsten Zeitgeber eintreffen.
- **Lösung:** Zustand vor dem Senden des letzten Teils setzen (WhisperSend 0.14.0, Test `whisper_net_test.lua`).
- **Für die IDE:** Antworten auf eigene Nachrichten dürfen sofort (gleicher Tick) eintreffen; Testläufer mit Zustellung ohne Verzögerung anbieten.
- **Status:** *bestätigt* (Simulationstest).

### F-27 Datei nur halb gespeichert (Arbeitsablauf)
- **Symptom:** Eine große Datei war nach dem Umbau auf 72 statt 160 Zeilen gekürzt; der Syntax-Test war trotzdem grün.
- **Lösung:** Nach großen Umschreibungen Zeilenzahl und die wichtigsten Funktionen prüfen (`grep "^function"`), `git diff --stat` ansehen, vor dem Commit den Test laufen lassen.
- **Für die IDE:** `fw check` soll Funktionen melden, die im Rest des Addons aufgerufen werden, aber nicht mehr definiert sind (Idee, offen).
- **Status:** *bestätigt*.

### F-28 Per Lua erzeugtes Eingabefeld holt sich den Tastaturfokus
- **Symptom:** Nach einem Update reagierte die Tastatur im Spiel nicht mehr; Esc löste es.
- **Ursache:** `CreateFrame("EditBox")` hat `autoFocus` standardmäßig an und ist sofort sichtbar. Ein Hilfsfeld, das nur zum Erreichen der Methodentabelle (für `hooksecurefunc`) angelegt wurde, nahm alle Tasten an (Freewood-Core 0.16.0).
- **Lösung:** Sofort `SetAutoFocus(false)`, `ClearFocus()`, `Hide()` (Core 0.16.1); besser nur Hilfsobjekte anlegen, die keinen Fokus nehmen (Frame, Texture, FontString).
- **Für die IDE:** `CreateFrame("EditBox", ...)` ohne `SetAutoFocus(false)` im selben Block als Warnung melden; in der Simulation Tastaturfokus nachbilden (Tasten gehen an das fokussierte Feld).
- **Status:** *bestätigt* (Nutzer).

### F-34 Knopf blinkt beim ersten Überfahren (Textur wird erst beim Zeichnen geladen)
- **Symptom:** Beim ersten Überfahren eines Knopfs mit eigenem Hover-Bild blinkt er kurz, danach nicht mehr. · A button with its own hover image flickers once on the first hover.
- **Ursache · Cause:** Das Spiel lädt eine Bilddatei erst, wenn sie zum ersten Mal gezeichnet wird. `SetTexture` auf ein neues Bild oder ein vorher verstecktes (`Hide`) bzw. ganz durchsichtiges Bild lädt nicht vorab. · The game loads a file only when it is first drawn; hidden or fully transparent textures are not preloaded.
- **Lösung · Fix:** Alle Zustände eines Knopfs in eine Datei (Atlas) legen und nur die Texturkoordinaten wechseln; andere Bilder vorladen, indem man sie mit Deckkraft 0,01 auf 1 Pixel zeichnet (Freewood-Design 0.2.14, `tools/make_atlas.py`).
- **Für die IDE:** Hinweis bei `SetTexture` in `OnEnter`/`OnMouseDown`.
- **Status:** *bestätigt · confirmed* (Lacustat, 18.11.2026).

### F-33 `Texture:SetMask` verzerrt Icons zu Streifen
- **Symptom:** Berufs-Icons (`Interface\Icons\Trade_*`) mit `SetMask("Interface\CharacterFrame\TempPortraitAlphaMask")` und beschnittenen Texturkoordinaten erschienen im Pinky-Fenster als zusammengequetschte, mehrfach wiederholte Streifen. · Icons masked with the round portrait mask showed up as squeezed, repeated stripes.
- **Ursache · Cause:** Unklar; vermutlich verträgt die Maske in Forever keine geänderten Texturkoordinaten oder die Maskendatei fehlt. · Unclear; likely the mask does not work with changed texture coordinates in Forever, or the mask file is missing.
- **Lösung · Fix:** Keine Maske; Icons eckig mit `SetTexCoord(0.07, 0.93, 0.07, 0.93)` (Freewood-Design 0.2.7). Runde Form besser über eine eigene Ring-Textur darüber.
- **Für die IDE:** Prüfregel: `SetMask` auf Forever als Hinweis melden.
- **Status:** *bestätigt · confirmed* (Screenshot Lacustat, 18.11.2026).

### F-32 Lokale Konstante nach der Funktion, die sie nutzt
- **Symptom:** Der Trenner im Pinky-Fenster stand links außerhalb des Fensters. · The separator was placed left outside the window.
- **Ursache · Cause:** `local SEP_X = …` stand im Code hinter der Funktion, die das Fenster baut. Für diese Funktion war `SEP_X` ein (leerer) globaler Name, `SetPoint` bekam `nil` und setzte 0. · The local was defined after the function using it; inside, it was a nil global.
- **Lösung · Fix:** Maße oben in der Datei festlegen; mit `texluac -l -p datei.lua | grep GETTABUP` prüfen, welche globalen Namen gelesen werden (Freewood-Design 0.2.5).
- **Für die IDE:** Prüfregel: gelesene globale Namen, die in derselben Datei später als `local` erscheinen, als Fehler melden.
- **Status:** *bestätigt · confirmed* (18.11.2026).

### F-31 Reagenzientasche (Tasche 5) wird bei `0..NUM_BAG_SLOTS` übersehen
- **Symptom:** Kräuter, Erze und Öle fehlten in der Item-Auswahl der Mailingliste („nicht in den Taschen“), obwohl sie im Inventar lagen. · Herbs, ores and oils were missing from the mailing list picker although they were in the bags.
- **Ursache · Cause:** Forever hat wie der heutige Client eine Reagenzientasche als Tasche 5. `NUM_BAG_SLOTS` ist 4; eine Schleife `for bag = 0, NUM_BAG_SLOTS` sieht sie nicht. · Forever has a reagent bag as bag 5; `NUM_BAG_SLOTS` is 4.
- **Lösung · Fix:** Zum Suchen von Items bis `math.max(NUM_BAG_SLOTS, NUM_TOTAL_EQUIPPED_BAG_SLOTS or 5)` gehen (Freewood-Mail 0.3.3). Für „freie Plätze“ die Reagenzientasche weglassen, sie nimmt nur Handwerksmaterial an.
- **Für die IDE:** In der Simulation Tasche 5 als Reagenzientasche anbieten (nur Handwerksmaterial); Prüfregel: Schleifen `0..NUM_BAG_SLOTS` bei der Item-Suche als Hinweis melden.
- **Status:** *bestätigt · confirmed* (Lacustat, 16.11.2026: nach der Änderung erscheinen die Kräuter).

### F-30 `IsShown()` bei Reitern: unsichtbare Neuaufbauten (Ruckler bei jedem Kill)
- **Symptom:** Nach dem ersten Öffnen der Codex-Datenbank ruckelte das Spiel bei jedem besiegten Gegner und jedem Looten (250–370 ms je Ereignis), auch bei geschlossenem Freewood-Fenster. Log: `FW:CODEX_CHANGED [Freewood-Codex/CodexUI.lua:3658] 282 ms`, Speicher stieg um 80 MB in 10 Minuten. · After opening the Codex once, every kill and loot stuttered, even with the window closed.
- **Ursache · Cause:** Der Handler fragte `f:IsShown()`. Das ist nur der eigene Schalter des Reiters und bleibt nach dem ersten Öffnen wahr, wenn das Elternfenster geschlossen wird. `IsVisible()` prüft auch die Eltern. · `IsShown()` is the frame's own flag and stays true when the parent window closes; `IsVisible()` also checks the parents.
- **Lösung · Fix:** In Ereignis-Handlern von Reitern `IsVisible()` nutzen; beim Öffnen frisch aufbauen (`onShow`); Änderungen bei sichtbarem Fenster bündeln (höchstens ein Neuaufbau je Sekunde). Codex 0.50.2, Brett 0.7.4, Creator 0.15.2. Eigene Fenster mit `UIParent` als Eltern sind nicht betroffen.
- **Für die IDE:** In der Simulation `IsShown` und `IsVisible` getrennt halten (Kind mit gezeigtem Schalter, aber verstecktem Elternfenster: `IsShown` wahr, `IsVisible` falsch). Prüfregel: `FW:On`/`RegisterEvent`-Handler, die bei `IsShown()` teure Arbeit machen, als Hinweis melden.
- **Status:** *ungeprüft · unchecked* (Ursache aus dem Log und dem Code belegt, Behebung im Spiel noch nicht gesehen).

### F-15 Namensprüfung ohne Leerzeichen
- **Symptom:** „Grindma Silberrücken“ (Name mit Leerzeichen) wurde in der Mailingliste als ungültig abgelehnt; nur „GrindmaSilberrücken“ ging.
- **Ursache:** Das Muster `[^%w\128-\255%-]` enthielt kein Leerzeichen.
- **Lösung:** Leerzeichen erlauben (`[^%w\128-\255%- ]`).
- **Für die IDE:** Testfälle für Namen mit Leerzeichen, Umlauten, Bindestrich und Apostroph in jeder Eingabeprüfung.
- **Status:** *bestätigt*, behoben in Freewood-Mail 0.1.8.

## Erfolge, die im Spiel bestätigt sind · Confirmed successes
**DE:** Was auf Forever nachweislich funktioniert (Gegenstück zu den Fehlern; die Simulation soll es genauso tun).
- Unsichtbarer Datenweg per Flüstern: `C_ChatInfo.SendAddonMessage(Präfix, Text, "WHISPER", "Vor Nachname")` kommt an, auch zwischen zwei verschiedenen Spielern (7. 11. 2026), nicht im Chat.
- Burst von 100 Nachrichten zu 240 Zeichen ohne Drosselung (an sich selbst). Daraus folgt der Plan: etwa 4 Nachrichten je Sekunde, Quittung je Paket.
- Sicheres Gegenmittel gegen die Offline-Systemzeile: Chatfilter auf `CHAT_MSG_SYSTEM` (F-23).
- `Share.Scan`-Datensätze lassen sich mit `C_EncodingUtil` (CBOR, Kompression, Base64) in ein Paket packen; ist es zu groß, liefert `Encode` nil und der Sender halbiert die Paketgröße.
- Zauber-Scan des Codex (Katalog-Art `s`, 0.46.1) lief im Spiel durch; Dungeons ohne Bossdaten zeigen eine Meldung „wartet auf Daten“.
- Simulationstests mit nachgebauter Schnittstelle (`texlua`) finden Ablauf-Fehler vor dem Spieltest (F-26).

**EN:** What demonstrably works on Forever (counterpart to the failures; the simulation should do the same).
- Invisible data path by whisper: `C_ChatInfo.SendAddonMessage(prefix, text, "WHISPER", "First Last")` arrives, also between two different players (7 Nov 2026), not shown in chat.
- Burst of 100 messages of 240 characters without throttling (to self). Plan: about 4 messages per second, ack per packet.
- Reliable counter to the offline system line: chat filter on `CHAT_MSG_SYSTEM` (F-23).
- `Share.Scan` records pack into one packet with `C_EncodingUtil` (CBOR, compression, base64); if too large `Encode` returns nil and the sender halves the packet size.
- The Codex spell scan (catalog kind `s`, 0.46.1) ran through in game; dungeons without boss data show a "waiting for data" note.
- Simulation tests with a mocked interface (`texlua`) find flow bugs before the in-game test (F-26).

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

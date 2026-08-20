# Umbau: mc-ranked wird eigenständig

Beschlossen am **20.08.2026**. Dieses Dokument ersetzt die Architektur, die in
`UMZUG.md` und im README beschrieben ist — beide werden am Ende angeglichen.

---

## Was schiefgelaufen war

Am 18.08. wurde entschieden, mc-ranked solle **keine eigene Rangliste** führen,
sondern die bestehende Punkteliste im Nachbarprojekt `turnier` füttern. Das war ein
Missverständnis, und es hat sich tief eingegraben:

- `turnier-client.ts` holt die Spielerliste per `GET /api/state` von turnier
- Freigegebene Runden gehen per `POST /api/action` dorthin
- Die Wertung rechnet `turnier/listen.js`
- `UMZUG.md` Schritt 3 richtet turnier als eigenen Dienst auf dem Live-Server ein
- `deploy.sh:28` verwaltet beide Dienste

**mc-ranked war nie als Anbau gedacht.** Man meldet sich mit Steam an, schickt seine
Punkte über den Client ein, daraus entsteht der Rang. Ein eigenständiges Programm auf
einem eigenen Server. `turnier` ist OBS-Zeug für den Stream und hat damit nichts zu
tun — es hätte nie auf den Live-Server kommen dürfen.

**Nichts geht verloren.** Geprüft am 20.08.:

| | |
|---|---|
| `turnier/data/listen.json` | Liste „Meccha 2026" vorhanden, **0 Einträge** |
| `turnier/data/spieler.json` | Kartei **leer** (`{"version":1,"players":[]}`) |
| `mc-ranked/daten/konten.json` | 1 Konto (Baloou) |

Es ist nie eine Punktzahl durch die Kopplung geflossen. Kein Datenumzug nötig.

Und mc-ranked ist bereits ein **eigenes Repo** (`Marco-Jan/meccha-rankedsystem`) — es
lag nur im Ordner `turnier/`, versioniert war es nie ein Teil davon.

---

## Die Regeln, wie sie gelten sollen

Diese Liste ist die Vorlage für `/regeln` auf der Website.

### Wann zählt eine Runde?

| Regel | Grund |
|---|---|
| Mindestens **6 Zeilen** im Scoreboard | Eine Lobby zu zweit ist beliebig oft gewinnbar. Fängt nebenbei unlesbare Bilder ab — siehe Messung unten |
| Nur **Rang 1 – 15** wird gewertet | Darunter sind kaum Punkte zu holen, und die Zeilen sind am unzuverlässigsten zu lesen |
| Anmeldung mit **Steam** und eingetragenem **Ingame-Namen** | Nur wer angemeldet ist, kann zugeordnet werden |
| **F9 am Rundenende**, mit ruhigem Hintergrund | Der Leser bricht auf buntem Untergrund ein |

Das Scoreboard zeigt nur die **Verstecker**, nicht die Jäger. Eine Lobby hat bis zu 24
Leute, die Zahl der Jäger schwankt (2 bis 8) — im Scoreboard landen dadurch etwa 6 bis
20 Zeilen. Wer als Jäger spielt, drückt einfach kein F9.

### Wie entsteht der Rang?

- Gewertet wird der **Schnitt der letzten 10 Runden**
- Erst ab **10 Runden** steht man in der Wertung, davor als **Anwärter**
- Gezählt werden die **Punkte aus dem Spiel**, nicht die Platzierung

Bei gleichem Schnitt steht vorne, wer mehr Einträge hat — er hat es öfter gezeigt.

**Auf dem Sprung.** Wer noch Anwärter ist, steht ganz unten — hinter allen Gewerteten,
auch wenn er besser spielt als sie alle. Für die Wertung ist das richtig (verglichen
wird nur über zehn Runden), für die Motivation genau verkehrt. Deshalb stehen Anwärter,
deren Schnitt für die **ersten drei** reichen würde, zusätzlich in einem eigenen Block
ganz oben — **ab 5 Einträgen**. Darunter sagt ein Schnitt nichts: ein Glückstreffer
würde jemanden nach oben spülen und beim nächsten Eintrag wieder hinunter.

Sie bleiben dabei auch in der Anwärterliste stehen. Wer sie herausrechnete, risse ein
Loch, das niemand erklären könnte.

### Abstand zwischen zwei Einreichungen

| | |
|---|---|
| Runde angenommen | **3 Minuten** |
| Runde nicht verwertbar | **30 Sekunden** |
| Admin | keine Sperre (zum Testen) |

Die 30 Sekunden sind Absicht: Ein Fehlschlag ist meist kein Betrugsversuch, sondern ein
schlecht erwischter Moment. Wer dafür drei Minuten wartet, verliert seine Runde.

---

## Messung vom 20.08. — worauf die Leser-Regeln beruhen

13 echte Screenshots aus `Desktop/tesbilder/`, gelesen mit **erweitertem Bereich**
(`bereich_y` von `[465, 810]` auf `[465, 995]`):

```
11-58-20    13 Zeilen   13 Punkte sauber      08-37-01    10 Zeilen   10 sauber
10-54-53    12 Zeilen   10 sauber             11-49-06    10 Zeilen   10 sauber
11-06-28    10 Zeilen    7 sauber             10-45-17     7 Zeilen    7 sauber
11-00-51     6 Zeilen    5 sauber             10-12-55     5 Zeilen    4 sauber
12-45-38     2 Zeilen    2 sauber             13-08-06     2 Zeilen    1 sauber
10-01-34     1 Zeile     1 sauber             11-32-29     0 Zeilen    –
```

**Drei Schlüsse daraus:**

1. **Der Bereich war die einzige echte Sperre.** Nur die Unterkante von `810` auf `995`
   gezogen, sonst nichts geändert — schon liest er 13 statt 10 Zeilen, fehlerfrei.
   Große Lobbys konnte er immer, er durfte nur nicht hinsehen.

2. **Der Farbfilter bleibt unverändert.** Weiß, rot, grün — grün ist die Schriftfarbe
   des gewerteten Spielers. Bei brauchbarem Hintergrund liest er praktisch fehlerfrei;
   was einbricht, bricht wegen des Untergrunds ein, nicht wegen der Farbgrenzen. Daran
   zu drehen würde die guten Fälle beschädigen, um die schlechten halb zu retten.

3. **Die 6-Zeilen-Regel trennt die zwei Gruppen fast perfekt.** Die schlechten Bilder
   liefern 0, 1, 2, 5 Zeilen — die guten 6, 7, 10, 12, 13. Was als Anti-Farming-Regel
   gedacht war, ist zugleich die Qualitätsprüfung.

Bestes Ergebnis, zur Erinnerung woran gemessen wird:

```
 1  Nori                 1465     8  Baloou              1060
 2  Zironic              1454     9  DungaD               745
 3  Matilder             1358    10  P4!n.KiIL3R3         254
 4  Hupferli             1346    11  Hoeje                163
 5  aufTwitch/x_Rokky_x  1251    12  Fabiki               102
 6  alaraaaa             1192    13  MiniAngiul            28
 7  Honey                1136
```

---

## Stand

| Etappe | | |
|---|---|---|
| 0 | Ordner raus aus `turnier` | **fertig** |
| 1 | Eigene Rangliste | **fertig**, 33 Tests |
| 2 | Spieler sind die Steam-Konten | **fertig**, 2038 Zeilen gelöscht |
| 3 | Leser-Regeln | **fertig** — Hinweistexte für Client und Regelseite folgen in 7/10 |
| 4 | Cooldown | **fertig**, 6 neue Tests |
| 5 | Bilder klein | offen |
| 6 | Bildergalerie | offen |
| 7 | Öffentliche Seiten | offen |
| 8 | Deploy und Server | offen |
| 9 | Download-Warnung entschärfen | offen, Entscheidung nötig |
| 10 | Update-Hinweis im Client | offen |

Nach Etappe 4 + Client-Umbau: **537 Tests grün, Typecheck sauber.**

## Etappen

### 0 · Ordner raus aus `turnier`

```
E:/myprojects/twitch/scripte/turnier/mc-ranked   →   E:/myprojects/twitch/scripte/mc-ranked
```

Eigenes Repo, also ein reines Verschieben. `.venv` prüfen — Python-Umgebungen tragen
absolute Pfade; hält sie nicht, wird sie neu angelegt (`rapidocr-onnxruntime pillow`,
**kein** `pip install --upgrade pip`, das hat die Umgebung schon einmal zerlegt).

**Probe:** `npm test` läuft durch wie vorher.

### 1 · Die eigene Rangliste

Neu `src/rangliste.ts`, Speicher `daten/rangliste.json`. Die Wertungsrechnung wird aus
`turnier/listen.js:168` `tabelle()` übernommen: Schnitt der letzten 10, ab 10 Einträgen
in der Wertung, darunter Anwärter, bei Gleichstand entscheidet die Anzahl.

Tests zuerst. Ist die Rechnung falsch, merkt es niemand, bis eine Saison gelaufen ist.

### 2 · Spieler sind die Steam-Konten

`namen.ts` gleicht künftig gegen `konten.ts` ab statt gegen turniers Kartei. Die drei
Stufen (exakt → normalisiert → Levenshtein) bleiben, nur die Quelle wechselt.

Die Nähte im Server sind schon da: `server.ts:199` `holeZustand` und `:229` `eintragen`
sind Parameter, keine festen Aufrufe. Dort wird die lokale Rangliste eingehängt.

**Gelöscht:**

| Datei | Zeilen | warum |
|---|---|---|
| `src/turnier-client.ts` | 309 | keine Anbindung mehr |
| `src/spiegel.ts` | 228 | Kartei-Spiegel für „turnier ist weg" |
| `src/nachtrag.ts` | 222 | Warteschlange für „turnier ist weg" |
| `src/cli/verknuepfen.ts` | 82 | jeder trägt seinen Namen selbst ein |
| `src/cli/testserver.ts` | — | Wegwerf-Kopie von turnier |
| `test/{turnier-client,spiegel,nachtrag,ohne-turnier}.test.ts` | ~1100 | dazugehörig |

Aus `config.ts` fallen `TURNIER_URL`, `TURNIER_KEY`, `TURNIER_TIMEOUT_MS`, `SPIEL_NAME`.

`spiegel` und `nachtrag` existieren **nur**, weil turnier über Netz erreichbar sein
musste. Bei einer lokalen Datei gibt es kein „nicht erreichbar".

### 3 · Die Leser-Regeln

| | |
|---|---|
| `bereich_y` → `[465, 995]` | getestet, 10 → 13 Zeilen |
| `MAX_ZEILEN` 12 → **24** | Lobby bis 24, Bremse mit Luft |
| Mindestens 6 Zeilen | sonst nicht gewertet, mit sichtbarem Grund |
| Nur Rang 1–15 werten | 16+ wird gelesen und verworfen, kein Fehler |
| Hinweistexte | Client, Regelseite, Absagetext |

`MAX_WIEDERHOLUNG = 3` bleibt — das ist die schärfere Bremse und die, die den
Halluzinations-Vorfall damals gefangen hätte.

Die Absage soll konkret sein statt allgemein:

> *„Nur 3 von mindestens 6 Zeilen lesbar — bitte am Rundenende drücken und dabei auf
> einen ruhigen Hintergrund schauen (Himmel oder Wand statt buntem Boden)."*

### 4 · Cooldown

`tokens.ts:288` prüft und stempelt heute in einem Zug — für zwei verschiedene Abstände
geht das nicht, weil zum Prüfzeitpunkt noch niemand weiß, ob es klappt.

Das Stempeln ans Ende zu schieben reißt aber ein Loch auf: OCR dauert ~3 Sekunden, und
in dieser Zeit steht kein Stempel. Wer zehn Uploads gleichzeitig abschickt, kommt mit
allen zehn durch. Deshalb **zweistufig**:

1. beim Annehmen sofort **30 s** stempeln — das Fenster ist nie offen
2. bei Erfolg auf **3 min** hochsetzen

Die Ausnahme hängt jetzt an der Kontorolle `admin`, nicht mehr an `vertraut` am Token.
Damit gilt sie unabhängig von Rechner und Token — aber auch: **vertraute Zugänge werden
seither mitgebremst.** `vertraut` sagt etwas über den Rechner, nicht über die Person.
Deine eigene Wache (`WACHE.bat`) ist davon nicht betroffen, die läuft über die
Kommandozeile und geht gar nicht durch die Token-Prüfung.

Ein Detail beim Wiederholen desselben Bildes: dann bleibt es beim **kurzen** Abstand.
Wer versehentlich zweimal drückt, hat nichts Neues eingereicht und soll dafür nicht drei
Minuten büßen.

### 5 · Bilder klein

Nicht verkleinern — **ausschneiden**. Das README warnt zu Recht vor dem Skalieren
(`2 614` wird zu `2 514`). Der Ranglisten-Block steht fest bei `y 465–995`, `x 55–400`:

| | Größe | Frist |
|---|---|---|
| **Ausschnitt** (JPEG, volle Auflösung) | ~35 KB | **dauerhaft** |
| Original (ganzer Bildschirm, PNG) | ~2 MB | **3 Tage** |
| Original bei geflaggter Runde | ~2 MB | 30 Tage |

Rechnung: 8 000 Ausschnitte im Jahr = **280 MB**. Als Original wären es 16 GB — auf
einer 24-GB-Platte, auf der schon drei andere Seiten und Docker liegen.

Nebeneffekt: Der Rest des Bildschirms fällt weg. Auf einem Vollbild sieht man sonst auch
mal Discord-Nachrichten oder offene Browsertabs von fremden Leuten.

Pillow ist ohnehin in der Python-Umgebung, und das Bild wird beim OCR sowieso geöffnet —
der Ausschnitt fällt im selben Durchgang mit ab.

### 6 · Bildergalerie im Dashboard

Neuer Reiter, Kachelraster, Filter nach Status und Spieler, Vollbild mit Durchblättern.
**Alle** Runden (freigegeben, abgelehnt, offen, geflaggt), sichtbar für **Admin und Mods**.

Der eigentliche Nutzen ist das Nebeneinanderlegen: Kommt eine Punktzahl komisch vor,
filtert man auf den Spieler und sieht seine letzten zehn Ausschnitte als Reihe.
Fälschungen fallen im Vergleich auf, nicht im Einzelbild.

### 7 · Öffentliche Seiten

`meccha-ranked.com/` → die Rangliste. `/regeln` → die Regelseite von oben.

Bisher hat mc-ranked nur Freigabeseite und Kontoseite; das Leaderboard lag in
`turnier/public/ranking.html` und fällt damit weg.

### 8 · Deploy und Server

`deploy.sh:28` verwaltet heute beide Dienste. `meccha-turnier` fliegt raus, ebenso die
turnier-Teile aus `UMZUG.md` und `MECCHA-START.bat`.

Danach wird der Dienst auf dem Live-Server gestoppt und entfernt. **Das wird einzeln
abgefragt, bevor es angefasst wird.**

---

### 9 · Die Download-Warnung entschärfen

Chrome meldet „gefährliche Datei", Windows meldet beim Start „Der Computer wurde durch
Windows geschützt". Das sind **zwei verschiedene Warnungen zu verschiedenen
Zeitpunkten** — Browser beim Herunterladen, SmartScreen beim Ausführen —, und sie haben
verschiedene Ursachen. Wer nur eine löst, sieht die andere weiterhin.

Beide entstehen nicht daran, dass etwas an der Datei faul wäre, sondern daran, dass sie
**unbekannt** ist: keine Signatur, kein Ruf, wenige Downloads.

**Entschieden am 20.08.2026: der kostenlose Weg.** Eine Seite `/download`, die die
Warnung zeigt statt sie zu verschweigen, dazu SHA-256 und ein VirusTotal-Link zum
Selbstprüfen, und die Datei wird bei Microsoft zur Analyse gemeldet (WDSI). Das
beseitigt die Warnung nicht — es macht sie begreiflich, und genau das ist der
Unterschied zwischen „komisch, lieber nicht" und „ah, verstanden".

**Der Grund ist eine harte Randbedingung des Projekts: es darf nichts kosten.** Server
und Domain sind schon genug. Das gilt nicht nur hier, sondern für jeden weiteren
Vorschlag — laufende Gebühren scheiden aus, auch wenn sie technisch der bessere Weg
wären.

Ein Zertifikat bleibt damit theoretisch. Falls sich je zeigt, dass Leute reihenweise am
Download scheitern, ändert es am Client ohnehin nichts: die `.exe` würde beim Bauen
zusätzlich signiert, sonst bliebe alles.

Bewertete Wege:

| Weg | Kosten | löst | löst nicht |
|---|---|---|---|
| **EV-Code-Signing-Zertifikat** | 400–800 €/Jahr, Hardware-Token | beide, sofort | — |
| OV-Zertifikat | 200–400 €/Jahr | Browser; SmartScreen erst nach Ruf | die ersten Wochen |
| Google Drive | 0 € | nichts | beide, plus neue Probleme |
| **Erklärseite + Prüfsumme + VirusTotal** | 0 € | nichts, macht es aber begreiflich | die Warnung selbst |
| Meldung bei Microsoft (WDSI) | 0 € | SmartScreen, nach Tagen, je Bauversion neu | Browser |

**Google Drive ist der schlechteste Weg** und war deshalb einen eigenen Absatz wert:
Drive zeigt für ausführbare Dateien eine **eigene** Warnung, die Freigabe-Links laufen
in ein Download-Kontingent (bei vielen Zuschauern: „Downloadkontingent
überschritten"), und es widerspricht der bestehenden Entscheidung, dass es genau eine
Bezugsquelle gibt — die Adresse steckt fest in der `.exe`, damit niemand woandershin
lädt. Ein zweiter Ort ist genau das, was dabei vermieden werden sollte.

### 10 · Update-Hinweis im Client

**Ist zur Hälfte schon da:** Der Server meldet `neuesteVersion` über `/api/wer`
(`server.ts:287`), der Client vergleicht sie mit `Info.Version` (`Kern.cs:32`) und zeigt
bei Abweichung eine Zeile in der Kopfzeile (`Fenster.cs:1044`).

Was fehlt: Die Zeile steht klein oben und verweist auf „Zugang holen" — nicht auf den
Download. Wer sie überliest, sendet weiter mit einer alten Fassung, und nach einem
Serverumzug ins Leere.

Zu bauen: ein auffälliger Hinweis beim Start statt einer Zeile nebenbei, mit direktem
Weg zum Download.

---

## Reihenfolge

`0 → 1 → 2` hängen aneinander und sind der Kern — **erledigt**. `3, 4, 5, 6, 7, 10` sind
danach unabhängig. `9` braucht zuerst eine Entscheidung. `8` zum Schluss, wenn lokal
alles läuft.

## Offen für später

- Streamer.bot-Anbindung (stand schon vorher offen)
- Discord-Rückfragen (stand schon vorher offen)

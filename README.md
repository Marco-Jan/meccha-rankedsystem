# MC-Ranked — OCR-Feeder für die Meccha-Punkteliste

Liest die Rangliste von **MECCHA CHAMELEON** (die laufende Einblendung im Spiel, es
gibt keinen Results-Screen am Rundenende) und trägt die Punkte in die
**bestehende** Punkteliste im Turnier-Projekt ein (`scripte/turnier`, Admin → Tab 3).

Dieses Projekt hat **keine eigene Rangliste und keine eigene Datenbank**. Wertung
(Schnitt der letzten 10), Wertung/Anwärter-Trennung, Kartei und Overlay macht
`turnier` bereits — hier kommt nur die Automatik davor.

```
Streamer drückt F9                  Zuschauer drückt F9 im Client
(WACHE.bat, eigener PC)             (Meccha-Ranked.exe, fremder PC)
        │                                       │
        │                            POST /api/runde  ·  Token
        │                                       │
        └───────────────────┬───────────────────┘
                            ▼
              OCR  →  Namensabgleich  →  Prüfung
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
      Freigabe / Rückfrage            eintragen
   (Dashboard des Streamers)              │
             └──────────────┬─────────────┘
                            ▼
             POST /api/action  ·  liste.entry.add
                            │
                            ▼
                  turnier (existiert schon)
```

## Stand

| Teil | Zustand |
|---|---|
| Namensabgleich inkl. Aliase | **fertig**, 28 Tests |
| Punkte-Parsing inkl. OCR-Verwechslungen | **fertig**, 20 Tests |
| Entscheidung eintragen / Rückfrage | **fertig**, 14 Tests |
| Anbindung an den Turnier-Server | **fertig**, 11 Tests, end-to-end geprüft |
| Prüfung der Leser-Antwort (beide Leser) | **fertig**, 49 Tests |
| Leser ohne KI (RapidOCR, CPU) | **fertig**, 10/10 am echten Screenshot |
| Vision-Modell über Ollama (Ausweichlösung) | **fertig**, 10/10 am echten Screenshot |
| Geometrie ausgemessen (1920×1080) | **fertig** |
| Verknüpfen von Ingame-Namen (`verknuepfen`) | **fertig**, end-to-end geprüft |
| Probelauf ohne Screenshot (`probelauf`) | **fertig** |
| Upload-Server für Zuschauer (`serve`) | **fertig**, 42 Tests |
| Freigabe: Warteschlange, Doppel-Einreichung, Aufbewahrung | **fertig**, 43 Tests |
| Zugangs-Token (`token`) | **fertig**, 25 Tests |
| Selbstanmeldung über Steam (`/konto`) | **fertig**, 107 Tests, end-to-end angemeldet |
| Zuschauer-Client (C#, ~24 KB, ohne Installation) | **fertig** |
| Eigenständig ohne Turnier-Server | **fertig**, 44 Tests |
| Betrugsprüfung: dieselbe Punktzahl wieder | **fertig**, 32 Tests |
| Streamer.bot-Anbindung | **offen** |
| Discord-Rückfragen | **offen** |

**Gelesen wird ohne KI und ohne Grafikkarte** — RapidOCR über Python, siehe
[python/README.md](python/README.md). Am echten Screenshot gemessen, beide Leser:

| | RapidOCR | Vision-Modell |
|---|---|---|
| Punktzahlen richtig | **10 von 10** | 10 von 10 |
| Zeit | **3,1 s** | 94 s |
| Grafikkarte | **keine** | 12 GB VRAM |

Möglich wird das durch drei Eigenschaften des Spiels: die Schrift ist immer **weiß oder
rot** (Farbfilter statt Helligkeitsschwelle), die **Spalten stehen fest** (Namen und
Punkte werden als getrennte Streifen gelesen), die **Zeilen stehen fest** (Zuordnung über
die Y-Koordinate). Details und Messwerte in `python/README.md`.

Das Vision-Modell bleibt als Ausweichlösung: `set MC_LESER=ollama`. Es braucht keine
Geometrie und hilft, falls das Spiel sein Layout ändert.

`src/leser.ts` prüft die Antwort streng — und zwar bei **beiden** Lesern gleich. Was die
Prüfung nicht besteht, wird Rückfrage, nie Punktzahl.

### Am echten Screenshot gemessen

`qwen2.5vl:7b`, 2,9 Sekunden, 9 von 9 Zeilen gelesen — inklusive `Albert Wesker's Balls`
und der Leerzeichen-Trenner in `11 714`:

```
npm run lies -- C:/Users/Baloou/Pictures/heseder.JPG
```

Durch die Entscheidungslogik geschickt (alle Namen verknüpft angenommen):

| | |
|---|---|
| **7 eingetragen** | Skylit 11714 · Hioriy 9775 · Baloou 2614 · David 672 · Albert Wesker's Balls 587 · Faust 168 · HmmMeryam 99 |
| **2 Rückfragen** | `kobikeinnobi` kam zweimal vor — eine der beiden ist falsch gelesen |

Zwei Dinge, die dabei gut liefen: das Modell las `Mioriy`, die Kartei kennt `Hioriy` —
der Fuzzy-Abgleich hat das aufgelöst. Und der Doppel-Schutz hat `kobikeinnobi` gefangen,
statt jemandem eine fremde Punktzahl in den Schnitt zu schreiben.

## Einrichten

```
npm install
copy START.bat.beispiel START.bat
```

Dann `START.bat` aufmachen und `TURNIER_URL` sowie `MC_SPIEL` anpassen.

> **`START.bat` ist in der `.gitignore`.** Dort stehen Zugangsdaten. Im Turnier-Projekt
> ist genau das schiefgegangen — der Discord-Token steht dort im Klartext in einer
> Datei, die nicht ignoriert wird.

## So benutzt du es im Stream

Doppelklick auf **`WACHE-PROBE.bat`** (trägt nichts ein) oder **`WACHE.bat`** (trägt ein).
Einmal starten, den ganzen Stream liegen lassen.

Dann im Spiel: Rangliste einblenden, **`F9` drücken**. Das funktioniert, während das
Spiel im Vordergrund ist — du musst nicht Alt-Tab machen.

```
  >>> Taste F9 druecken, wenn die Rangliste zu sehen ist.

  ------------------------------------------- #1  22:14:03
  Gelesen  : 9 Zeilen in 5.2 s

  EINTRAGEN (7)
    Skylit                     11714   -> Skylit [exakt]
    ...

  RUECKFRAGE (2)
    kobikeinnobi                 327   -> Mehrere Zeilen zeigen auf kobikeinnobi
```

Taste und Bildschirm stellst du oben in der `.bat` ein. Möglich sind `F1`–`F12`,
`DRUCK`, `ENDE`, `POS1`, `EINFG` und `NUM0`–`NUM9`.

**Drückst du während eines laufenden Durchlaufs nochmal, wird es ignoriert** — sonst
landete dieselbe Runde mehrfach in der Liste.

Der Hotkey nutzt `GetAsyncKeyState`, nicht `RegisterHotKey`: die Taste wird nur
*beobachtet*, nicht belegt. Das Spiel bekommt sie weiterhin.

## Zuschauer machen mit

Der Weg über `WACHE.bat` setzt voraus, dass du selbst mitspielst. Damit auch andere aus
der Lobby ihre Runde einreichen können, gibt es einen kleinen Server und einen Client.

**Bei dir:** Doppelklick auf **`MECCHA-START.bat`**. Der startet den Turnier-Server (wenn
gewünscht) und den mc-ranked-Server und öffnet dein Freigabe-Dashboard. Alles, was
eingestellt wird, steht in **`EINSTELLUNGEN.bat`** — Turnier-Adresse, Port, Passwort für
das Dashboard, und ob gegen die Testkopie oder die echten Daten gearbeitet wird. Im Code
steht davon nichts fest verdrahtet.

> Ohne `MC_ADMIN_KEY` ist das Dashboard **gesperrt**, nicht offen. Wer die Einrichtung
> vergisst, hat keine Freigabeseite — lieber das als eine, die jeder bedienen kann.

**Beim Zuschauer:** eine einzige Datei, `Meccha-Ranked.exe` aus `client-cs/` — rund 24 KB,
keine Installation, gebaut gegen das .NET Framework 4, das auf jedem Windows liegt. Die
Serveradresse ist beim Bauen schon eingetragen (`config/verteilung.json`, dann
`client-cs/BAUEN.bat`), einzufügen ist nur noch der Token.

Zwei Dinge sind im Client bewusst festgezurrt:

**Die Serveradresse steht fest in der .exe** und wird weder angezeigt noch aus
`client.json` gelesen. Niemand soll seine Runden versehentlich — oder absichtlich —
woandershin schicken. Ein Serverumzug ist damit eine neue .exe, keine Bitte an alle,
eine Zeile in einer Datei zu ändern.

**Der Token lässt sich nicht nebenbei löschen.** Ist einer eingetragen, zeigt das Feld
nur `WAA5••••••••FOCc`, ist gesperrt und grau. Ändern geht über einen eigenen Knopf mit
Rückfrage, bei der „Nein" vorbelegt ist. Sonst wirft jemand seinen Zugang weg, während er
eigentlich nur die Taste umstellen wollte — und braucht dann einen neuen vom Streamer.

Dafür zeigt der Client jetzt, **wer man ist**. Beim Start fragt er `GET /api/wer` und
schreibt die Antwort in die Kopfzeile:

```
Bereit  –  F9 drücken
Im Spiel: Baloou   ·   Bildschirm 2 (1920×1080)
```

Das war eine echte Lücke: im Spiel ist die eigene Zeile in der Rangliste nicht
hervorgehoben, und der Client kannte nur seinen Token. Wer sich vertippt hatte, merkte es
erst daran, dass nie etwas ankam. Ein gesperrter Zugang steht dort ebenfalls, in Rot.
Die Auskunft benutzt `tokens.finde()` statt `pruefen()` — sie darf weder als Nutzung
gelten noch den Mindestabstand verbrauchen.

**Der Zuschauer erfährt, was aus seiner Runde wurde.** Vorher endete es für ihn bei
„zur Freigabe eingereicht" — wurde abgelehnt, hat er es nie erfahren und dasselbe nochmal
geschickt. Der Client fragt jetzt im Minutentakt `GET /api/meine` ab und meldet neue
Entscheidungen:

```
21:47   !    Abgelehnt: Bild wirkt bearbeitet              1 060
21:31   OK   Freigegeben – zählt jetzt                     2 771
```

Eine Ablehnung kommt zusätzlich als Sprechblase neben der Uhr, damit sie auch bei
geschlossenem Fenster auffällt. Den Zeitpunkt der zuletzt gemeldeten Entscheidung merkt
sich der Client in `mc-ranked-daten/gesehen.txt` — sonst poppt nach jedem Neustart alles
erneut auf. Dieselbe Liste steht auch auf der Kontoseite unter „Deine letzten Runden",
für alle, die den Client gerade nicht offen haben.

Zugeordnet wird über den **Ingame-Namen**, nicht über den Token: wer sich einen neuen
Zugang holt, behält seine Rückmeldungen.

Weil der Grund jetzt beim Zuschauer landet, gibt das Dashboard beim Ablehnen eine
**Auswahl** vor („Bild wirkt bearbeitet", „Zahlen nicht sicher lesbar", „Falsche Runde
oder falscher Ausschnitt", „Diese Partie zählt schon", „Punktzahl passt nicht zum
Spielverlauf") plus „Anderer Grund …". Einheitlich formuliert, weniger zu tippen — und
über dem Feld steht, dass der Zuschauer es zu lesen bekommt.

**Beenden geht jetzt im Fenster.** Das X legt das Programm weiterhin absichtlich nur
neben die Uhr, damit die Tastenüberwachung weiterläuft, wenn jemand aus Gewohnheit
zuklickt. Der einzige Weg zurück war der Rechtsklick auf das Symbol — den findet niemand
von selbst.

Den holt sich jeder selbst auf **`/konto`**:

1. **Mit Steam anmelden.** Meccha läuft über Steam, jeder hat also ein Konto — und Steams
   OpenID braucht weder Registrierung noch Schlüssel. Kein Passwort, keine Mailadresse,
   kein Bestätigungsversand. Wir sehen die Steam-Kennung und den Anzeigenamen, mehr gibt
   Steam gar nicht her.
2. **Ingame-Namen eintragen** — genau so, wie er in der Rangliste steht. Er entscheidet,
   welche Zeile aus dem Screenshot gewertet wird.
3. **Token kopieren** und im Client einfügen. Fertig.

Drei Regeln hängen am Ingame-Namen, und alle drei haben denselben Grund — sonst könnte
sich jemand die Zeile des Erstplatzierten gutschreiben lassen:

- **Eindeutig über alle Konten.** Wer zuerst da ist, dem gehört der Name.
- **Nur alle 30 Tage änderbar** (`MC_NAMENSSPERRE_TAGE`), damit niemand je nach
  Punktestand wechselt. Du selbst bist an die Frist nicht gebunden.
- **Jede Änderung durch den Nutzer setzt den Zugang zurück auf „braucht Freigabe".** Beim
  nächsten Upload siehst du Bild und beanspruchte Zeile nebeneinander.

Neue Zugänge brauchen ohnehin erst deine Freigabe. Wem du traust, den stellst du im
Dashboard auf „zählt sofort". Hochgeladene Bilder werden nach 24 Stunden gelöscht
(`MC_BILD_STUNDEN`), der Eintrag in der Freigabeliste bleibt — man soll später noch
nachsehen können, was eingereicht wurde.

> **Steam leitet nach der Anmeldung dorthin zurück, wo der Server sich selbst verortet.**
> Lokal reicht `http://localhost:8790` (Steam akzeptiert das). Läuft der Server irgendwann
> öffentlich, ist `MC_OEFFENTLICHE_URL` die einzige Zeile, die sich ändert.

## Auflösung: niemals verkleinern

Gemessen am echten Screenshot:

| Skalierung | Baloou | Albert Wesker's Balls |
|---|---|---|
| **100 %** | `2 614` ✓ | `587` ✓ |
| 60 % | `2 514` ✗ | `567` ✗ |
| 45 % | `2 564` ✗ | `587` ✓ |

Die Zahlen kippen leise. `2 514` statt `2 614` sieht plausibel aus und rutscht durch
jede Prüfung — falscher Wert, richtiger Name, keine Auffälligkeit. Ein volles
1920×1080-Bild braucht ohnehin nur 3–6 Sekunden.

`--ausschnitt x,y,breite,hoehe` gibt es weiterhin, ist aber **optional**: es beschneidet
ohne zu skalieren und reduziert vor allem fremden Text im Bild.

## Wenn keine Rangliste im Bild ist

Beim Testen hat das Modell auf einem Bildschirm ohne Rangliste eine **erfunden** —
Resident-Evil-Figuren, dann elfmal dieselbe Zeile. Nichts wurde eingetragen, aber nur
weil die Namen zufällig nicht in der Kartei standen.

Deshalb gilt jetzt strukturell: mehr als **12 Zeilen** oder dieselbe Zeile **dreimal** →
die ganze Antwort wird verworfen. Zusätzlich weiß das Modell, dass eine leere Liste eine
richtige Antwort ist. Gegenprobe: 0 Zeilen statt Fantasie.

## Probelauf ohne Screenshot

Damit kannst du die ganze Kette prüfen, bevor OCR existiert. Du gibst die zwei
Spalten als Text vor:

```
npm run probelauf -- --namen "NorikoTv,Polosios,theRealBaloou!" --punkte "12.160,10 579,717"
```

```
  EINTRAGEN (3)
     1. NorikoTv              12160   -> NorikoTv [exakt]
     2. Polosios              10579   -> Polosios [exakt]
     3. theRealBaloou!          717   -> theRealBaloou [normalisiert]

  RUECKFRAGE (0)
    (nichts)

  Nichts geschrieben (Probelauf). Mit --eintragen wird es echt.
```

**Ohne `--eintragen` wird nichts geschrieben.** Mit `--eintragen` landen die Punkte
wirklich in der Liste — dafür vorher `TURNIER_URL` auf einen Testserver setzen.

### Zum Testen einen eigenen Turnier-Server starten

Nie gegen 8777 testen, da liegen echte Turnierdaten. Stattdessen:

```
cd ..\turnier
set PORT=8778
node server.js
```

und in `START.bat` dann `set TURNIER_URL=http://localhost:8778`.

## Ingame-Namen verknüpfen — das musst du einmal machen

Deine Kartei führt Twitch-Namen, im Spiel stehen andere. Die Überschneidung ist am
Anfang **null**:

| Kartei | im Spiel |
|---|---|
| NorikoTv, Polosios, theRealBaloou | Skylit, Hioriy, Baloou, David, Albert Wesker's Balls, … |

Selbst `Baloou` ≠ `theRealBaloou` — Levenshtein-Distanz 7, viel zu weit. Am ersten Abend
geht deshalb **alles** in die Rückfrage. Das ist richtig so, aber einmalig zu erledigen:

```
npm run verknuepfen                                              # zeigt die Kartei
npm run verknuepfen -- --ingame "Baloou" --person "theRealBaloou"
```

Danach greifen alle drei Abgleich-Stufen auf den Alias:

| Eingabe | Ergebnis |
|---|---|
| `Baloou` | theRealBaloou `[exakt]` |
| `BALOOU` | theRealBaloou `[exakt]` |
| `Baloou!` | theRealBaloou `[normalisiert]` |
| `Ba1oou` | theRealBaloou `[fuzzy]` |

Das braucht **keine neue Datenstruktur**: `turnier/kartei.js:47` sucht schon über
`p.key === key || p.aliases.includes(key)`, und `kartei.merge` schiebt die Schlüssel der
aufgelösten Person in die Aliase. `verknuepfen` nutzt nur diese zwei bestehenden Aktionen.

> **Eine Zeile in `turnier` war dafür nötig.** `tournament.js:770` liefert im
> `kartei`-Feld jetzt zusätzlich `aliases`. Ohne das sieht der Feeder die Aliase nicht und
> weist einen Namen ab, den der Server anschließend problemlos aufgelöst hätte. Die
> Änderung ist additiv — Admin und Overlays lesen nur `id` und `name`.

## Wie der Namensabgleich funktioniert

Das ist das heikelste Stück, deshalb ausführlich.

**Das Problem:** `turnier/kartei.js:51` `ensurePerson()` sucht **exakt** und legt sonst
stillschweigend eine neue Person an. Für Tippen von Hand ist das genau richtig. Für OCR
ist es eine Falle: liest Tesseract `NorikoTv` als `N0rikoTv`, entsteht lautlos ein
Phantom-Spieler, die Punkte landen dort, und Norikos Schnitt ist ab dann aufgeteilt.

**Die Lösung:** Der Feeder ordnet **vor** dem Eintragen zu, in drei Stufen, und schickt
immer den **Kartei-Namen** an den Server — nie den Rohnamen von OCR.

| Stufe | Was passiert | Beispiel | Zuversicht |
|---|---|---|---|
| 1 | `nameKey`-Treffer, wie der Server selbst sucht | `NORIKOTV` → `NorikoTv` | 1.0 |
| 2 | gleich, sobald die Deko weg ist | `theRealBaloou!` → `theRealBaloou` | 0.95 |
| 3 | Levenshtein, nur bei eindeutigem Treffer | `N0rikoTv` → `NorikoTv` | 0.85 / 0.7 |
| — | mehrere gleich nahe Kandidaten | → **Rückfrage** | — |
| — | niemand nah genug | → **Rückfrage** | — |

### Zwei Normalformen, absichtlich

- **`nameKey()`** ist **zeichengleich** zu `turnier/kartei.js:37` — nur trim, lowercase
  und Leerzeichen zusammenziehen. Satzzeichen und Emoji bleiben stehen. Wird sie dort
  geändert, muss sie hier mitgeändert werden, sonst findet Stufe 1 nichts mehr.
- **`hartNormalisiert()`** wirft alles weg außer Buchstaben und Ziffern. Nur für die
  Kandidatensuche, geht nie an den Server. Umlaute und japanische Schrift bleiben
  erhalten — `Müller` darf nicht zu `mller` werden.

### Wie viel Abweichung erlaubt ist

Nach Länge, weil es um den Anteil geht:

| Länge | erlaubte Distanz | warum |
|---|---|---|
| ≤ 4 | **0** | `Tom` und `Tim` liegen 1 auseinander und sind verschiedene Leute |
| 5–8 | 1 | ein verlesenes Zeichen |
| ≥ 9 | 2 | ein `l`/`1` plus ein `O`/`0` — echte Namen liegen so nah praktisch nie |

## Wann eine Zeile zurückgehalten wird

Eingetragen wird nur, wenn **Name und Punktzahl** sicher sind. Ein sicherer Name mit
geratener Zahl ist genauso unbrauchbar wie das Gegenteil — weil die **Punkte** gewertet
werden.

| Fall | Verhalten |
|---|---|
| Punkte nicht lesbar (`Muell!!`) | Rückfrage |
| Punkte nur mit Zeichenersetzung (`1O579`) | Rückfrage, auch bei exaktem Namen |
| führende Null (`0387`) | Rückfrage — bei Punktzahlen ein Lesefehler |
| Name unbekannt | Rückfrage |
| Name mehrdeutig | Rückfrage, mit Nennung der Kandidaten |
| **zwei Zeilen zeigen auf dieselbe Person** | **beide** zur Rückfrage |
| Zeilenzahl der Spalten ungleich | **ganze Runde** zur Rückfrage |

Die letzten zwei sind die unauffälligsten und die wichtigsten:

- In einer Lobby steht jeder genau einmal. Zeigen zwei Zeilen auf dieselbe Person, ist
  eine falsch gelesen — dann bekäme jemand eine fremde Punktzahl in den Schnitt.
- Sind es 9 Namen und 10 Punktzahlen, bekäme ab der Fehlstelle **jeder** Name die Punkte
  seines Nachbarn. Deshalb bricht `parseZeilen()` ab statt teilweise einzutragen.

## Betrugsprüfung: dieselbe Punktzahl schon wieder

Vier Hürden liegen übereinander. Jede fängt etwas, das die anderen durchlassen:

| Hürde | fängt | fängt **nicht** |
|---|---|---|
| Bild-Hash | dieselbe Datei nochmal | neu abgespeichert |
| Bildprüfung (PNG-Blöcke) | in einem Malprogramm bearbeitet | anderes Aufnahmewerkzeug |
| Partie-Kennung | dieselbe Lobby-Runde nochmal — auch von jemand anderem, auch mit anderem Bild | wenn die Mitspieler-Zeilen andere sind |
| **Verdacht** (`verdacht.ts`) | echte Runden, aber die eigene Zeile immer auf denselben Wert gefälscht | den einmaligen Ausrutscher |

Die vierte ist die gegen den Geduldigen. Er spielt echte Runden mit wechselnden
Mitspielern, fälscht aber jedes Mal seine eigene Zeile auf denselben Wert: jede
Partie-Kennung ist dann anders, jedes Bild frisch aufgenommen, jeder Hash neu — und
trotzdem steht dreimal exakt `11 714` in der Liste. Zwei Punktzahlen über 1000 werden
nicht zufällig gleich.

**Ab 1000 Punkten, 30 Tage rückwärts.** Darunter wiederholen sich Werte ehrlich, und mit
Kleinkram kommt in der Wertung ohnehin niemand weit — dort lohnt das Fälschen nicht.
Einstellbar über `MC_VERDACHT_AB` und `MC_VERDACHT_TAGE`.

**Erkannt wird die Person am Ingame-Namen**, nicht am Absender und nicht am Token. Der
Ingame-Name ist über alle Konten eindeutig und entscheidet, welche Zeile gewertet wird —
er ist genau das, was sich nicht mal eben wechseln lässt. Ein neuer Token oder ein
geänderter Anzeigename führen nicht an der Prüfung vorbei.

### Was ein Flag auslöst

**Die Runde wird angehalten — auch bei „zählt sofort".** Das ist der eigentliche Zweck.
Sonst wäre die Prüfung genau dort wirkungslos, wo Fälschen sich lohnt: bei jemandem, dem
du schon vertraust und dessen Bilder niemand mehr ansieht. Ausgenommen sind **vertraute**
Zugänge — das sind deine eigenen Rechner, dort steht niemand Fremdes davor.

**Das Bild bleibt 30 Tage liegen** statt 24 Stunden (`MC_VERDACHT_BILD_STUNDEN`). Ein
Muster fällt oft erst nach Wochen auf, und dann will man die alten Bilder nebeneinander
legen können.

**Der Grund wird mitgeschrieben**, nicht nur angezeigt — in einem Monat soll noch
nachvollziehbar sein, warum diese Runde angehalten wurde. Auf der Freigabekarte steht er
rot:

> ⚑ **Geflaggt – zur Prüfung angehalten**
> - 3. Mal mit exakt 11714 Punkten für Baloou – zuletzt vor 3 Tagen (damals abgelehnt)
> - Von dieser Person wurden schon 2 Runden abgelehnt

Daneben steht auf jeder Karte der **Verlauf der Person** — ihre letzten fünf
Einreichungen mit Punktzahl und Ausgang. Die Frage beim Entscheiden ist ja selten „ist
das Bild echt", sondern „passt diese Zahl zu dem, was der sonst spielt". Dort stehen
auch die abgelehnten und die noch offenen Runden, die in der Punkteliste fehlen.

Abgelehnte Runden zählen bei der Wiederholung **mit**. Wer abgelehnt wurde und es erneut
versucht, ist ja gerade der Fall, um den es geht.

Die frühere Ablehnung allein flaggt **nicht** — sonst hinge jemandem ein einzelner
Fehlgriff dauerhaft an. Sie steht nur dabei, damit sie nicht in der Historie versinkt.

### Und wieder gilt: kein Automat entscheidet

Nichts davon lehnt selbsttätig ab. Ein Flag sorgt dafür, dass die Runde bei **dir** landet
statt durchzulaufen, und dass der Beleg aufgehoben wird. Es gibt harmlose Gründe für eine
Wiederholung, und ein Automat, der ehrliche Leute aussperrt, wäre schlimmer als der
Betrug, den er verhindern soll.

## Wenn der Turnier-Server nicht da ist

mc-ranked braucht `turnier` an zwei Stellen: die **Kartei** zum Zuordnen der Namen und
`liste.entry.add` zum Eintragen. Läuft mc-ranked auf einem Server im Netz und `turnier`
zu Hause, ist ein Ausfall keine Ausnahme, sondern der Normalfall — dein PC ist eben nicht
immer an.

Früher endete dann **jeder** Upload mit einem 502, und die Runde des Zuschauers war weg.
Sie landete nicht einmal in der Warteschlange. Heute passiert das:

```
Upload  →  OCR  →  Kartei aus dem SPIEGEL  →  Freigabe (wie immer)
                                                   │
                                          du gibst frei
                                                   │
                                      turnier da?  ├── ja  →  eingetragen
                                                   └── nein →  NACHTRAG
                                                                  │
                                                       jede Minute erneut
                                                                  │
                                                            eingetragen
```

### Der Kartei-Spiegel

Jeder erfolgreiche Abruf von `/api/state` wird gespiegelt (`daten/kartei-spiegel.json`).
Fällt `turnier` aus, wird mit dem letzten bekannten Stand weitergearbeitet. Drei Regeln,
die zusammengehören:

**Nur bei „nicht erreichbar".** Sagt `turnier` „die Punkteliste gibt es nicht", ist das
kein Ausfall, sondern ein Einrichtungsfehler — falsches `MC_SPIEL`, Liste umbenannt,
falscher Admin-Key. Den mit einem alten Spiegel zu überdecken wäre das Schlimmste, was
passieren könnte: wir würden weiter in eine `gameId` eintragen, die es so nicht mehr gibt.
Solche Fehler bleiben sichtbar.

**Der Spiegel altert, und das ist Absicht.** Ein Spieler, der seit dem letzten Abruf neu
in der Kartei steht, fehlt darin — seine Zeile wird dann zur **Rückfrage** statt zu einem
Phantom-Eintrag. Im Zweifel nachfragen, wie überall in diesem Projekt.

**Ohne je einen Stand gibt es ein ehrliches 502.** Ein Server, der noch nie mit `turnier`
gesprochen hat, kann keinen Namen zuordnen. Dann ist Abweisen richtig.

### Die Nachtrag-Warteschlange

Was beim Eintragen nicht durchkommt, wandert nach `daten/nachtrag.json` und wird jede
Minute erneut versucht (`MC_NACHTRAG_TAKT`). Im Dashboard steht dann eine Kachel mit der
Anzahl — ein Klick darauf versucht es sofort.

**Die Reihenfolge ist der ganze Witz.** `turnier` wertet den Schnitt der letzten zehn
Einträge, eine Vertauschung fällt also in die Wertung durch. Daraus folgen zwei Regeln:

1. Abgearbeitet wird von vorne, und beim **ersten** Fehler wird abgebrochen — sonst käme
   Eintrag 3 vor Eintrag 2 in die Liste.
2. Wartet schon etwas, geht auch ein **frischer** Eintrag hinten hinein, statt direkt
   geschrieben zu werden. Sonst überholt er die Wartenden.

Die freigegebene Runde gilt trotzdem als erledigt. Sonst müsstest du dieselbe Runde
später nochmal freigeben — und alles, was beim ersten Mal durchkam, wäre doppelt drin.

### Was das nicht kann

Bricht die Verbindung genau zwischen „`turnier` hat geschrieben" und „wir haben die
Antwort gesehen", wissen wir es nicht und tragen den Eintrag später ein zweites Mal ein.
Das Fenster ist winzig — `turnier` schreibt im selben Prozess, eine verlorene Antwort
heißt praktisch, dass es mitten im Schreiben gestorben ist — aber es ist nicht null.
Dagegen gibt es kein Mittel, solange `liste.entry.add` keine Kennung des Absenders
mitführt. Deshalb steht jeder Nachtrag mit Name und Punktzahl im Dashboard: taucht ein
Eintrag doppelt auf, siehst du ihn dort und löschst ihn im Turnier-Admin.

### Zeitlimit

`ladeZustand` und `trageEin` warten höchstens 8 Sekunden (`MC_TURNIER_TIMEOUT`). Ohne das
hängt ein Upload minutenlang, wenn `turnier` nicht abweist, sondern gar nicht antwortet —
Leitung weg, Rechner aus, Firewall verschluckt die Pakete. Nach einem Fehlversuch ist
30 Sekunden Ruhe, sonst zahlte jeder einzelne Upload dieses Zeitlimit erneut, obwohl der
Spiegel die Antwort ohnehin schon hat.

## Eine Falle im Turnier-Server, die hier abgefangen wird

`turnier/listen.js:108` `parsePoints()` macht `replace(',', '.')` und dann `Number()`.
Ein Tausendertrennzeichen würde dort zur Dezimalzahl:

| Eingabe | im Server ohne Feeder | mit Feeder |
|---|---|---|
| `10,579` | `10.579` ← zehn Punkte | `10579` |
| `10.579` | `10.579` ← zehn Punkte | `10579` |
| `12 160` | `12160` | `12160` |

Der Feeder entfernt Trennzeichen deshalb **selbst** und schickt nur saubere Ganzzahlen.
Dafür gibt es einen eigenen Test (`test/parse.test.ts`).

## Tests

```
npm test
```

454 Tests, keine Abhängigkeit auf einen laufenden Server — die Integrationstests starten
sich einen eigenen auf einem freien Port (`listen(0)`). Gegen 8777 läuft **nie** ein Test.
Auch Steam wird nie wirklich gefragt: die Rückfrage ist als Parameter herausgezogen und
in den Tests eingesetzt.

```
npm run build     # Typecheck + dist/
```

## Was als Nächstes gebraucht wird

Die Screenshots sind da, die Geometrie ist ausgemessen, der Zuschauer-Weg steht. Offen
sind noch zwei Stücke:

- **Streamer.bot-Anbindung.** Heute drückst du `F9` an der Wache oder ein Zuschauer
  drückt sie im Client. Was fehlt, ist der Weg über Streamer.bot. Der Zwischenspeicher
  für Zeiten ohne Turnier-Server ist inzwischen gebaut, siehe unten.
- **Discord-Rückfragen.** Rückfragen stehen bislang nur auf der Freigabeseite. Sinnvoll
  wäre eine Nachricht in den Discord, damit du nicht nebenher eine Seite im Blick
  behalten musst.

Nicht mehr gebraucht: Crop-Koordinaten von Hand. Die Geometrie ist ausgemessen und steht
relativ zur Referenz 1920×1080 in `python/lies_rangliste.py` — andere Auflösungen rechnet
der Leser selbst um. `--ausschnitt` gibt es weiterhin, ist aber optional.

## Dateien

| Datei | Zweck |
|---|---|
| `src/namen.ts` | Normalisierung, Levenshtein, Zuordnung zur Kartei |
| `src/parse.ts` | OCR-Text → Name + Punkte, Trennzeichen, Verwechslungen |
| `src/runde.ts` | Entscheidung eintragen / Rückfrage pro Zeile |
| `src/turnier-client.ts` | `GET /api/state`, `POST /api/action` |
| `src/config.ts` | Env-Variablen und Crop-Koordinaten |
| `src/leser.ts` | Antwort des Lesers prüfen, bevor sie etwas auslöst |
| `src/leser-wahl.ts` | RapidOCR oder Ollama — entscheidet `MC_LESER` |
| `src/rapidocr.ts` | Leser ohne KI, über Python |
| `src/ollama.ts` | Vision-Modell als Ausweichlösung |
| `src/bildpruefung.ts` | Ist auf dem Bild überhaupt eine Rangliste? |
| `src/durchlauf.ts` | Ein kompletter Durchgang: Bild → Eintrag |
| `src/screenshot.ts`, `src/tasten.ts` | Bildschirmaufnahme und Hotkey der Wache |
| `src/server.ts` | Upload-Server: nimmt Runden entgegen, liefert die Seiten |
| `src/freigabe.ts` | Warteschlange: was eingereicht wurde, was entschieden ist |
| `src/freigabe-api.ts` | Endpunkte der Freigabeseite (Admin-Schlüssel) |
| `src/verdacht.ts` | Betrugsprüfung: dieselbe Punktzahl schon wieder |
| `src/spiegel.ts` | Kartei-Spiegel — arbeiten, während turnier weg ist |
| `src/nachtrag.ts` | Warteschlange für Einträge, die turnier noch nicht bekam |
| `src/tokens.ts` | Upload-Token: wer darf einreichen, für welche Zeile |
| `src/konten.ts` | Konten der Zuschauer, Sitzungen, Namenssperre |
| `src/steam.ts` | Anmeldung über Steam OpenID — ohne Schlüssel, ohne Passwort |
| `src/konto-api.ts` | Endpunkte der Kontoseite (Sitzungs-Cookie) |
| `src/konto-seite.ts` | Die Kontoseite selbst |
| `public/freigabe.html`, `public/freigabe.js` | Freigabe-Dashboard des Streamers |
| `client-cs/` | Zuschauer-Client in C#, ~24 KB, ohne Installation |
| `python/lies_rangliste.py` | RapidOCR-Teil, siehe `python/README.md` |
| `src/cli/probelauf.ts` | Kette ohne Screenshot durchspielen |
| `src/cli/wache.ts` | Auf die Taste warten, Runde auswerten |
| `src/cli/serve.ts` | Server starten (Upload, Freigabe, Konten) |
| `src/cli/verknuepfen.ts` | Ingame-Namen mit der Kartei verknüpfen |
| `src/cli/testserver.ts` | Wegwerf-Kopie des Turnier-Servers zum Testen |

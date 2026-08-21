# Meccha Ranked

*[English version](README.en.md)*

Eine Rangliste für **MECCHA CHAMELEON**-Streams. Zuschauer drücken nach der Runde
`F9`, der Server liest die Punkte aus dem Screenshot und trägt sie ein.

```
Zuschauer drückt F9                  Streamer drückt F9
(Meccha-Ranked.exe)                  (WACHE.bat, eigener PC)
          │                                   │
          │      POST /api/runde · Token      │
          └─────────────────┬─────────────────┘
                            ▼
          OCR  ·  Namensabgleich  ·  Prüfungen
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
  nicht verwertbar    Freigabeliste    direkt gewertet
 nichts gespeichert  du entscheidest          │
   sofort nochmal           │                 │
                            └────────┬────────┘
                                     ▼
                                 Rangliste
```

Das Spiel hat keine Schnittstelle, kein Web-Leaderboard und keinen Export. Die
Punkte existieren nur auf dem Bildschirm — deshalb OCR, und deshalb sieht am Ende
ein Mensch darauf, bevor etwas zählt.

---

## Die Regeln

| | |
|---|---|
| Gewertet wird | der **Schnitt der letzten 10** Runden |
| In der Wertung ab | **10** Runden — davor Anwärter, sichtbar mit Schnitt, ohne Platz |
| Gezählt werden | die **Punkte aus dem Spiel**, nicht die Platzierung |
| Eine Runde zählt ab | **6 Versteckern** im Scoreboard |
| Gewertet werden | **Rang 1–15** |
| Pause danach | **3 Minuten** — oder **30 Sekunden**, wenn die Runde nicht verwertbar war |

Im Scoreboard stehen nur die **Verstecker**, nie die Jäger. Eine Lobby fasst bis zu
24 Leute, die Zahl der Jäger schwankt — im Bild landen dadurch etwa 6 bis 20 Zeilen.

**Auf dem Sprung:** Anwärter, deren Schnitt für die ersten drei reichen würde, stehen
zusätzlich ganz oben — ab 5 Runden. Sonst stünde der Beste der Neuen am Ende einer
Liste, in der er eigentlich vorne wäre.

Alles davon ist einstellbar und steht als Konstante im Code. Die Regelseite unter
`/regeln` **erzeugt sich daraus** — sie kann nicht behaupten, was der Server nicht tut.

---

## Wer mitspielt

Die Spielerliste sind die **angemeldeten Steam-Konten**. Wer nicht angemeldet ist,
wird nicht gewertet — das ist die Regel, kein Mangel.

Steams OpenID braucht weder Registrierung noch Schlüssel: kein Passwort, keine
Mailadresse, kein Bestätigungsversand. Meccha läuft ohnehin über Steam, also hat
jeder Mitspieler ein Konto.

Drei Regeln hängen am **Ingame-Namen**, und alle drei haben denselben Grund — sonst
könnte sich jemand die Zeile des Erstplatzierten gutschreiben lassen:

- **Eindeutig** über alle Konten. Wer zuerst da ist, dem gehört der Name.
- Nur alle **30 Tage** änderbar (`MC_NAMENSSPERRE_TAGE`).
- Jede Änderung durch den Nutzer setzt den Zugang zurück auf „braucht Freigabe".

---

## Der Leser

**Ohne KI und ohne Grafikkarte** — RapidOCR über Python. Möglich wird das durch drei
Eigenschaften des Spiels: die Schrift ist weiß, rot oder grün (Farbfilter statt
Helligkeitsschwelle), die **Spalten stehen fest** (Namen und Punkte werden als
getrennte Streifen gelesen), die **Zeilen stehen fest** (Zuordnung über die
Y-Koordinate).

| | RapidOCR | Vision-Modell |
|---|---|---|
| Punktzahlen richtig | **10 von 10** | 10 von 10 |
| Zeit | **3 s** | 94 s |
| Grafikkarte | **keine** | 12 GB VRAM |

Das Vision-Modell bleibt als Ausweichlösung: `set MC_LESER=ollama`. Es braucht keine
Geometrie und hilft, falls das Spiel sein Layout ändert.

### Zweimal lesen, weil einmal nicht reicht

Die Punktespalte wird **zwei Mal** gelesen, mit verschiedener Vergrößerung.

Der Anlass war ein echter Fall: aus `995` wurde `566`. Nicht wegen des Farbfilters —
im gefilterten Bild stand `995` klar lesbar da —, sondern weil OCR die kleine
Pixelschrift falsch las. Und keine einzelne Einstellung liest alles richtig:

```
skala 4:  995 → 566 falsch, 1 130 richtig
skala 8:  995 → 995 richtig, 1 130 fällt ganz aus
```

Das behebt den Lesefehler nicht — es macht ihn **sichtbar**. Wo beide Durchgänge
dasselbe sehen, ist die Zahl belastbar. Wo sie sich widersprechen, liefert der Leser
`995?566` statt einer Zahl: das Parsen scheitert, die Zeile wird zur Rückfrage, und
auf der Freigabekarte stehen beide Kandidaten nebeneinander.

**Das ist der gefährlichste Fehlertyp im Projekt.** Eine `566` ist eine völlig
plausible Punktzahl — kein Zeichensalat, keine Verwechslung, nichts, woran eine
Prüfung sich festhalten könnte.

### Wer mittendrin aussteigt

Verlässt jemand die Partie, verschwindet sein **Name** aus dem Scoreboard — seine
**Punkte** bleiben stehen. Aus sieben Teilnehmern werden so drei lesbare Namen und
sieben Zahlen.

Eine Punktzahl ohne Namen **ist** ein Teilnehmer. Sie bekommt den Platzhalter `?` und
zählt für die Mindestzahl mit. Zugeordnet werden kann sie niemandem — und das ist
richtig: die Runde zählt, die Zeile nicht.

### Niemals verkleinern

| Skalierung | Baloou | Albert Wesker's Balls |
|---|---|---|
| **100 %** | `2 614` ✓ | `587` ✓ |
| 60 % | `2 514` ✗ | `567` ✗ |
| 45 % | `2 564` ✗ | `587` ✓ |

Die Zahlen kippen leise. `2 514` statt `2 614` sieht plausibel aus und rutscht durch
jede Prüfung.

---

## Der Namensabgleich

Das heikelste Stück. `ordneZu()` vergleicht den gelesenen Namen mit den Ingame-Namen
der Konten, in drei Stufen:

| Stufe | Was passiert | Beispiel | Zuversicht |
|---|---|---|---|
| 1 | `nameKey`-Treffer | `NORIKOTV` → `NorikoTv` | 1.0 |
| 2 | gleich, sobald die Deko weg ist | `theRealBaloou!` → `theRealBaloou` | 0.95 |
| 3 | Levenshtein, nur bei eindeutigem Treffer | `N0rikoTv` → `NorikoTv` | 0.85 / 0.7 |
| — | mehrere gleich nahe Kandidaten | → **Rückfrage** | — |
| — | niemand nah genug | → **Rückfrage** | — |

Wie viel Abweichung erlaubt ist, hängt an der Länge — es geht um den Anteil:

| Länge | erlaubte Distanz | warum |
|---|---|---|
| ≤ 4 | **0** | `Tom` und `Tim` liegen 1 auseinander und sind verschiedene Leute |
| 5–8 | 1 | ein verlesenes Zeichen |
| ≥ 9 | 2 | ein `l`/`1` plus ein `O`/`0` |

### Wann eine Zeile zurückgehalten wird

Eingetragen wird nur, wenn **Name und Punktzahl** sicher sind. Ein sicherer Name mit
geratener Zahl ist genauso unbrauchbar wie das Gegenteil.

| Fall | Verhalten |
|---|---|
| Punkte nicht lesbar | Rückfrage |
| Punkte nur mit Zeichenersetzung (`1O579`) | Rückfrage, auch bei exaktem Namen |
| führende Null (`0387`) | Rückfrage — bei Punktzahlen ein Lesefehler |
| Name unbekannt oder mehrdeutig | Rückfrage |
| **zwei Zeilen zeigen auf dieselbe Person** | **beide** zur Rückfrage |

Die letzte ist die unauffälligste und wichtigste: In einer Lobby steht jeder genau
einmal. Zeigen zwei Zeilen auf dieselbe Person, ist eine falsch gelesen — dann bekäme
jemand eine fremde Punktzahl in den Schnitt.

---

## Betrugsprüfung

Vier Hürden übereinander. Jede fängt etwas, das die anderen durchlassen:

| Hürde | fängt | fängt **nicht** |
|---|---|---|
| Bild-Hash | dieselbe Datei nochmal | neu abgespeichert |
| Bildprüfung (PNG-Blöcke) | in einem Malprogramm bearbeitet | anderes Aufnahmewerkzeug |
| Partie-Kennung | dieselbe Lobby-Runde nochmal, auch von jemand anderem | wenn die Mitspieler-Zeilen andere sind |
| **Verdacht** | echte Runden, aber die eigene Zeile immer auf denselben Wert gefälscht | den einmaligen Ausrutscher |

Die vierte ist die gegen den Geduldigen: Er spielt echte Runden mit wechselnden
Mitspielern, fälscht aber jedes Mal seine eigene Zeile auf denselben Wert. Jede
Partie-Kennung ist dann anders, jedes Bild frisch, jeder Hash neu — und trotzdem
steht dreimal exakt `11 714` in der Liste.

**Ab 1000 Punkten, 30 Tage rückwärts.** Darunter wiederholen sich Werte ehrlich.

**Kein Automat entscheidet.** Ein Flag sorgt dafür, dass die Runde bei dir landet
statt durchzulaufen, und dass der Beleg aufgehoben wird. Ein Automat, der ehrliche
Leute aussperrt, wäre schlimmer als der Betrug, den er verhindern soll.

---

## Mehrere Ranglisten

Es können mehrere gleichzeitig laufen, etwa eine fürs Jahr und eine für den Monat.
Eine freigegebene Runde landet in **jeder aktiven** — ein F9, zwei Einträge.

Eine neue Liste fängt bei null an. Deaktivieren heißt **verstecken**: sie nimmt nichts
Neues mehr auf und verschwindet von der öffentlichen Seite, bleibt aber im Dashboard
und lässt sich wieder einschalten. Die letzte aktive lässt sich nicht abschalten —
sonst gäbe es einen Zustand, in dem freigegebene Runden nirgends landen, und „in null
Listen eingetragen" sieht aus wie „eingetragen".

Anlegen und Abschalten darf nur ein **Admin**: eine versehentlich angelegte Liste
verdoppelt ab dann jede Runde. Export als CSV je Liste.

---

## Die Bilder

| | Größe | Frist |
|---|---|---|
| **Ausschnitt** (Ranglisten-Block, JPEG) | ~55 KB | **dauerhaft** |
| Original (ganzer Bildschirm, PNG) | ~2 MB | 3 Tage |
| Original bei geflaggter Runde | ~2 MB | 30 Tage |

Nicht verkleinern — **ausschneiden**. Der Block steht an fester Stelle, ausgeschnitten
in voller Auflösung sind es 57 KB statt 4,7 MB: achtzigmal kleiner, und jede Ziffer
bleibt scharf.

Nebeneffekt: Der Rest des Bildschirms fällt weg. Auf einem Vollbild sieht man sonst
auch mal Discord-Nachrichten oder offene Browsertabs von fremden Leuten.

---

## Vier Sprachen

Deutsch, Englisch, Chinesisch, Japanisch — auf allen Spieler-Oberflächen:

```
Client         81 Sätze
Kontoseite    114
Regelseite     41
```

Der **deutsche Satz ist der Schlüssel**, Englisch die Vorgabe. Fehlt eine Übersetzung,
steht deutscher Text da — eine leere Stelle wäre schlimmer als ein Satz in der falschen
Sprache. Tests wachen darüber, dass keine Sprache Lücken hat.

Das Dashboard ist nicht übersetzt: Das sehen nur Admins und Mods.

---

## Einrichten

```
npm install
copy EINSTELLUNGEN.bat.beispiel EINSTELLUNGEN.bat
```

Dann `EINSTELLUNGEN.bat` aufmachen und `MC_ADMIN_KEY` setzen. Für den Leser braucht es
Python mit RapidOCR — siehe [python/README.md](python/README.md).

**Starten:** Doppelklick auf `MECCHA-START.bat`. Öffnet Server und Verwaltung.

**Im Stream:** `WACHE.bat` (trägt ein) oder `WACHE-PROBE.bat` (trägt nichts ein).
Einmal starten, liegen lassen, im Spiel `F9` drücken. Das funktioniert, während das
Spiel im Vordergrund ist — der Hotkey nutzt `GetAsyncKeyState`, nicht `RegisterHotKey`:
die Taste wird nur *beobachtet*, nicht belegt.

**Auf dem Server:** siehe [UMZUG.md](UMZUG.md). Ausrollen mit `./deploy.sh`.

**Testdaten:** `npm run testdaten` legt zehn Konten mit unterschiedlich vielen Runden
an — fünf in der Wertung, zwei auf dem Sprung, drei Anwärter. `-- --weg` entfernt sie
wieder.

---

## Der Zuschauer-Client

Eine einzige Datei, `Meccha-Ranked.exe` aus `client-cs/` — rund 50 KB, keine
Installation, gebaut gegen das .NET Framework 4.

Zwei Dinge sind bewusst festgezurrt:

**Die Serveradresse steht fest in der .exe** und wird weder angezeigt noch aus einer
Datei gelesen. Niemand soll seine Runden versehentlich woandershin schicken. Ein
Serverumzug ist damit eine neue .exe, keine Bitte an alle, eine Zeile zu ändern.

**Der Token lässt sich nicht nebenbei löschen.** Ist einer eingetragen, zeigt das Feld
nur `WAA5••••••••FOCc`, gesperrt und grau. Ändern geht über einen eigenen Knopf mit
Rückfrage, bei der „Nein" vorbelegt ist.

Der Client zeigt, **wer man ist** (`Im Spiel: Baloou`), meldet **was aus der Runde
wurde**, und lässt jede Runde **aufklappen** — gelesener Name, Lobbygröße, eigener
Rang, Zeitpunkte, Ablehnungsgrund.

**Wo die Datei liegt:** bei **GitHub**, als Release, neben dem Quelltext — nicht auf
dem Server. Der verweist nur noch dorthin; `/client` leitet weiter, damit alte Links
aus dem Discord nicht ins Leere laufen. Der Grund ist nicht technisch: einer
unbekannten Domain glaubt niemand, einem offenen Repo mit einsehbarem Code eher.

**Bauen:** `client-cs\BAUEN.bat`. Die Fassungsnummer steht in
`config/verteilung.json` und wird beim Bauen in die .exe geschrieben — der Server
meldet dieselbe Zahl, und wer eine ältere hat, sieht den Hinweis samt Weg zum
Download.

Deshalb **bricht der Bau ab**, wenn sich die Quellen geändert haben und
`clientVersion` nicht: Sonst heißen zwei verschiedene .exe gleich, der Hinweis bleibt
aus, und niemand kann seiner Datei ansehen, welche er hat. Genau das ist passiert, als
der Client Japanisch bekam und weiter 0.5.0 hieß.

Gesagt wird es an drei Stellen: im Client als gelber Kasten über der Liste, der die
Download-Seite öffnet; unter dem Download-Knopf als **Fassung samt Baudatum**; und —
sobald jemand einmal gesendet hat — als Vergleich mit **seiner** Fassung, denn der
Client schickt sie ab 0.7.0 bei jeder Anfrage mit.

---

## Die Download-Warnung

Chrome meldet „wird selten heruntergeladen", Windows meldet beim Start „Der Computer
wurde durch Windows geschützt". Zwei verschiedene Warnungen zu verschiedenen
Zeitpunkten, beide aus demselben Grund: die Datei ist **unbekannt**. Keine Signatur,
kein Ruf.

Dagegen hilft nur ein Code-Signing-Zertifikat für mehrere hundert Euro im Jahr — und
das Projekt soll nichts kosten. Also der ehrliche Weg: `/download` **zeigt** die
Warnung und erklärt sie, statt sie zu verschweigen.

Dazu drei Wege zum Selbernachsehen, von denen keiner verlangt, jemandem zu glauben:
die **Prüfsumme** aus den Release-Notizen mit `Get-FileHash` vergleichen, die Datei
**bei VirusTotal** prüfen lassen, oder den **Quelltext lesen und selbst bauen**.

Dass dabei ein paar Scanner anschlagen, nimmt die Seite vorweg. Sieben von siebzig
melden „trojan" — alles Heuristik: das Programm ist neu, unsigniert, macht
Bildschirmfotos und schickt sie ins Netz. Wer ungewarnt zu VirusTotal geschickt wird,
ist danach misstrauischer als vorher.

---

## Tests

```
npm test        711 Tests
npm run build   Typecheck
```

Keine Abhängigkeit auf einen laufenden Server — Integrationstests starten sich einen
eigenen auf einem freien Port. Steam wird nie wirklich gefragt: die Rückfrage ist als
Parameter herausgezogen.

**Die Anzeige wird ausgeführt, nicht gelesen.** `test/hilfe-dom.ts` ist ein winziges
gefälschtes DOM — die Kontoseite läuft darin wirklich, mit gefälschten
Serverantworten. Der Grund: Zweimal ist die Rangliste an einem Laufzeitfehler
gescheitert, den der `catch` schluckte, und kein Test hat es gemerkt. Tests, die im
Quelltext nach Mustern suchen, prüfen *dass* etwas dasteht, nicht ob es läuft.

---

## Dateien

| Datei | Zweck |
|---|---|
| `src/rangliste.ts` | Die Wertung: Schnitt der letzten 10, Platzierung |
| `src/listen.ts` | Mehrere Ranglisten nebeneinander |
| `src/wertung.ts` | Klammer zwischen Konten und Rangliste |
| `src/namen.ts` | Normalisierung, Levenshtein, Zuordnung |
| `src/parse.ts` | OCR-Text → Name + Punkte, Trennzeichen, Verwechslungen |
| `src/runde.ts` | Entscheidung eintragen / Rückfrage pro Zeile |
| `src/leser.ts` | Antwort des Lesers prüfen, bevor sie etwas auslöst |
| `src/rapidocr.ts` · `src/ollama.ts` | Die zwei Leser |
| `src/ausschnitt.ts` | Ranglisten-Block ausschneiden |
| `src/bildpruefung.ts` | Sieht das Bild nach einer frischen Aufnahme aus? |
| `src/verdacht.ts` | Dieselbe Punktzahl schon wieder |
| `src/freigabe.ts` · `src/freigabe-api.ts` | Warteschlange und Dashboard-Endpunkte |
| `src/konten.ts` · `src/steam.ts` | Konten, Sitzungen, Steam-Anmeldung |
| `src/konto-seite.ts` | Rangliste und Kontoseite |
| `src/regeln-seite.ts` · `src/download-seite.ts` | `/regeln` und `/download` |
| `src/tokens.ts` | Upload-Token, Mindestabstand |
| `src/server.ts` | Upload-Server |
| `client-cs/` | Zuschauer-Client in C# |
| `python/lies_rangliste.py` | RapidOCR-Teil |
| `UMZUG.md` | Einrichtung auf dem Server |
| `UMBAU.md` | Wie aus einem Anbau ein eigenständiges System wurde |

---

## Die Schwellen im Code sind Vorgaben

Die Betrugsprüfung steht offen da — das ist Absicht. Eine Prüfung, die nur wirkt,
solange niemand sie kennt, ist keine.

Ihre **Zahlen** sind aber einstellbar und im Betrieb andere:

| | |
|---|---|
| `MC_VERDACHT_AB` | ab welcher Punktzahl eine Wiederholung auffällt |
| `MC_VERDACHT_TAGE` | wie weit zurückgeschaut wird |
| `MC_MIN_SPIELER` | Mindestzahl Verstecker |
| `MC_ABSTAND_ANGENOMMEN` · `MC_ABSTAND_FEHLSCHLAG` | die Pausen |

Wer hier `1000` und `30` liest, weiß deshalb noch nicht, wo die Latte wirklich liegt.

---

## Lizenz

MIT — siehe [LICENSE](LICENSE). Nimm es, ändere es, betreib deine eigene Liste.

MECCHA CHAMELEON gehört seinen Rechteinhabern. Dieses Projekt steht in keiner
Verbindung zu den Entwicklern des Spiels, zu Valve, Steam, Twitch oder Discord.

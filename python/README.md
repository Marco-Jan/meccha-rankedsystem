# Der Leser ohne KI

`lies_rangliste.py` liest die Meccha-Rangliste aus einem Screenshot — **ohne
Sprachmodell, ohne Grafikkarte**, auf jeder CPU in rund drei Sekunden.

## Einrichten

Einmalig, im Projektordner (eine Ebene über diesem hier):

```
python -m venv .venv
.venv\Scripts\python -m pip install rapidocr-onnxruntime pillow
```

Fertig. Der Feeder findet das Python danach selbst. Wer ein anderes Python
benutzen will, setzt `MC_PYTHON` auf dessen Pfad.

> Beim Anlegen der venv **nicht** `pip install --upgrade pip` mitlaufen lassen —
> das hat die Umgebung hier reproduzierbar zerlegt (`No module named
> pip._internal.cli`). Die mitgelieferte pip-Version reicht.

## Warum das ohne KI funktioniert

Drei Eigenschaften des Spiels, die alles entscheiden:

**1. Die Schrift ist immer weiß oder rot.**
Deshalb filtert das Skript nach *Farbe*, nicht nach Helligkeit. Das ist der
wichtigste Punkt: Die Rangliste liegt halbtransparent über der 3D-Welt, hinter
jeder Zeile liegt ein anderer Hintergrund. Gemessen mit Helligkeitsschwellen —
jede Einstellung gewinnt andere Zeilen und verliert dafür andere:

| Schwelle | gefunden |
|---|---|
| hell | die kleinen Zahlen, nicht die großen |
| grau | `2 614`, dafür die kleinen weg |

Ein Farbfilter hat dieses Problem nicht.

**2. Die Spalten stehen fest.**
Namen und Punkte werden als **getrennte senkrechte Streifen** gelesen. Die
beiden Alternativen sind messbar schlechter:

| Verfahren | Ergebnis |
|---|---|
| gemeinsamer Block | `11 714` und Abzeichen `31` verkleben zu `1171431` |
| Zelle für Zelle | zu wenig Bild für die Erkennungsstufe, fast nur Müll |
| **Streifen pro Spalte** | **10 von 10 richtig** |

**3. Die Zeilen stehen fest.**
Die Zuordnung Name ↔ Punktzahl läuft über die **Y-Koordinate**, nicht über die
Reihenfolge. Das ist wichtig: Fällt in einer Spalte eine Zeile aus, würde sich
bei Reihenfolge-Zuordnung ab da alles um eins verschieben und **jeder** bekäme
die Punkte seines Nachbarn. Über die Y-Koordinate bleibt der Ausfall lokal — die
betroffene Zeile hat dann keine Punkte und wird zur Rückfrage.

## Gemessen

Am selben echten Screenshot, beide Leser:

| | RapidOCR | Vision-Modell |
|---|---|---|
| Punktzahlen richtig | **10 von 10** | 10 von 10 |
| Zeit | **3,1 s** | 94 s |
| Grafikkarte | **keine** | 12 GB VRAM |

Namensfehler (`A.i.R.0` statt `.o`, `Iucas` statt `lucas`) fängt der
Fuzzy-Abgleich in `src/namen.ts` ab — dafür ist er da.

## Geometrie anpassen

Die eingebauten Koordinaten stammen aus einem 1920×1080-Screenshot und werden
auf andere Auflösungen umgerechnet. Passt das Layout nicht, legst du
`config/geometrie.json` an:

```json
{
  "referenz": { "breite": 1920, "hoehe": 1080 },
  "bereich_y": [465, 810],
  "spalten": {
    "name":   [55, 320],
    "punkte": [318, 400]
  },
  "skala": 4
}
```

**`bereich_y` darf die Kopfzeile nicht einschließen.** „Rangliste der übersehenen
Dinge" wird sonst als Zeile gelesen und verschiebt die Paarung um eins — mit
`[440, 860]` ist das hier passiert, mit `[465, 810]` stimmt es.

`skala` vergrößert **ohne Weichzeichnung** (Nearest Neighbor). Das ist Absicht:
mit Weichzeichnung kippten Ziffern (`11714` wurde zu `11712`).

## Direkt aufrufen

```
.venv\Scripts\python python\lies_rangliste.py bild.png
```

Gibt dasselbe JSON aus, das auch das Vision-Modell liefert — die strenge Prüfung
in `src/leser.ts` gilt für beide gleich.

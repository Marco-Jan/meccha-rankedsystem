# -*- coding: utf-8 -*-
"""Liest die Meccha-Rangliste aus einem Screenshot - ohne KI, ohne GPU.

Aufruf:  python lies_rangliste.py <bild.png> [--geometrie geometrie.json]
Ausgabe: JSON auf stdout, dieselbe Form, die auch das Vision-Modell
         liefert:  {"zeilen": [{"name": "...", "rohPunkte": "..."}, ...]}

Warum das ohne KI geht - drei Eigenschaften des Spiels, vom Nutzer
bestaetigt und hier ausgenutzt:

  1. Die Schrift ist IMMER weiss oder rot. Damit trennt ein Farbfilter
     die Schrift zuverlaessig vom Hintergrund. Ein Helligkeitsschwellwert
     kann das nicht, weil hinter jeder Zeile ein anderer Hintergrund
     liegt - gemessen: jede Schwelle gewinnt andere Zeilen und verliert
     dafuer andere.

  2. Die Spalten stehen fest. Namen und Punkte werden deshalb als
     getrennte senkrechte Streifen gelesen. Als gemeinsamer Block
     verkleben sie (aus "11 714" und dem Abzeichen "31" wurde
     "1171431"); als einzelne Zellen ist es zu wenig Bild fuer die
     Erkennungsstufe - gemessen, beides war schlechter.

  3. Die Zeilen stehen fest. Die Zuordnung Name zu Punktzahl laeuft ueber
     die Y-Koordinate und ist damit exakt, keine Schaetzung.

Gemessen am echten Screenshot: 10 von 10 Punktzahlen richtig in gut 3
Sekunden auf der CPU - gleichauf mit dem Vision-Modell, das dafuer 94
Sekunden und 12 GB Grafikspeicher brauchte.
"""

import sys
import json
import argparse
from PIL import Image

try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    print(json.dumps({
        "fehler": "rapidocr-onnxruntime ist nicht installiert. "
                  "Siehe python/README.md"
    }), flush=True)
    sys.exit(2)


# Ausgemessen an einem 1920x1080-Screenshot mit eingeblendeter Rangliste.
# Alles relativ zur Bildbreite/-hoehe, damit andere Aufloesungen mitgehen.
STANDARD_GEOMETRIE = {
    "referenz": {"breite": 1920, "hoehe": 1080},
    # Oberkante und Unterkante des Ranglistenblocks, ohne die Kopfzeile.
    # Die Kopfzeile MUSS draussen bleiben: sie wird sonst als Zeile
    # gelesen und verschiebt die Paarung Name/Punkte um eins.
    #
    # Die Unterkante lag bis zum 20.08.2026 bei 810 - gemessen an einer
    # 9er-Lobby, in die sie genau passte. Bei mehr Spielern waechst der
    # Block nach unten, und alles ab Rang 11 lag ausserhalb: der Leser
    # sah es gar nicht erst. An einem 16-Zeilen-Screenshot nachgemessen
    # liegt Rang 16 bei y=976, die Zeilenhoehe bei rund 31 px.
    #
    # 995 laesst Luft fuer die Unterlaengen der letzten Zeile. Gewertet
    # werden ohnehin nur die Raenge 1-15 (siehe leser.ts) - der Rest
    # wird gelesen und verworfen.
    "bereich_y": [465, 995],
    "spalten": {
        "name":   [55, 320],
        "punkte": [318, 400]
    },
    # Ohne Weichzeichnung vergroessern - erhaelt die Glyphenkanten.
    # Mit Weichzeichnung kippten Ziffern (11714 wurde zu 11712).
    "skala": 4
}


def lade_geometrie(pfad):
    if not pfad:
        return STANDARD_GEOMETRIE
    with open(pfad, encoding="utf-8") as f:
        roh = f.read()
    if roh and roh[0] == "\ufeff":       # BOM, wie in turnier/jsonstore.js
        roh = roh[1:]
    return json.loads(roh)


def skaliere(geo, breite, hoehe):
    """Rechnet die Geometrie auf die tatsaechliche Bildgroesse um."""
    fx = breite / geo["referenz"]["breite"]
    fy = hoehe / geo["referenz"]["hoehe"]
    return {
        "bereich_y": [int(geo["bereich_y"][0] * fy), int(geo["bereich_y"][1] * fy)],
        "spalten": {
            name: [int(x0 * fx), int(x1 * fx)]
            for name, (x0, x1) in geo["spalten"].items()
        },
        "skala": geo["skala"]
    }


def farbfilter(bild):
    """Behaelt weisse, rote und gruene Pixel, macht daraus Schwarz auf Weiss.

    Die Grenzen sind bewusst grosszuegig: die Schrift liegt halbtransparent
    ueber der Spielwelt und wird dadurch je nach Untergrund etwas dunkler
    oder heller. Zu enge Grenzen verlieren ganze Zeilen.

    GRUEN ist der eigene Name. Das hat im Betrieb gefehlt und war ein
    boeser Fehler: der Filter warf ausgerechnet die Zeile weg, um die es
    dem Absender geht, und der Server antwortete "dein Name steht nicht in
    dieser Rangliste" - obwohl der Spieler auf Platz 1 stand.
    """
    px = bild.load()
    for y in range(bild.height):
        for x in range(bild.width):
            r, g, b = px[x, y]
            weiss = r > 175 and g > 175 and b > 175
            rot = r > 130 and g < 110 and b < 110 and (r - max(g, b)) > 55
            gruen = g > 130 and r < 130 and b < 130 and (g - max(r, b)) > 45
            px[x, y] = (0, 0, 0) if (weiss or rot or gruen) else (255, 255, 255)
    return bild


def lies_spalte(ocr, bild, x0, x1, y0, y1, skala):
    """Liest einen senkrechten Streifen und gibt (y_mitte, text) zurueck."""
    streifen = bild.crop((x0, y0, x1, y1))
    streifen = farbfilter(streifen)
    streifen = streifen.resize(
        (streifen.width * skala, streifen.height * skala), Image.NEAREST)

    ergebnis, _ = ocr(streifen)
    treffer = []
    for kasten, text, _konf in (ergebnis or []):
        y_mitte = (kasten[0][1] + kasten[2][1]) / 2 / skala + y0
        treffer.append((y_mitte, text.strip()))
    treffer.sort()
    return treffer


# Zeichen, die OCR statt einer Ziffer liefern kann. Deckungsgleich mit
# VERWECHSLUNGEN in src/parse.ts - dort wird tatsaechlich umgewandelt,
# hier entscheidet es nur darueber, ob es ueberhaupt eine Zahl sein kann.
ZIFFERNAEHNLICH = set("oOQDlIi|zZsSbGtTBgq")
TRENNZEICHEN = set(" .,'  ")


def kann_zahl_sein(text):
    """Kann das eine Punktzahl sein - oder ist es Fremdtext?

    Gegen Spielchat: Meccha blendet Meldungen wie "Thingy hat dir ein X
    gegeben" ein. Liegt so eine Zeile im Streifen, landete frueher
    "geben" als Punktzahl in der Wertung.

    Bewusst LOCKER, nicht streng. Eine zu strenge Regel hat beim Testen
    echte Spieler verschluckt: "44B" und "14B" sind 448 und 148 mit einem
    verlesenen B, und "B" allein ist eine 8. Solche Zeilen muessen
    erhalten bleiben - parsePunkte in TypeScript wandelt sie um und
    markiert sie als unsicher, womit sie in der Rueckfrage landen. Dort
    entscheidet ein Mensch.

    Verworfen wird nur, was ueberhaupt nicht nach Zahl aussieht: mehrere
    Zeichen, keine einzige Ziffer, und auch nicht durchgehend
    ziffernaehnlich.
    """
    t = text.strip()
    if not t:
        return False
    if any(c.isdigit() for c in t):
        return True
    # Keine Ziffer drin: nur noch kurze Schnipsel aus verwechselbaren
    # Zeichen durchlassen ("B" fuer 8), nicht ganze Woerter.
    if len(t) <= 2 and all(c in ZIFFERNAEHNLICH or c in TRENNZEICHEN for c in t):
        return True
    return False


def paare(namen, punkte, toleranz):
    """Ordnet Namen und Punkte ueber die Y-Koordinate einander zu.

    Nicht ueber die Reihenfolge: faellt in einer Spalte eine Zeile aus,
    wuerde sich ab da alles um eins verschieben und JEDER bekaeme die
    Punkte seines Nachbarn. Ueber die Y-Koordinate bleibt so ein Ausfall
    lokal - die betroffene Zeile hat dann keine Punkte und wird zur
    Rueckfrage.
    """
    zeilen = []
    # Fremdtext gar nicht erst als Kandidat zulassen.
    offen = [(y, t) for (y, t) in punkte if kann_zahl_sein(t)]
    for y_name, name in namen:
        beste = None
        for i, (y_punkt, text) in enumerate(offen):
            abstand = abs(y_punkt - y_name)
            if abstand <= toleranz and (beste is None or abstand < beste[0]):
                beste = (abstand, i, text)
        if beste is None:
            # KEINE Zahl auf gleicher Hoehe -> das ist keine Ranglistenzeile.
            #
            # Der Farbfilter behaelt weisse und rote Pixel, und die gibt es
            # auch in der Spielwelt: rote Seesterne, helle Steine. Steht die
            # Rangliste nur halb voll, liegen die im leeren Teil des
            # Streifens und wurden frueher als Zeilen mitgezaehlt - aus 5
            # echten Zeilen wurden so 16, und die ganze Runde flog raus.
            #
            # Eine echte Zeile hat IMMER beides: Name links, Zahl rechts.
            # Fehlt die Zahl, ist es Weltinhalt und kein Ergebnis.
            continue
        zeilen.append({"name": name, "rohPunkte": beste[2]})
        offen.pop(beste[1])
    return zeilen


def nur_ziffern(text):
    """Zum Vergleichen: Trennzeichen weg, alles andere bleibt.

    "2 821" und "2821" sind dieselbe Zahl - dass ein Durchgang das
    Leerzeichen sieht und der andere nicht, ist kein Widerspruch.
    """
    return "".join(c for c in str(text) if c not in TRENNZEICHEN)


def markiere_unsichere(zeilen, namen, punkte_zweit, toleranz):
    """Vergleicht mit einem zweiten Durchgang und markiert Abweichungen.

    Eine Zeile gilt als unsicher, wenn der zweite Durchgang etwas
    ANDERES gelesen hat. Findet er dort gar nichts, bleibt es beim
    ersten Wert - eine fehlende zweite Meinung ist kein Widerspruch,
    sonst waere bei jedem schwachen Bild alles unsicher.

    Die Rohfassungen beider Durchgaenge wandern in "rohPunkte", getrennt
    durch ein Fragezeichen: "995?566". Damit scheitert das Parsen in
    parse.ts, die Zeile wird zur Rueckfrage - und wer sie im Dashboard
    ansieht, hat beide Kandidaten vor sich und muss nicht raten, was der
    Leser gemeint haben koennte.
    """
    zweite = paare(namen, punkte_zweit, toleranz)
    nach_name = {}
    for z in zweite:
        if z.get("rohPunkte"):
            nach_name[z["name"]] = z["rohPunkte"]

    for z in zeilen:
        erst = z.get("rohPunkte")
        zweit = nach_name.get(z["name"])
        if not erst or not zweit:
            continue
        if nur_ziffern(erst) != nur_ziffern(zweit):
            z["rohPunkte"] = str(erst) + "?" + str(zweit)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("bild")
    p.add_argument("--geometrie", default=None)
    args = p.parse_args()

    geo_roh = lade_geometrie(args.geometrie)
    bild = Image.open(args.bild).convert("RGB")
    geo = skaliere(geo_roh, bild.width, bild.height)

    y0, y1 = geo["bereich_y"]
    skala = geo["skala"]

    ocr = RapidOCR()
    namen = lies_spalte(ocr, bild, *geo["spalten"]["name"], y0, y1, skala)

    # Halbe Zeilenhoehe als Toleranz - naeher als das kann keine andere
    # Zeile liegen.
    toleranz = max(8, (y1 - y0) / 20)

    """
       DIE PUNKTE ZWEIMAL LESEN, MIT VERSCHIEDENER VERGROESSERUNG.

       Der Grund ist ein echter Vorfall vom 21.08.2026: aus 995 wurde
       566. Nicht wegen des Farbfilters - im gefilterten Bild stand 995
       klar lesbar da -, sondern weil OCR die kleine Pixelschrift falsch
       las.

       Das ist der gefaehrlichste Fehlertyp im ganzen Projekt. Eine 566
       ist eine voellig plausible Punktzahl: kein Zeichensalat, keine
       Verwechslung, nichts, woran eine Pruefung sich festhalten koennte.
       Sie laeuft still in die Wertung und niemand merkt es.

       Nachgemessen half keine einzelne Einstellung. Bei skala 4 wurde
       995 zu 566, aber 1 130 stimmte; bei skala 8 stimmte 995, dafuer
       fiel 1 130 ganz aus. Der Leser tauscht eine Zeile gegen eine
       andere.

       Zwei Durchgaenge loesen das nicht - sie machen den Fehler
       SICHTBAR. Wo beide dasselbe lesen, ist die Zahl belastbar; wo sie
       sich widersprechen, gibt es keine Punktzahl, sondern eine
       Rueckfrage. Genau so soll dieses Projekt arbeiten: im Zweifel
       nachfragen, nie raten.

       Kostet einen zweiten OCR-Durchgang ueber einen schmalen Streifen,
       im selben Prozess und mit bereits geladenen Modellen - rund eine
       Sekunde. Eine falsche Zahl in der Wertung kostet mehr.
    """
    zweite_skala = skala * 2
    punkte_a = lies_spalte(ocr, bild, *geo["spalten"]["punkte"], y0, y1, skala)
    punkte_b = lies_spalte(ocr, bild, *geo["spalten"]["punkte"], y0, y1, zweite_skala)

    zeilen = paare(namen, punkte_a, toleranz)
    markiere_unsichere(zeilen, namen, punkte_b, toleranz)

    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps({"zeilen": zeilen}, ensure_ascii=False))


if __name__ == "__main__":
    main()

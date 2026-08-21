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
    #
    # Die Oberkante lag bis zum 21.08.2026 bei 465 und schnitt damit
    # MITTEN IN DIE KOPFZEILE: an heseder3.JPG und runde-08-37-01
    # nachgemessen steht die Ueberschrift bei y 450..472, die erste
    # Ranglistenzeile erst ab 486. Die halbe Kopfzeile stand also als
    # eigene Zeile im Streifen und verschob die Paarung.
    "bereich_y": [477, 995],
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


def farbfilter(bild, nur_gruen=False):
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
            # Kein Deckel auf r und b: der entscheidet nicht, ob es gruen
            # IST, sondern nur, wie hell. An "Baloou" nachgemessen (siehe
            # bugfest.md) ueberlebten mit r<130 und b<130 nur 109 von 345
            # gruenen Pixeln - ausgerechnet die hellen Kanten fielen weg,
            # und der Name zerfiel zu Punkten. Ein weisser Name daneben
            # behielt 289. Der Abstand zu r und b sagt schon alles: Gelb
            # (r und g hoch) faellt dadurch weiterhin heraus.
            gruen = g > 130 and (g - max(r, b)) > 45
            behalten = gruen if nur_gruen else (weiss or rot or gruen)
            px[x, y] = (0, 0, 0) if behalten else (255, 255, 255)
    return bild


def eine_zeile(a, b):
    """Liegen zwei Kaesten auf derselben Zeile?

    Ueber die senkrechte UEBERLAPPUNG, nicht ueber einen festen Abstand:
    die Zeilenhoehe haengt an der Aufloesung, die Ueberlappung nicht.
    Mehr als die halbe Hoehe des kleineren Kastens - darunter sind es
    zwei Zeilen, die sich nur mit den Unterlaengen beruehren.
    """
    o_oben, o_unten = a[0], a[1]
    b_oben, b_unten = b[0], b[1]
    ueberlappung = min(o_unten, b_unten) - max(o_oben, b_oben)
    hoehe = min(o_unten - o_oben, b_unten - b_oben)
    return hoehe > 0 and ueberlappung > hoehe * 0.5


def lies_spalte(ocr, bild, x0, x1, y0, y1, skala, nur_gruen=False):
    """Liest einen senkrechten Streifen und gibt (y_mitte, text) zurueck.

    EINE ZEILE ERGIBT EINEN EINTRAG - auch wenn OCR sie in mehrere
    Kaesten zerlegt hat.

    Der Anlass ist gemessen, nicht vermutet. In der Namensspalte steht
    die Rangnummer vor dem Namen ("#2 Baloou"), und meistens liest OCR
    das als einen Kasten. Manchmal aber als zwei:

        y=524  ->  "#2" | "Baloou"

    Frueher wurden daraus ZWEI Eintraege auf derselben Hoehe. paare()
    laeuft ueber die Namen und nimmt sich je eine Punktzahl: "#2"
    schnappte sie sich, und fuer "Baloou" war keine mehr da - seine
    Zeile fiel mit `continue` heraus. Die Lobby hatte damit einen
    Spieler zu wenig (7 statt 8), und die Punkte hingen an einem
    Rangzeichen statt an einem Menschen.

    Dasselbe droht in der Punktespalte, wo das Tausender-Trennzeichen
    die Zahl teilen kann - aus "1 665" wuerden "1" und "665", und
    uebrig blieben 665. Zusammengefasst mit einem Leerzeichen macht
    parse.ts daraus wieder 1665: Trennzeichen fallen dort ohnehin weg.
    """
    streifen = bild.crop((x0, y0, x1, y1))
    streifen = farbfilter(streifen, nur_gruen)
    streifen = streifen.resize(
        (streifen.width * skala, streifen.height * skala), Image.NEAREST)

    ergebnis, _ = ocr(streifen)

    # (oben, unten, links, text) - links entscheidet spaeter die Reihenfolge
    kaesten = []
    for kasten, text, _konf in (ergebnis or []):
        sauber = text.strip()
        if not sauber:
            continue
        kaesten.append((
            kasten[0][1] / skala + y0,
            kasten[2][1] / skala + y0,
            kasten[0][0] / skala,
            sauber
        ))

    gruppen = []
    for k in sorted(kaesten):
        fuer = None
        for gr in gruppen:
            if eine_zeile(gr[0], k):
                fuer = gr
                break
        if fuer is None:
            gruppen.append([k])
        else:
            fuer.append(k)

    treffer = []
    for gr in gruppen:
        # Von links nach rechts - sonst stuende die Rangnummer hinten
        # und aus "1 665" wuerde "665 1".
        gr.sort(key=lambda k: k[2])
        oben = min(k[0] for k in gr)
        unten = max(k[1] for k in gr)
        treffer.append(((oben + unten) / 2, " ".join(k[3] for k in gr)))

    treffer.sort()
    return treffer


# Zeichen, die OCR statt einer Ziffer liefern kann. Deckungsgleich mit
# VERWECHSLUNGEN in src/parse.ts - dort wird tatsaechlich umgewandelt,
# hier entscheidet es nur darueber, ob es ueberhaupt eine Zahl sein kann.
# Name fuer eine Punktzahl, deren Zeile keinen lesbaren Namen mehr hat -
# fast immer jemand, der die Partie verlassen hat. Absichtlich etwas, das
# kein Ingame-Name sein kann: die Zeile soll MITZAEHLEN, aber niemandem
# zugeordnet werden.
AUSGESTIEGEN = "?"

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


#  Ab so vielen Zeilen mit Zahl ist der Zeilenabstand verlaesslich.
#  Darunter wird gar nichts ergaenzt: aus zwei oder drei Zufallstreffern
#  laesst sich kein Raster ableiten, und was man daraus ergaenzt, ist
#  geraten.
GENUG_FUER_RASTER = 4


def passende_rasterstellen(zeilen, ohne_zahl):
    """Welche Namen ohne Zahl sitzen auf einer freien Rasterstelle?

    Der Zeilenabstand kommt aus den Zeilen, die eine Zahl haben - der
    Median ihrer Abstaende. Der Median und nicht das Mittel: eine
    einzelne Luecke von zwei Zeilenhoehen soll ihn nicht verziehen.
    """
    if len(zeilen) < GENUG_FUER_RASTER or not ohne_zahl:
        return []

    ys = sorted(z["y"] for z in zeilen)
    abstaende = sorted(b - a for a, b in zip(ys, ys[1:]) if b - a > 1)
    if not abstaende:
        return []
    schritt = abstaende[len(abstaende) // 2]
    if schritt <= 0:
        return []

    raus = []
    belegt = list(ys)
    for y_name, name in sorted(ohne_zahl):
        if not (ys[0] < y_name < ys[-1]):
            continue
        # Auf dem Raster? Der Abstand zur naechsten belegten Zeile muss
        # ein ganzes Vielfaches des Schritts sein, nicht irgendwas.
        naechste = min(belegt, key=lambda y: abs(y - y_name))
        vielfaches = abs(y_name - naechste) / schritt
        rest = abs(vielfaches - round(vielfaches))
        if round(vielfaches) < 1 or rest > 0.25:
            continue
        raus.append((y_name, name))
        belegt.append(y_name)
    return raus


#  Mehr gruene Kaesten als das koennen keine Namen sein - dann steht
#  gruene Spielwelt im Streifen (Wiese, Laub) und der Durchgang wird
#  ganz verworfen. Zwei statt einem, damit ein zerlegter Name ("#1" und
#  "Baloou") nicht schon als Weltinhalt gilt.
HOECHSTENS_GRUEN = 2


def korrigiere_gruen(zeilen, gruen, toleranz):
    """Setzt den gruen gelesenen Namen an seine Zeile.

    Im Scoreboard ist GRUEN immer der Absender - die anderen sind weiss
    oder rot. Damit ist Gruen die einzige Farbe, die in der Namensspalte
    genau einmal vorkommt, und ein Durchgang, der alles andere wegwirft,
    hat die Spielwelt gar nicht erst dabei.

    Das ist keine Feinheit. Gemessen an heseder.JPG: der normale
    Durchgang liest "B8166u", weil die weissen Wandstreifen hinter der
    Zeile behalten werden und als schwarze Masse in die Glyphen laufen.
    "B8166u" liegt vier Zeichen von "Baloou" entfernt, erlaubt ist bei
    sechs Zeichen genau eines - der Server antwortet "dein Name steht so
    nicht in dieser Rangliste", obwohl der Spieler auf Platz 1 steht.
    Der Durchgang nur auf Gruen liest "Baloou" mit 0.94.

    Er gewinnt deshalb gegen den normalen: fuer gruene Schrift hat er
    schlicht weniger Stoerung. Auch gegen einen Platzhalter - hat der
    normale Durchgang gar nichts gefunden, ist die Zeile bis hierher ein
    "Aussteiger", und der gruene Name gehoert trotzdem dorthin.
    """
    if not gruen or len(gruen) > HOECHSTENS_GRUEN:
        return

    for y_gruen, name in gruen:
        if not name:
            continue
        treffer = None
        for z in zeilen:
            abstand = abs(z["y"] - y_gruen)
            if abstand <= toleranz and (treffer is None or abstand < treffer[0]):
                treffer = (abstand, z)
        if treffer is not None:
            treffer[1]["name"] = name


def paare(namen, punkte, toleranz):
    """Ordnet Namen und Punkte ueber die Y-Koordinate einander zu.

    Nicht ueber die Reihenfolge: faellt in einer Spalte eine Zeile aus,
    wuerde sich ab da alles um eins verschieben und JEDER bekaeme die
    Punkte seines Nachbarn. Ueber die Y-Koordinate bleibt so ein Ausfall
    lokal.

    Jede Zeile traegt ihr "y" mit. Zwei Durchgaenge lassen sich sonst
    nicht vergleichen, sobald mehrere Zeilen denselben Platzhalter
    tragen - ueber den Namen waeren sie nicht auseinanderzuhalten.
    """
    zeilen = []
    ohne_zahl = []
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
            #
            # Meistens. Steht der Name aber MITTEN im Block, zwischen
            # zwei Zeilen mit Zahl, dann ist es keine Weltdeko - dann war
            # da ein Mitspieler, dessen Punkte nur nicht lesbar waren.
            # Weiter unten wird das entschieden, hier nur gemerkt.
            ohne_zahl.append((y_name, name))
            continue
        zeilen.append({"name": name, "rohPunkte": beste[2], "y": y_name})
        offen.pop(beste[1])

    # ------------------------------------------------------------------
    #  PUNKTE OHNE NAMEN: WER MITTENDRIN AUSGESTIEGEN IST
    #
    #  Verlaesst jemand die Partie, verschwindet sein NAME aus dem
    #  Scoreboard - seine Punkte bleiben stehen. Aus sieben Teilnehmern
    #  werden so drei lesbare Namen und sieben Zahlen.
    #
    #  Frueher fielen diese Zeilen hier lautlos weg. Damit sank die
    #  gezaehlte Spielerzahl unter die Mindestgrenze, und eine voellig
    #  gueltige Runde wurde abgewiesen - mit der Begruendung, es seien zu
    #  wenige Verstecker gewesen. Waren es aber nicht.
    #
    #  Eine Punktzahl ohne Namen IST ein Teilnehmer. Sie bekommt einen
    #  Platzhalter und zaehlt damit mit. Zugeordnet werden kann sie
    #  niemandem - "?" trifft kein Konto -, und das ist genau richtig:
    #  die RUNDE zaehlt, die Zeile selbst nicht. Wichtig ist ohnehin nur
    #  die eigene Zeile, und die bleibt stehen, solange man selbst
    #  mitspielt.
    #
    #  Nebeneffekt, der willkommen ist: die Partie-Kennung entsteht aus
    #  ALLEN Punktzahlen und wird dadurch stabiler. Zwei Leute aus
    #  derselben Lobby sehen dieselbe Zahlenmenge, auch wenn bei dem
    #  einen ein Name mehr fehlt als beim anderen.
    # ------------------------------------------------------------------
    for y_punkt, text in offen:
        zeilen.append({"name": AUSGESTIEGEN, "rohPunkte": text, "y": y_punkt})

    # ------------------------------------------------------------------
    #  NAMEN OHNE ZAHL: WER DA WAR, ABER UNLESBAR PUNKTETE
    #
    #  Das Gegenstueck zum Aussteiger. Dort fehlt der Name, hier die
    #  Zahl - und beide Male ist es ein Mitspieler, der mitzaehlen muss.
    #
    #  Gemessen an heseder3.JPG: Caspian steht als Rang 3 klar lesbar da,
    #  seine Punktzahl liegt aber auf hellem Marmor, wo der Farbfilter
    #  den Untergrund behaelt und die Schrift wegwirft. Seine Zeile fiel
    #  darum ganz heraus - aus 8 Versteckern wurden 7. Fuer eine Runde
    #  knapp an der Mindestzahl entscheidet genau das ueber gueltig oder
    #  nicht, und die Begruendung waere gelogen: es waren genug.
    #
    #  "Zwischen der ersten und der letzten Zahl" reicht als Bedingung
    #  NICHT. Nachgemessen an runde-2026-08-18T10-01-34: dort liegt die
    #  Rangliste ueber buntem Boden, der Filter laesst Weltinhalt stehen,
    #  und aus einer gelesenen Zeile wurden acht - sieben davon Unsinn wie
    #  "EaoouaDE5TP-zkTFFCH". Eine zu kleine Lobby haette damit die
    #  Mindestzahl gerissen. Das waere schlimmer als die verlorene Zeile.
    #
    #  Eine Rangliste ist ein RASTER: gleiche Abstaende, gerade Spalte.
    #  Weltinhalt ist es nicht. Also wird der Zeilenabstand aus den
    #  Zeilen MIT Zahl geschaetzt, und ein Name ohne Zahl zaehlt nur,
    #  wenn er auf einer freien Rasterstelle sitzt.
    #
    #  Punkte bekommt die Zeile keine - "" ist nicht lesbar, parse.ts
    #  macht daraus eine Rueckfrage. Genau richtig: die RUNDE zaehlt, die
    #  Zeile nicht.
    # ------------------------------------------------------------------
    for y_name, name in passende_rasterstellen(zeilen, ohne_zahl):
        zeilen.append({"name": name, "rohPunkte": "", "y": y_name})

    # Von oben nach unten, sonst haengen die Aussteiger hinten dran und
    # die Rangfolge stimmt nicht mehr.
    zeilen.sort(key=lambda z: z["y"])
    return zeilen


def nur_ziffern(text):
    """Zum Vergleichen: Trennzeichen weg, alles andere bleibt.

    "2 821" und "2821" sind dieselbe Zahl - dass ein Durchgang das
    Leerzeichen sieht und der andere nicht, ist kein Widerspruch.
    """
    return "".join(c for c in str(text) if c not in TRENNZEICHEN)


def markiere_unsichere(zeilen, namen, punkte_zweit, toleranz):
    """Vergleicht mit einem zweiten Durchgang und markiert Abweichungen.

    Verglichen wird ueber die Y-KOORDINATE, nicht ueber den Namen. Seit
    Aussteiger mitzaehlen, koennen mehrere Zeilen denselben Platzhalter
    tragen - ueber den Namen waeren sie nicht auseinanderzuhalten, und
    die letzte wuerde alle vorherigen ueberschreiben.

    Eine Zeile gilt als unsicher, wenn der zweite Durchgang an derselben
    Stelle etwas ANDERES gelesen hat. Findet er dort gar nichts, bleibt
    es beim ersten Wert - eine fehlende zweite Meinung ist kein
    Widerspruch, sonst waere bei jedem schwachen Bild alles unsicher.

    Die Rohfassungen beider Durchgaenge wandern in "rohPunkte", getrennt
    durch ein Fragezeichen: "995?566". Damit scheitert das Parsen in
    parse.ts, die Zeile wird zur Rueckfrage - und wer sie im Dashboard
    ansieht, hat beide Kandidaten vor sich und muss nicht raten.
    """
    zweite = paare(namen, punkte_zweit, toleranz)

    for z in zeilen:
        erst = z.get("rohPunkte")
        if not erst:
            continue

        # Die naechstgelegene Zeile des zweiten Durchgangs
        zweit = None
        naechster = None
        for w in zweite:
            abstand = abs(w["y"] - z["y"])
            if abstand <= toleranz and (naechster is None or abstand < naechster):
                naechster = abstand
                zweit = w.get("rohPunkte")

        if not zweit:
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

    # Der eigene Name ist gruen - dafuer ein eigener Durchgang, der
    # alles andere wegwirft. Siehe korrigiere_gruen.
    gruen = lies_spalte(ocr, bild, *geo["spalten"]["name"], y0, y1, skala,
                        nur_gruen=True)
    korrigiere_gruen(zeilen, gruen, toleranz)

    # y war nur zum Zuordnen und Vergleichen da und gehoert nicht in die
    # Antwort - der Server interessiert sich fuer Namen und Punkte.
    for z in zeilen:
        z.pop("y", None)

    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps({"zeilen": zeilen}, ensure_ascii=False))


if __name__ == "__main__":
    main()

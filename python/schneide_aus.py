# -*- coding: utf-8 -*-
"""
Schneidet den Ranglisten-Block aus einem Screenshot und legt ihn als
kleines JPEG ab.

WARUM AUSSCHNEIDEN UND NICHT VERKLEINERN

Ein Screenshot ist rund 2 MB gross. Alle aufzuheben hiesse bei zwei
Streams die Woche etwa 16 GB im Jahr - auf einer Platte mit 24 GB, auf
der schon andere Dienste liegen. Verkleinern waere der naheliegende
Ausweg und ist der falsche: die Ziffern kippen dabei leise. Am echten
Bild gemessen wurde aus 2 614 bei 60 % Groesse eine 2 514 - falscher
Wert, richtiger Name, keine Auffaelligkeit. So etwas rutscht durch jede
Pruefung.

Der Ranglisten-Block steht aber an einer festen Stelle und ist winzig:
rund 345x345 Pixel von 1920x1080. Ausgeschnitten in voller Aufloesung
sind das ~35 KB - siebenundfuenfzigmal kleiner als das Original, und
jede Ziffer bleibt gestochen scharf. Es ist genau der Bereich, den der
Leser ohnehin liest.

Nebeneffekt, der nicht klein ist: der Rest des Bildschirms faellt weg.
Auf einem Vollbild sieht man sonst auch mal Discord-Nachrichten oder
offene Browsertabs von fremden Leuten.

Aufruf:
    python schneide_aus.py <bild> <ziel.jpg> [--geometrie datei.json]
"""

import argparse
import json
import sys

from PIL import Image

# Dieselbe Geometrie wie in lies_rangliste.py - dort ausgemessen und
# dort auch erklaert. Wird sie hier abweichend gepflegt, zeigt der
# Ausschnitt etwas anderes als der Leser gelesen hat, und beim
# Nachpruefen wundert man sich.
from lies_rangliste import STANDARD_GEOMETRIE, lade_geometrie


# Rand um den Block, in Pixeln der Referenzaufloesung.
#
# Ohne Rand klebt die Schrift an der Kante und der Ausschnitt sieht
# abgeschnitten aus, auch wenn nichts fehlt. Mit Rand sieht man
# ausserdem die Ueberschrift und ein Stueck Spielwelt - das hilft beim
# Beurteilen, ob die Aufnahme echt wirkt.
# Links mehr als rechts: dort stehen die Rangziffern (#1 bis #15), und
# die gehoeren dazu. Ohne sie laesst sich am Ausschnitt nicht mehr
# nachvollziehen, auf welchem Platz jemand stand - genau die Angabe, die
# der Client beim Aufklappen nennt.
RAND_LINKS = 52
RAND_RECHTS = 25
RAND_OBEN = 35
RAND_UNTEN = 15

# JPEG-Guete. 85 ist der uebliche Kompromiss; darunter fangen die
# Ziffernkanten an zu flimmern, darueber waechst die Datei ohne
# sichtbaren Gewinn.
GUETE = 85


def ausschnitt_kasten(geo, breite, hoehe):
    """Rechnet den Ausschnitt auf die tatsaechliche Bildgroesse um."""
    fx = breite / geo["referenz"]["breite"]
    fy = hoehe / geo["referenz"]["hoehe"]

    spalten = geo["spalten"]
    links = min(spalten["name"][0], spalten["punkte"][0]) - RAND_LINKS
    rechts = max(spalten["name"][1], spalten["punkte"][1]) + RAND_RECHTS
    oben = geo["bereich_y"][0] - RAND_OBEN
    unten = geo["bereich_y"][1] + RAND_UNTEN

    # Auf das Bild begrenzen - bei einer ungewoehnlichen Aufloesung
    # koennte der Rand sonst darueber hinausragen und Pillow wuerde
    # schwarze Flaechen anfuegen.
    return (
        max(0, int(links * fx)),
        max(0, int(oben * fy)),
        min(breite, int(rechts * fx)),
        min(hoehe, int(unten * fy)),
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("bild")
    p.add_argument("ziel")
    p.add_argument("--geometrie", default=None)
    a = p.parse_args()

    geo = lade_geometrie(a.geometrie) if a.geometrie else STANDARD_GEOMETRIE

    bild = Image.open(a.bild)
    kasten = ausschnitt_kasten(geo, bild.width, bild.height)

    if kasten[2] <= kasten[0] or kasten[3] <= kasten[1]:
        print("Ausschnitt waere leer - Bild zu klein?", file=sys.stderr)
        sys.exit(1)

    # RGB, weil JPEG kein Alpha kann und PNG-Screenshots eins mitbringen.
    schnitt = bild.crop(kasten).convert("RGB")
    schnitt.save(a.ziel, "JPEG", quality=GUETE, optimize=True)

    print(json.dumps({
        "ok": True,
        "breite": schnitt.width,
        "hoehe": schnitt.height
    }))


if __name__ == "__main__":
    main()

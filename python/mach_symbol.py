# -*- coding: utf-8 -*-
"""Erzeugt das Symbol der .exe - client-cs/meccha.ico

Eine .exe ohne Symbol, ohne Produktnamen und ohne Versionsangabe ist
fuer ein Erkennungsmodell ein anonymer Klumpen, der Bildschirmfotos
macht und ins Netz sendet. Nichts davon macht sie ungefaehrlicher - aber
es nimmt genau das Merkmal weg, an dem sich die Heuristik festhaelt.

Dasselbe Motiv wie das Favicon der Seite: drei Balken, der oberste in
Bernstein. Eine Rangliste, von weitem erkennbar.

    python python/mach_symbol.py
"""
import os
import sys

from PIL import Image, ImageDraw

# Die Groessen, die Windows wirklich benutzt: Explorer klein und gross,
# Taskleiste, Alt-Tab. Fehlt eine, skaliert Windows und es wird matschig.
GROESSEN = (16, 20, 24, 32, 40, 48, 64, 128, 256)

GRUND = (18, 20, 26)
BALKEN = ((0x5a, 0x64, 0x74), (0x8b, 0x95, 0xa6), (0xf0, 0xb4, 0x41))


def eine(kante):
    """Zeichnet gross und verkleinert - so bleiben die Kanten sauber."""
    gross = kante * 8
    bild = Image.new('RGBA', (gross, gross), (0, 0, 0, 0))
    z = ImageDraw.Draw(bild)

    ecke = int(gross * 0.22)
    z.rounded_rectangle([0, 0, gross - 1, gross - 1], radius=ecke, fill=GRUND)

    # Drei Balken, von unten nach oben kuerzer werdend - wie eine Liste,
    # bei der oben der Beste steht.
    breiten = (0.56, 0.38, 0.47)
    for i, (farbe, breit) in enumerate(zip(BALKEN, breiten)):
        y = gross * (0.62 - i * 0.22)
        h = gross * 0.125
        x = gross * 0.22
        z.rounded_rectangle([x, y, x + gross * breit, y + h],
                            radius=h / 2.4, fill=farbe)

    return bild.resize((kante, kante), Image.LANCZOS)


def mach():
    ziel = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'client-cs', 'meccha.ico')
    bilder = [eine(k) for k in GROESSEN]
    # Pillow schreibt alle Groessen in eine .ico, wenn man sie mitgibt.
    bilder[-1].save(ziel, format='ICO',
                    sizes=[(k, k) for k in GROESSEN])
    print('%s  (%d Groessen, %.1f KB)'
          % (ziel, len(GROESSEN), os.path.getsize(ziel) / 1024))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    mach()

# -*- coding: utf-8 -*-
"""Erzeugt das Vorschaubild fuer geteilte Links (og:image).

Wird der Link im Discord oder im Twitch-Chat gepostet, zeigen die
Plattformen eine Karte. Ohne Bild ist das eine graue Textzeile, mit Bild
ein Kasten, den man sieht. Genau dort landen die Zuschauer her.

1200x630 ist das Mass, das Discord, Twitter und Facebook gleichermassen
erwarten. Kleiner wird hochskaliert und unscharf, groesser bringt nichts.

    python python/mach_karte.py

Schreibt public/karte.png. Das Ergebnis gehoert ins Repo: es aendert
sich fast nie, und es zur Laufzeit zu erzeugen hiesse, Pillow auf dem
Server zu brauchen, wo es nur fuers Lesen da ist.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BREITE, HOEHE = 1200, 630

# Dieselben Farben wie die Seite - siehe konto-seite.ts
GRUND = (13, 16, 23)
FLAECHE = (22, 27, 36)
KANTE = (40, 49, 63)
TEXT = (232, 236, 243)
LEISE = (149, 161, 179)
AKZENT = (102, 192, 244)     # Steam-Blau
ZAHL = (255, 176, 32)        # Bernstein, nur fuer Punkte


def schrift(groesse, fett=False):
    """Segoe UI, wie auf der Seite. Faellt auf die Standardschrift zurueck."""
    for name in (('segoeuib.ttf', 'seguisb.ttf') if fett else ('segoeui.ttf',)):
        pfad = os.path.join(os.environ.get('WINDIR', r'C:\Windows'), 'Fonts', name)
        if os.path.exists(pfad):
            return ImageFont.truetype(pfad, groesse)
    return ImageFont.load_default()


def breite_von(zeichner, text, font):
    links, oben, rechts, unten = zeichner.textbbox((0, 0), text, font=font)
    return rechts - links


def mach():
    bild = Image.new('RGB', (BREITE, HOEHE), GRUND)
    z = ImageDraw.Draw(bild)

    # Ein ruhiger Streifen oben, damit die Karte nicht wie ein Loch wirkt
    z.rectangle([0, 0, BREITE, 6], fill=AKZENT)

    rand = 88
    y = 132

    z.text((rand, y), 'MECCHA CHAMELEON  ·  RANGLISTE',
           font=schrift(26), fill=LEISE)
    y += 54

    z.text((rand, y), 'Meccha Ranked', font=schrift(96, True), fill=TEXT)
    y += 128

    z.text((rand, y), 'Drück F9 am Ende der Runde.',
           font=schrift(38), fill=TEXT)
    y += 52
    z.text((rand, y), 'Der Server liest deine Punkte aus dem Bild und trägt sie ein.',
           font=schrift(31), fill=LEISE)

    # Der Ablauf als drei Felder, wie im Seitenkopf
    y = 452
    f_gross = schrift(34, True)
    f_klein = schrift(21)
    x = rand
    for wort, unten_text, farbe in (('F9', 'im Spiel', TEXT),
                                    ('OCR', 'Server liest ab', TEXT),
                                    ('+2 771', 'in der Rangliste', ZAHL)):
        w = max(breite_von(z, wort, f_gross), breite_von(z, unten_text, f_klein)) + 44
        z.rounded_rectangle([x, y, x + w, y + 96], radius=12,
                            fill=FLAECHE, outline=KANTE, width=2)
        z.text((x + 22, y + 18), wort, font=f_gross, fill=farbe)
        z.text((x + 22, y + 62), unten_text, font=f_klein, fill=LEISE)
        x += w + 20
        if wort != '+2 771':
            z.text((x - 14, y + 34), '→', font=schrift(28), fill=LEISE)
            x += 18

    ziel = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'public', 'karte.png')
    os.makedirs(os.path.dirname(ziel), exist_ok=True)
    bild.save(ziel, 'PNG', optimize=True)
    print('%s  (%d x %d, %.0f KB)'
          % (ziel, BREITE, HOEHE, os.path.getsize(ziel) / 1024))


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    mach()

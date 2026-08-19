import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { pruefeBild, pngBloecke, MAX_IDAT } from '../src/bildpruefung.js';

/* Ein PNG von Hand bauen: Signatur plus Bloecke. Der Inhalt ist egal, es
   geht ausschliesslich um die Struktur. */
function bastlePng(bloecke: Array<[string, number]>): Buffer {
  const teile: Buffer[] = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  for (const [typ, laenge] of bloecke) {
    const kopf = Buffer.alloc(8);
    kopf.writeUInt32BE(laenge, 0);
    kopf.write(typ, 4, 'ascii');
    teile.push(kopf, Buffer.alloc(laenge), Buffer.alloc(4));
  }
  return Buffer.concat(teile);
}

/* So sieht eine Aufnahme ueber System.Drawing aus - am echten Screenshot
   gemessen. */
const AUFNAHME: Array<[string, number]> = [
  ['IHDR', 13], ['sRGB', 1], ['gAMA', 4], ['pHYs', 9],
  ['IDAT', 65445], ['IDAT', 65524], ['IEND', 0]
];

/* So sieht dasselbe Bild nach dem Neu-Abspeichern aus - ebenfalls
   gemessen. Die Metadaten sind weg, die Datenbloecke haben eine andere
   Groesse. */
const NEU_GESPEICHERT: Array<[string, number]> = [
  ['IHDR', 13], ['IDAT', 65536], ['IDAT', 65536], ['IEND', 0]
];

describe('pngBloecke', () => {
  test('zerlegt ein PNG in seine Bloecke', () => {
    const b = pngBloecke(bastlePng(AUFNAHME));
    assert.deepEqual(
      b.map((x) => x.typ),
      ['IHDR', 'sRGB', 'gAMA', 'pHYs', 'IDAT', 'IDAT', 'IEND']
    );
  });

  test('gibt nichts zurueck, wenn die PNG-Signatur fehlt', () => {
    assert.deepEqual(pngBloecke(Buffer.from('das ist kein PNG')), []);
    assert.deepEqual(pngBloecke(Buffer.alloc(0)), []);
  });

  test('haengt sich an einem kaputten Bild nicht auf', () => {
    // Unsinnige Laengenangabe - ohne Obergrenze waere das eine Endlosschleife.
    const kaputt = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from([0xff, 0xff, 0xff, 0xff]),
      Buffer.from('IDAT', 'ascii')
    ]);
    assert.ok(Array.isArray(pngBloecke(kaputt)));
  });
});

describe('pruefeBild', () => {
  test('haelt eine frische Aufnahme fuer echt', () => {
    const befund = pruefeBild(bastlePng(AUFNAHME), 'image/png');
    assert.equal(befund.wirktEcht, true);
    assert.equal(befund.auffaelligkeiten.length, 0);
  });

  /*
     Der eigentliche Zweck des Moduls. Jede Bearbeitung muss das PNG neu
     schreiben, und dabei gehen die Metadaten-Bloecke verloren. Wer in
     Paint eine Ziffer aendert, faellt damit auf.
  */
  test('erkennt ein neu abgespeichertes Bild', () => {
    const befund = pruefeBild(bastlePng(NEU_GESPEICHERT), 'image/png');
    assert.equal(befund.wirktEcht, false);
    assert.match(befund.auffaelligkeiten.join(' '), /Metadaten-Bloecke fehlen/);
  });

  test('meldet auch einzelne fehlende Metadaten', () => {
    const teilweise: Array<[string, number]> = [
      ['IHDR', 13], ['sRGB', 1], ['IDAT', 100], ['IEND', 0]
    ];
    const befund = pruefeBild(bastlePng(teilweise), 'image/png');
    assert.equal(befund.wirktEcht, false);
    assert.match(befund.auffaelligkeiten.join(' '), /gAMA/);
  });

  test('meldet Textbloecke, wie Bearbeitungsprogramme sie schreiben', () => {
    const mitText: Array<[string, number]> = [
      ['IHDR', 13], ['sRGB', 1], ['gAMA', 4], ['pHYs', 9],
      ['tEXt', 30], ['IDAT', 100], ['IEND', 0]
    ];
    const befund = pruefeBild(bastlePng(mitText), 'image/png');
    assert.equal(befund.wirktEcht, false);
    assert.match(befund.auffaelligkeiten.join(' '), /tEXt/);
  });

  test('meldet ein kaputtes PNG', () => {
    const befund = pruefeBild(Buffer.from('kein PNG'), 'image/png');
    assert.equal(befund.wirktEcht, false);
    assert.match(befund.auffaelligkeiten.join(' '), /PNG-Struktur/);
  });

  test('winkt JPEG durch - da gibt es nichts zu unterscheiden', () => {
    // JPEG ist von Natur aus neu kodiert, die Signatur sagt dort nichts.
    const befund = pruefeBild(Buffer.from('irgendwas'), 'image/jpeg');
    assert.equal(befund.wirktEcht, true);
    assert.equal(befund.auffaelligkeiten.length, 0);
  });
});

describe('pruefeBild - Stueckelung der Bilddaten', () => {
  /*
     Aufgefallen an einer echten Faelschung: das Bearbeitungsprogramm
     schrieb EINEN Block mit 1 651 840 Byte, wo die Aufnahme 36 Bloecke
     hat. Das ist das staerkere Signal - Metadatenbloecke kann man
     ergaenzen, die Stueckelung sitzt tief im Kodierer.
  */
  test('erkennt einen einzelnen uebergrossen Datenblock', () => {
    const faelschung: Array<[string, number]> = [
      ['IHDR', 13], ['sRGB', 1], ['pHYs', 9], ['IDAT', 1651840], ['IEND', 0]
    ];
    const befund = pruefeBild(bastlePng(faelschung), 'image/png');
    assert.equal(befund.wirktEcht, false);
    assert.match(befund.auffaelligkeiten.join(' '), /Datenblock mit/);
  });

  test('greift auch bei vollstaendigen Metadaten', () => {
    // Wer die Metadaten ergaenzt, faellt trotzdem an der Stueckelung auf.
    const getarnt: Array<[string, number]> = [
      ['IHDR', 13], ['sRGB', 1], ['gAMA', 4], ['pHYs', 9],
      ['IDAT', 900000], ['IEND', 0]
    ];
    const befund = pruefeBild(bastlePng(getarnt), 'image/png');
    assert.equal(befund.wirktEcht, false);
    assert.match(befund.auffaelligkeiten.join(' '), /Datenblock mit/);
  });

  test('laesst Bloecke an der Grenze durch', () => {
    const grenzwertig: Array<[string, number]> = [
      ['IHDR', 13], ['sRGB', 1], ['gAMA', 4], ['pHYs', 9],
      ['IDAT', MAX_IDAT], ['IDAT', MAX_IDAT], ['IEND', 0]
    ];
    assert.equal(pruefeBild(bastlePng(grenzwertig), 'image/png').wirktEcht, true);
  });

  test('stoert sich nicht an vielen kleinen Bloecken', () => {
    const viele: Array<[string, number]> = [
      ['IHDR', 13], ['sRGB', 1], ['gAMA', 4], ['pHYs', 9],
      ...Array.from({ length: 40 }, () => ['IDAT', 65524] as [string, number]),
      ['IEND', 0]
    ];
    assert.equal(pruefeBild(bastlePng(viele), 'image/png').wirktEcht, true);
  });
});

describe('pruefeBild - am echten Screenshot', () => {
  const echt = 'C:/Users/Baloou/AppData/Local/Temp/mc-ranked-bilder/' +
    'runde-2026-08-18T08-37-01-275Z.png';

  test('haelt die echte Bildschirmaufnahme fuer echt', { skip: !existsSync(echt) }, () => {
    const befund = pruefeBild(readFileSync(echt), 'image/png');
    assert.equal(befund.wirktEcht, true, 'Auffaellig: ' + befund.auffaelligkeiten.join('; '));
  });

  /*
     Die echte Faelschung aus dem Test: in der Rangliste wurde
     "2 771" zu "22 771" gemacht. Visuell perfekt - gleiche Schrift,
     gleiche Position. Genau deshalb muss die Struktur es fangen.
  */
  const gefaelscht = 'C:/Users/Baloou/AppData/Local/Temp/mc-ranked-bilder/' +
    'runde-2026-08-18T08-37-01-275Z - Kopie.png';

  test('erkennt die echte Faelschung', { skip: !existsSync(gefaelscht) }, () => {
    const befund = pruefeBild(readFileSync(gefaelscht), 'image/png');
    assert.equal(befund.wirktEcht, false);
    assert.ok(befund.auffaelligkeiten.length >= 2,
      'erwartet wurden mindestens zwei Befunde, waren: ' + befund.auffaelligkeiten.join('; '));
  });
});

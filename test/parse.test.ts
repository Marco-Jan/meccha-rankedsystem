import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { parsePunkte, parseZeilen, SpaltenPassenNicht } from '../src/parse.js';

describe('parsePunkte - saubere Zahlen', () => {
  test('liest die echten Meccha-Groessenordnungen', () => {
    // Werte aus turnier/data/listen.json
    for (const n of [387, 717, 10579, 12160]) {
      const p = parsePunkte(String(n));
      assert.deepEqual(p, { punkte: n, unsicher: false });
    }
  });

  test('liest 0', () => {
    assert.deepEqual(parsePunkte('0'), { punkte: 0, unsicher: false });
  });
});

describe('parsePunkte - Tausendertrennzeichen', () => {
  /*
     Der wichtigste Test der Datei. turnier/listen.js:108 macht
     replace(',', '.') und dann Number() - "10,579" wuerde dort zu 10.579.
     Aus 10579 Punkten wuerden zehn. Die Trenner MUESSEN hier wegfallen.
  */
  test('Punkt als Tausendertrenner ergibt die Ganzzahl', () => {
    assert.deepEqual(parsePunkte('10.579'), { punkte: 10579, unsicher: false });
  });

  test('Komma als Tausendertrenner ergibt die Ganzzahl', () => {
    assert.deepEqual(parsePunkte('10,579'), { punkte: 10579, unsicher: false });
  });

  test('Leerzeichen als Tausendertrenner ergibt die Ganzzahl', () => {
    assert.deepEqual(parsePunkte('12 160'), { punkte: 12160, unsicher: false });
  });

  test('das Ergebnis ist nie eine Dezimalzahl', () => {
    for (const roh of ['10.579', '10,579', '1.234.567']) {
      const p = parsePunkte(roh);
      assert.ok(p, 'sollte lesbar sein: ' + roh);
      assert.ok(Number.isInteger(p.punkte), roh + ' ergab keine Ganzzahl: ' + p.punkte);
    }
  });
});

describe('parsePunkte - Zeichenverwechslungen', () => {
  test('erkennt O statt 0, markiert aber als unsicher', () => {
    const p = parsePunkte('1O579');
    assert.deepEqual(p, { punkte: 10579, unsicher: true });
  });

  test('erkennt l statt 1, markiert aber als unsicher', () => {
    const p = parsePunkte('l2160');
    assert.deepEqual(p, { punkte: 12160, unsicher: true });
  });

  test('markiert fuehrende Nullen als unsicher', () => {
    // "0387" ist bei einer Punktzahl ein Lesefehler, kein Wert.
    const p = parsePunkte('0387');
    assert.equal(p?.punkte, 387);
    assert.equal(p?.unsicher, true);
  });
});

describe('parsePunkte - Ablehnung', () => {
  test('lehnt Leeres ab', () => {
    assert.equal(parsePunkte(''), null);
    assert.equal(parsePunkte('   '), null);
    assert.equal(parsePunkte('...'), null);
  });

  test('lehnt echten Text ab, statt Ziffern hineinzuraten', () => {
    // Wuerde ein Name in der Punktespalte landen, darf daraus keine
    // Punktzahl werden.
    assert.equal(parsePunkte('NorikoTv'), null);
    assert.equal(parsePunkte('Platz'), null);
  });

  test('lehnt Vorzeichen ab', () => {
    // Meccha vergibt keine negativen Punkte - das kann nur ein Lesefehler
    // sein, und der soll auffallen statt korrigiert zu werden.
    assert.equal(parsePunkte('-387'), null);
    assert.equal(parsePunkte('+387'), null);
  });

  test('lehnt unsinnig grosse Zahlen ab', () => {
    assert.equal(parsePunkte('9'.repeat(25)), null);
  });
});

describe('parseZeilen', () => {
  const NAMEN = 'NorikoTv\nPolosios\ntheRealBaloou';
  const PUNKTE = '12160\n10579\n717';

  test('fuegt die Spalten zeilenweise zusammen', () => {
    const zeilen = parseZeilen(NAMEN, PUNKTE);
    assert.equal(zeilen.length, 3);
    assert.equal(zeilen[0]?.rohName, 'NorikoTv');
    assert.equal(zeilen[0]?.punkte?.punkte, 12160);
    assert.equal(zeilen[2]?.rohName, 'theRealBaloou');
    assert.equal(zeilen[2]?.punkte?.punkte, 717);
  });

  test('numeriert die Zeilen ab 1', () => {
    const zeilen = parseZeilen(NAMEN, PUNKTE);
    assert.deepEqual(zeilen.map((z) => z.zeile), [1, 2, 3]);
  });

  test('ignoriert Leerzeilen und Rauschen aus OCR', () => {
    const zeilen = parseZeilen('NorikoTv\n\n  \nPolosios\n', '12160\n\n10579');
    assert.equal(zeilen.length, 2);
    assert.equal(zeilen[1]?.rohName, 'Polosios');
  });

  test('behaelt den Rohwert, auch wenn er nicht lesbar war', () => {
    const zeilen = parseZeilen('NorikoTv', 'Muell!!');
    assert.equal(zeilen[0]?.punkte, null);
    // Der Rohwert muss ueberleben, sonst ist die Rueckfrage nicht klaerbar.
    assert.equal(zeilen[0]?.rohPunkte, 'Muell!!');
  });

  /*
     Der zweitwichtigste Schutz des Moduls: bei ungleicher Zeilenzahl
     bekaeme ab der Fehlstelle jeder Name die Punkte seines Nachbarn.
     Solche Runden muessen komplett zur Rueckfrage.
  */
  test('wirft bei ungleicher Zeilenzahl, statt falsch zu paaren', () => {
    assert.throws(
      () => parseZeilen('A\nB\nC', '1\n2'),
      (err: unknown) => {
        assert.ok(err instanceof SpaltenPassenNicht);
        assert.equal(err.namenZeilen, 3);
        assert.equal(err.punkteZeilen, 2);
        return true;
      }
    );
  });

  test('wirft auch, wenn die Punktespalte laenger ist', () => {
    assert.throws(() => parseZeilen('A\nB', '1\n2\n3'), SpaltenPassenNicht);
  });

  test('gibt bei zwei leeren Spalten einfach nichts zurueck', () => {
    assert.deepEqual(parseZeilen('', ''), []);
  });
});

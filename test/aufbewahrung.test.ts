import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ladeFreigabeliste } from '../src/freigabe.js';
import type { RohZeile } from '../src/parse.js';

/* =========================================================================
   Aufbewahrung: das Bild wird nach 24 Stunden geloescht, der Eintrag
   bleibt. So kann man spaeter noch nachvollziehen, was eingereicht und
   wie entschieden wurde, ohne fremde Screenshots dauerhaft zu lagern.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-aufbewahrung-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

let n = 0;
const frisch = () => path.join(ORDNER, 'liste-' + (++n) + '.json');

function zeile(name: string, punkte: number): RohZeile {
  return { zeile: 1, rohName: name, rohPunkte: String(punkte), punkte: { punkte, unsicher: false } };
}

function eintrag(hash: string, bildPfad: string) {
  return {
    eingegangen: Date.now(),
    quelle: 'zuschauer' as const,
    absender: 'Zuschauerin',
    bildPfad,
    bildHash: hash,
    zeilen: [zeile('Jones', 2771)]
  };
}

function legeBild(name: string): string {
  const p = path.join(ORDNER, name);
  writeFileSync(p, 'bilddaten');
  return p;
}

const STUNDE = 3600 * 1000;

describe('Bilder loeschen nach Frist', () => {
  test('loescht das Bild einer bearbeiteten Runde nach 24 Stunden', () => {
    const liste = ladeFreigabeliste(frisch());
    const bild = legeBild('weg.png');
    const { runde } = liste.hinzufuegen(eintrag('h1', bild));
    liste.entscheiden(runde.id, 'freigegeben', 'Baloou');

    assert.equal(liste.bilderAufraeumen(24, Date.now() + 25 * STUNDE), 1);
    assert.equal(existsSync(bild), false);
    assert.equal(runde.bildGeloescht, true);
  });

  test('behaelt den Eintrag, auch wenn das Bild weg ist', () => {
    // Nachvollziehbarkeit bleibt: wer was eingereicht hat und wie
    // entschieden wurde. Nur das Bild geht weg.
    const liste = ladeFreigabeliste(frisch());
    const { runde } = liste.hinzufuegen(eintrag('h2', legeBild('weg2.png')));
    liste.entscheiden(runde.id, 'abgelehnt', 'Baloou', 'sah bearbeitet aus');

    liste.bilderAufraeumen(24, Date.now() + 25 * STUNDE);
    assert.equal(liste.alle().length, 1);
    assert.equal(liste.alle()[0]?.grund, 'sah bearbeitet aus');
    assert.equal(liste.alle()[0]?.absender, 'Zuschauerin');
  });

  /*
     Der wichtigste Test hier. Ohne Bild waere eine offene Runde nicht
     mehr pruefbar - man muesste sie blind entscheiden, und genau das
     soll die Freigabe ja verhindern.
  */
  test('verschont OFFENE Runden, egal wie alt', () => {
    const liste = ladeFreigabeliste(frisch());
    const bild = legeBild('bleibt.png');
    liste.hinzufuegen(eintrag('h3', bild));

    assert.equal(liste.bilderAufraeumen(24, Date.now() + 100 * STUNDE), 0);
    assert.equal(existsSync(bild), true);
  });

  test('laesst frisch entschiedene Runden in Ruhe', () => {
    const liste = ladeFreigabeliste(frisch());
    const bild = legeBild('frisch.png');
    const { runde } = liste.hinzufuegen(eintrag('h4', bild));
    liste.entscheiden(runde.id, 'freigegeben', 'Baloou');

    assert.equal(liste.bilderAufraeumen(24), 0);
    assert.equal(existsSync(bild), true);
  });

  test('loescht nicht zweimal', () => {
    const liste = ladeFreigabeliste(frisch());
    const { runde } = liste.hinzufuegen(eintrag('h5', legeBild('einmal.png')));
    liste.entscheiden(runde.id, 'freigegeben', 'Baloou');

    const spaeter = Date.now() + 25 * STUNDE;
    assert.equal(liste.bilderAufraeumen(24, spaeter), 1);
    assert.equal(liste.bilderAufraeumen(24, spaeter), 0);
  });

  test('kommt mit einem schon verschwundenen Bild zurecht', () => {
    // Jemand hat den Ordner aufgeraeumt - das darf nicht knallen.
    const liste = ladeFreigabeliste(frisch());
    const { runde } = liste.hinzufuegen(eintrag('h6', path.join(ORDNER, 'gibtsnicht.png')));
    liste.entscheiden(runde.id, 'freigegeben', 'Baloou');

    assert.equal(liste.bilderAufraeumen(24, Date.now() + 25 * STUNDE), 1);
    assert.equal(runde.bildGeloescht, true);
  });

  test('die Frist ist einstellbar', () => {
    const liste = ladeFreigabeliste(frisch());
    const bild = legeBild('kurz.png');
    const { runde } = liste.hinzufuegen(eintrag('h7', bild));
    liste.entscheiden(runde.id, 'freigegeben', 'Baloou');

    assert.equal(liste.bilderAufraeumen(1, Date.now() + 2 * STUNDE), 1);
  });
});

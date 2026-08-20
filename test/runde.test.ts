import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { bewerteRunde, teileAuf, personVon } from '../src/runde.js';
import { parseZeilen } from '../src/parse.js';
import type { Spieler } from '../src/namen.js';

const SPIELER: readonly Spieler[] = [
  { id: 'r_qjfcfog', name: 'NorikoTv' },
  { id: 'r_zbpxa3z', name: 'Polosios' },
  { id: 'r_cp141h1', name: 'theRealBaloou' }
];

/** Bequemer Aufbau: zwei Spalten als Text, wie sie von OCR kaemen. */
function runde(namen: string, punkte: string) {
  return teileAuf(bewerteRunde(parseZeilen(namen, punkte), SPIELER));
}

describe('bewerteRunde - der gute Fall', () => {
  test('traegt sichere Zeilen ein', () => {
    const r = runde('NorikoTv\nPolosios\ntheRealBaloou', '12160\n10579\n717');
    assert.equal(r.einzutragen.length, 3);
    assert.equal(r.rueckfragen.length, 0);
  });

  test('gibt den Kartei-Namen zurueck, nicht den Rohnamen', () => {
    // Genau das verhindert die Phantom-Spieler aus kartei.js:51.
    const r = runde('theRealBaloou!', '717');
    assert.equal(r.einzutragen.length, 1);
    const person = personVon(r.einzutragen[0]!);
    assert.equal(person?.name, 'theRealBaloou');
    assert.equal(person?.id, 'r_cp141h1');
  });

  test('akzeptiert Tausendertrennzeichen', () => {
    const r = runde('NorikoTv', '12.160');
    assert.equal(r.einzutragen.length, 1);
    assert.equal(r.einzutragen[0]?.zeile.punkte?.punkte, 12160);
  });
});

describe('bewerteRunde - Punkte unsicher', () => {
  test('haelt nicht lesbare Punkte zurueck', () => {
    const r = runde('NorikoTv', 'Muell!!');
    assert.equal(r.einzutragen.length, 0);
    assert.equal(r.rueckfragen.length, 1);
    assert.match(r.rueckfragen[0]!.grund!, /nicht lesbar/);
  });

  test('haelt auch bei sicherem Namen zurueck, wenn die Zahl geraten waere', () => {
    // Der Name ist exakt, die Zahl nur mit O->0 lesbar. Weil die PUNKTE
    // gewertet werden, ist das trotzdem eine Rueckfrage.
    const r = runde('NorikoTv', '1O579');
    assert.equal(r.einzutragen.length, 0);
    assert.match(r.rueckfragen[0]!.grund!, /Zeichenersetzung/);
  });

  test('nennt in der Rueckfrage den Rohwert und die Deutung', () => {
    const r = runde('NorikoTv', '1O579');
    const grund = r.rueckfragen[0]!.grund!;
    assert.match(grund, /1O579/);
    assert.match(grund, /10579/);
  });
});

describe('bewerteRunde - Name unsicher', () => {
  test('haelt unbekannte Namen zurueck', () => {
    const r = runde('Qw3rty', '450');
    assert.equal(r.einzutragen.length, 0);
    assert.match(r.rueckfragen[0]!.grund!, /unbekannt/);
  });

  test('haelt mehrdeutige Namen zurueck und nennt die Kandidaten', () => {
    const aehnlich: Spieler[] = [
      { id: 'a', name: 'Spielerin' },
      { id: 'b', name: 'Spielerix' }
    ];
    const e = bewerteRunde(parseZeilen('Spieleriy', '100'), aehnlich);
    assert.equal(e[0]?.aktion, 'rueckfrage');
    assert.match(e[0]!.grund!, /Spielerin/);
    assert.match(e[0]!.grund!, /Spielerix/);
  });

  test('traegt einen fuzzy-Treffer ein, wenn er eindeutig ist', () => {
    const r = runde('N0rikoTv', '12160');
    assert.equal(r.einzutragen.length, 1);
    assert.equal(personVon(r.einzutragen[0]!)?.name, 'NorikoTv');
  });

  test('respektiert eine hoehere Mindest-Confidence', () => {
    // Bei 0.99 ist ein fuzzy-Treffer (0.85) nicht mehr gut genug.
    const e = bewerteRunde(parseZeilen('N0rikoTv', '12160'), SPIELER, 0.99);
    assert.equal(e[0]?.aktion, 'rueckfrage');
  });
});

describe('bewerteRunde - Doppelzuordnung', () => {
  /*
     Der subtilste Fall. Zwei Zeilen, die auf dieselbe Person zeigen: in
     einer Lobby steht jeder genau einmal, also ist eine falsch gelesen.
     Wuerde nur eine davon eintragen, bekaeme jemand eine fremde Punktzahl
     in den Schnitt - und niemand wuerde es merken.
  */
  test('haelt beide Zeilen zurueck, wenn sie auf dieselbe Person zeigen', () => {
    const r = runde('NorikoTv\nN0rikoTv', '12160\n8000');
    assert.equal(r.einzutragen.length, 0);
    assert.equal(r.rueckfragen.length, 2);
    for (const rf of r.rueckfragen) {
      assert.match(rf.grund!, /Mehrere Zeilen zeigen auf NorikoTv/);
    }
  });

  test('laesst die anderen Zeilen derselben Runde trotzdem durch', () => {
    const r = runde('NorikoTv\nN0rikoTv\nPolosios', '12160\n8000\n10579');
    assert.equal(r.einzutragen.length, 1);
    assert.equal(personVon(r.einzutragen[0]!)?.name, 'Polosios');
    assert.equal(r.rueckfragen.length, 2);
  });
});

describe('teileAuf', () => {
  test('verliert keine Zeile', () => {
    const zeilen = parseZeilen(
      'NorikoTv\nQw3rty\nPolosios\nMuell',
      '12160\n450\n10579\nxyz'
    );
    const e = bewerteRunde(zeilen, SPIELER);
    const r = teileAuf(e);
    assert.equal(r.einzutragen.length + r.rueckfragen.length, 4);
  });

  test('kommt mit einer leeren Runde zurecht', () => {
    const r = teileAuf(bewerteRunde([], SPIELER));
    assert.equal(r.einzutragen.length, 0);
    assert.equal(r.rueckfragen.length, 0);
  });
});

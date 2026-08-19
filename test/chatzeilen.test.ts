import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { pruefeAntwort, alsRohZeilen } from '../src/leser.js';
import { bewerteRunde, teileAuf } from '../src/runde.js';
import type { KarteiPerson } from '../src/namen.js';

/* =========================================================================
   Meccha blendet Spielchat ein ("Thingy hat dir ein X gegeben"). Liegt so
   eine Zeile zufaellig im ausgewerteten Streifen, wurde sie frueher als
   Ranglisteneintrag gelesen - mit "geben" als Punktzahl.

   Gefiltert wird im Python-Leser (kann_zahl_sein). Hier wird die
   TypeScript-Seite geprueft: was trotzdem durchkommt, darf keinesfalls
   gewertet werden.

   Die Beispiele stammen aus echten Screenshots.
   ========================================================================= */

const KARTEI: readonly KarteiPerson[] = [
  { id: 'p1', name: 'Baloou', aliases: [] },
  { id: 'p2', name: 'Thingy', aliases: [] },
  { id: 'p3', name: 'Taur131', aliases: [] }
];

function lies(zeilen: Array<{ name: string; rohPunkte: string | null }>) {
  return alsRohZeilen(pruefeAntwort(JSON.stringify({ zeilen })));
}

describe('Chatzeilen landen nicht in der Wertung', () => {
  test('Fremdtext als Punktzahl wird nicht gewertet', () => {
    // Der echte Fall: "geben" stand in der Punktespalte.
    const zeilen = lies([
      { name: 'Baloou', rohPunkte: '2614' },
      { name: 'Thingy hat dir ein .Eevan', rohPunkte: 'geben' }
    ]);
    const bericht = teileAuf(bewerteRunde(zeilen, KARTEI));

    assert.equal(bericht.einzutragen.length, 1);
    assert.equal(bericht.einzutragen[0]?.zeile.rohName, 'Baloou');
  });

  test('die Chatzeile wird als Rueckfrage sichtbar, nicht verschluckt', () => {
    // Verschwinden waere schlechter als auffallen - sonst merkt niemand,
    // dass da etwas Fremdes im Bild lag.
    const zeilen = lies([{ name: 'Thingy hat dir ein .Eevan', rohPunkte: 'geben' }]);
    const bericht = teileAuf(bewerteRunde(zeilen, KARTEI));

    assert.equal(bericht.einzutragen.length, 0);
    assert.equal(bericht.rueckfragen.length, 1);
    assert.match(bericht.rueckfragen[0]!.grund!, /nicht lesbar/);
  });
});

describe('Verlesene Ziffern bleiben erhalten', () => {
  /*
     Ein zu strenger Filter hat beim Testen echte Spieler verschluckt:
     "44B" ist 448 mit einem verlesenen B. Solche Zeilen muessen in die
     Rueckfrage, nicht ins Nichts.
  */
  test('B statt 8 wird umgewandelt und als unsicher markiert', () => {
    const zeilen = lies([{ name: 'Taur131', rohPunkte: '44B' }]);
    assert.equal(zeilen[0]?.punkte?.punkte, 448);
    assert.equal(zeilen[0]?.punkte?.unsicher, true);
  });

  test('so eine Zeile geht in die Rueckfrage, nicht in die Wertung', () => {
    const bericht = teileAuf(bewerteRunde(lies([
      { name: 'Taur131', rohPunkte: '44B' }
    ]), KARTEI));

    assert.equal(bericht.einzutragen.length, 0);
    assert.equal(bericht.rueckfragen.length, 1);
    assert.match(bericht.rueckfragen[0]!.grund!, /Zeichenersetzung/);
  });

  test('ein einzelnes B ist eine 8', () => {
    const zeilen = lies([{ name: 'Zideric', rohPunkte: 'B' }]);
    assert.equal(zeilen[0]?.punkte?.punkte, 8);
    assert.equal(zeilen[0]?.punkte?.unsicher, true);
  });

  test('saubere Zahlen bleiben sicher', () => {
    const zeilen = lies([{ name: 'Baloou', rohPunkte: '2 614' }]);
    assert.equal(zeilen[0]?.punkte?.punkte, 2614);
    assert.equal(zeilen[0]?.punkte?.unsicher, false);
  });
});

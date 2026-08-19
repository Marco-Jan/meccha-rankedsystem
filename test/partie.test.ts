import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ladeFreigabeliste, rundenKennung, type Freigabeliste } from '../src/freigabe.js';
import { nameKey } from '../src/namen.js';
import type { RohZeile } from '../src/parse.js';

/* =========================================================================
   Zwei Leute aus derselben Lobby schicken dasselbe Scoreboard ein - beide
   mit einem echten Bild. Der Bild-Hash hilft da nicht (verschiedene
   Pixel), also muss der INHALT die Partie identifizieren.

   Die Regel lautet: "ein SPIELER aus einer Partie zaehlt einmal" - nicht
   "eine Partie zaehlt einmal". Der Unterschied ist entscheidend: sitzen
   drei Zuschauer in derselben Lobby und schickt jeder sein eigenes
   Ergebnis, muessen alle drei durchkommen.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-partie-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

let n = 0;
let liste: Freigabeliste;
beforeEach(() => { liste = ladeFreigabeliste(path.join(ORDNER, 'l-' + (++n) + '.json')); });

function zeile(name: string, punkte: number | null): RohZeile {
  return {
    zeile: 1,
    rohName: name,
    rohPunkte: punkte === null ? '' : String(punkte),
    punkte: punkte === null ? null : { punkte, unsicher: false }
  };
}

/** Die echte Lobby aus dem Screenshot. */
const LOBBY: RohZeile[] = [
  zeile('Jones', 2771), zeile('P.silli', 2590), zeile('diefetteKugel', 1165),
  zeile('TREV', 922), zeile('A.i.R.o', 792), zeile('tortasieturla', 681),
  zeile('lucas stuttard', 608), zeile('Jaydoon123', 441),
  zeile('Axolotl', 286), zeile('mj', 239)
];

/** Reicht eine Runde ein und beansprucht die genannten Spieler. */
function einreichen(absender: string, beansprucht: string[], hash: string, zeilen = LOBBY) {
  return liste.hinzufuegen({
    eingegangen: Date.now(),
    quelle: 'zuschauer',
    absender,
    bildPfad: 'C:/irgendwo/' + hash + '.png',
    bildHash: hash,
    zeilen,
    kennung: rundenKennung(zeilen),
    beansprucht: beansprucht.map(nameKey)
  });
}

describe('rundenKennung', () => {
  test('erzeugt fuer dieselbe Lobby dieselbe Kennung', () => {
    assert.equal(rundenKennung(LOBBY), rundenKennung([...LOBBY]));
  });

  test('ist unabhaengig von der Zeilenreihenfolge', () => {
    assert.equal(rundenKennung(LOBBY), rundenKennung([...LOBBY].reverse()));
  });

  /*
     Der wichtigste Test: Namen werden nicht immer gleich gelesen
     ("A.i.R.0" statt "A.i.R.o", "Iucas" statt "lucas"). Die Kennung darf
     daran nicht haengen - sonst gaelte dieselbe Partie als zwei
     verschiedene, nur weil ein Buchstabe anders erkannt wurde.
  */
  test('ist unabhaengig von Lesefehlern in den Namen', () => {
    const andersGelesen = LOBBY.map((z, i) =>
      i === 4 ? zeile('A.i.R.0', 792) : i === 6 ? zeile('Iucas stuttard', 608) : z);
    assert.equal(rundenKennung(LOBBY), rundenKennung(andersGelesen));
  });

  test('unterscheidet verschiedene Partien', () => {
    const andere = LOBBY.map((z, i) => (i === 0 ? zeile('Jones', 9999) : z));
    assert.notEqual(rundenKennung(LOBBY), rundenKennung(andere));
  });

  test('gibt nichts zurueck, wenn zu wenig lesbar war', () => {
    assert.equal(rundenKennung([zeile('Jones', 2771)]), '');
    assert.equal(rundenKennung([zeile('Jones', 2771), zeile('mj', 239)]), '');
    assert.notEqual(rundenKennung(LOBBY.slice(0, 3)), '');
  });
});

describe('Ein Spieler aus einer Partie zaehlt einmal', () => {
  /*
     Der Fall, um den es geht: SpielerA und SpielerB sitzen in derselben
     Lobby und schicken beide ihr Ergebnis ein. Beide Bilder sind echt.
  */
  test('drei Zuschauer aus einer Lobby kommen alle durch', () => {
    einreichen('SpielerA', ['Jones'], 'bild-a');
    const kennung = rundenKennung(LOBBY);

    // B und C beanspruchen andere Zeilen - nichts kollidiert.
    assert.deepEqual(liste.schonGewertet(kennung, [nameKey('P.silli')]), []);
    assert.deepEqual(liste.schonGewertet(kennung, [nameKey('mj')]), []);
  });

  test('derselbe Spieler ein zweites Mal wird erkannt', () => {
    einreichen('SpielerA', ['Jones'], 'bild-a');
    const treffer = liste.schonGewertet(rundenKennung(LOBBY), [nameKey('Jones')]);
    assert.equal(treffer.length, 1);
    assert.equal(treffer[0]?.runde.absender, 'SpielerA');
  });

  test('erkennt ihn auch bei abweichender Schreibweise', () => {
    einreichen('SpielerA', ['Jones'], 'bild-a');
    // nameKey zieht Gross/Klein und doppelte Leerzeichen zusammen.
    assert.equal(liste.schonGewertet(rundenKennung(LOBBY), [nameKey('JONES')]).length, 1);
  });

  test('eine andere Partie kollidiert nicht', () => {
    einreichen('SpielerA', ['Jones'], 'bild-a');
    const andere = LOBBY.map((z, i) => (i === 0 ? zeile('Jones', 3333) : z));
    assert.deepEqual(liste.schonGewertet(rundenKennung(andere), [nameKey('Jones')]), []);
  });

  /*
     Die eigene Aufnahme erfasst die ganze Lobby. Danach darf kein
     Zuschauer aus derselben Lobby nochmal einschicken - sonst haette er
     seine Punkte zweimal.
  */
  test('nach einer eigenen Aufnahme ist die ganze Lobby belegt', () => {
    const alle = LOBBY.map((z) => z.rohName);
    einreichen('Spiel-PC', alle, 'eigene-aufnahme');

    const kennung = rundenKennung(LOBBY);
    for (const name of ['Jones', 'mj', 'TREV']) {
      assert.equal(liste.schonGewertet(kennung, [nameKey(name)]).length, 1,
        name + ' sollte belegt sein');
    }
  });

  /*
     Wichtige Ausnahme: war die erste Einsendung eine Faelschung und wurde
     abgelehnt, muss eine echte danach durchkommen. Sonst koennte jemand
     eine Partie blockieren, indem er sie zuerst gefaelscht einschickt.
  */
  test('eine abgelehnte Einsendung blockiert nicht', () => {
    const erste = einreichen('Schummler', ['Jones'], 'faelschung');
    liste.entscheiden(erste.runde.id, 'abgelehnt', 'Baloou', 'nachbearbeitet');

    assert.deepEqual(liste.schonGewertet(rundenKennung(LOBBY), [nameKey('Jones')]), []);
  });

  test('eine freigegebene Einsendung blockiert weiterhin', () => {
    const erste = einreichen('SpielerA', ['Jones'], 'bild-a');
    liste.entscheiden(erste.runde.id, 'freigegeben', 'Baloou');
    assert.equal(liste.schonGewertet(rundenKennung(LOBBY), [nameKey('Jones')]).length, 1);
  });

  test('eine offene Einsendung blockiert ebenfalls', () => {
    // Sonst koennte man dieselbe Zeile mehrfach in die Warteschlange
    // legen und darauf hoffen, dass zweimal freigegeben wird.
    einreichen('SpielerA', ['Jones'], 'bild-a');
    assert.equal(liste.schonGewertet(rundenKennung(LOBBY), [nameKey('Jones')]).length, 1);
  });

  test('ohne Kennung wird nichts gefunden', () => {
    einreichen('SpielerA', ['Jones'], 'bild-a');
    assert.deepEqual(liste.schonGewertet('', [nameKey('Jones')]), []);
  });

  test('ohne beanspruchte Namen wird nichts gefunden', () => {
    einreichen('SpielerA', ['Jones'], 'bild-a');
    assert.deepEqual(liste.schonGewertet(rundenKennung(LOBBY), []), []);
  });
});

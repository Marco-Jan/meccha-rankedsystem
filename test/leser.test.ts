import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  pruefeAntwort, alsRohZeilen, leseListe, ModellAntwortUnbrauchbar
} from '../src/leser.js';
import { bewerteRunde, teileAuf, personVon } from '../src/runde.js';
import type { KarteiPerson } from '../src/namen.js';

/*
   Die Namen aus dem echten Screenshot (Pictures/heseder.JPG). Genau diese
   Zeilen muss die Kette verkraften - inklusive "Albert Wesker's Balls" mit
   Leerzeichen und Apostroph und "11 714" mit Leerzeichen als Trenner.
*/
const ECHTE_ANTWORT = JSON.stringify([
  { name: 'Skylit', rohPunkte: '11 714' },
  { name: 'Hioriy', rohPunkte: '975' },
  { name: 'Baloou', rohPunkte: '2 614' },
  { name: 'David', rohPunkte: '672' },
  { name: "Albert Wesker's Balls", rohPunkte: '587' },
  { name: 'kobikeinnobi', rohPunkte: '327' },
  { name: 'Faust', rohPunkte: '168' },
  { name: 'HmmMeryam', rohPunkte: '99' }
]);

describe('pruefeAntwort - der gute Fall', () => {
  test('liest die Zeilen aus dem echten Screenshot', () => {
    const zeilen = pruefeAntwort(ECHTE_ANTWORT);
    assert.equal(zeilen.length, 8);
    assert.equal(zeilen[0]?.name, 'Skylit');
    assert.equal(zeilen[0]?.rohPunkte, '11 714');
    assert.equal(zeilen[4]?.name, "Albert Wesker's Balls");
  });

  test('schaelt einen Markdown-Zaun weg', () => {
    // Kostet zwei Zeilen Code und rettet sonst eine ganze Runde.
    const mitZaun = '```json\n' + ECHTE_ANTWORT + '\n```';
    assert.equal(pruefeAntwort(mitZaun).length, 8);
  });

  test('schaelt auch einen Zaun ohne Sprachangabe weg', () => {
    assert.equal(pruefeAntwort('```\n' + ECHTE_ANTWORT + '\n```').length, 8);
  });

  test('trimmt Namen', () => {
    const zeilen = pruefeAntwort('[{"name":"  Skylit  ","rohPunkte":"100"}]');
    assert.equal(zeilen[0]?.name, 'Skylit');
  });

  test('kommt mit einer leeren Liste zurecht', () => {
    assert.deepEqual(pruefeAntwort('[]'), []);
  });
});

describe('pruefeAntwort - rohPunkte null', () => {
  test('laesst null durch, statt die Zeile wegzuwerfen', () => {
    // Wichtig: die Zeile muss sichtbar bleiben, damit sie als Rueckfrage
    // beim Menschen landet und nicht still verschwindet.
    const zeilen = pruefeAntwort('[{"name":"David","rohPunkte":null}]');
    assert.equal(zeilen.length, 1);
    assert.equal(zeilen[0]?.rohPunkte, null);
  });

  test('behandelt fehlendes rohPunkte wie null', () => {
    const zeilen = pruefeAntwort('[{"name":"David"}]');
    assert.equal(zeilen[0]?.rohPunkte, null);
  });

  test('macht aus unbrauchbaren Typen null statt eines Wertes', () => {
    const zeilen = pruefeAntwort('[{"name":"David","rohPunkte":{"a":1}}]');
    assert.equal(zeilen[0]?.rohPunkte, null);
  });

  test('akzeptiert eine Zahl, obwohl Text angefordert war', () => {
    const zeilen = pruefeAntwort('[{"name":"Skylit","rohPunkte":11714}]');
    assert.equal(zeilen[0]?.rohPunkte, '11714');
  });
});

describe('pruefeAntwort - Ablehnung', () => {
  test('lehnt kaputtes JSON ab', () => {
    assert.throws(() => pruefeAntwort('das hier ist Prosa'), ModellAntwortUnbrauchbar);
    assert.throws(() => pruefeAntwort('[{"name":'), ModellAntwortUnbrauchbar);
  });

  test('lehnt etwas ab, das keine Liste ist', () => {
    assert.throws(() => pruefeAntwort('{"name":"Skylit"}'), ModellAntwortUnbrauchbar);
    assert.throws(() => pruefeAntwort('"Skylit"'), ModellAntwortUnbrauchbar);
  });

  test('lehnt Eintraege ohne brauchbaren Namen ab', () => {
    assert.throws(() => pruefeAntwort('[{"rohPunkte":"100"}]'), ModellAntwortUnbrauchbar);
    assert.throws(() => pruefeAntwort('[{"name":"","rohPunkte":"100"}]'), ModellAntwortUnbrauchbar);
    assert.throws(() => pruefeAntwort('[{"name":"   "}]'), ModellAntwortUnbrauchbar);
    assert.throws(() => pruefeAntwort('[{"name":42}]'), ModellAntwortUnbrauchbar);
  });

  test('behaelt die Rohantwort am Fehler, damit man nachsehen kann', () => {
    try {
      pruefeAntwort('Ich sehe eine Rangliste mit acht Spielern.');
      assert.fail('haette werfen muessen');
    } catch (err) {
      assert.ok(err instanceof ModellAntwortUnbrauchbar);
      assert.match(err.rohAntwort, /acht Spielern/);
    }
  });
});

describe('alsRohZeilen', () => {
  test('entfernt Leerzeichen als Tausendertrenner', () => {
    // Der Trenner im Spiel ist ein Leerzeichen: "11 714".
    const zeilen = alsRohZeilen(pruefeAntwort(ECHTE_ANTWORT));
    assert.equal(zeilen[0]?.punkte?.punkte, 11714);
    assert.equal(zeilen[0]?.punkte?.unsicher, false);
    assert.equal(zeilen[2]?.punkte?.punkte, 2614);
  });

  test('macht aus null-Punkten eine unlesbare Zeile', () => {
    const zeilen = alsRohZeilen([{ name: 'David', rohPunkte: null }]);
    assert.equal(zeilen[0]?.punkte, null);
  });

  test('numeriert die Zeilen ab 1', () => {
    const zeilen = alsRohZeilen(pruefeAntwort(ECHTE_ANTWORT));
    assert.deepEqual(zeilen.slice(0, 3).map((z) => z.zeile), [1, 2, 3]);
  });
});

describe('leseListe - Kette mit einem festen Modell', () => {
  /** Statt einer echten API: eine feste Antwort. Kein Key, kein Netz. */
  const festesModell = (antwort: string) => async () => antwort;

  test('liest ein Bild bis zu RohZeilen durch', async () => {
    const zeilen = await leseListe(Buffer.from('egal'), 'image/png', festesModell(ECHTE_ANTWORT));
    assert.equal(zeilen.length, 8);
    assert.equal(zeilen[0]?.punkte?.punkte, 11714);
  });

  test('gibt den Bildpuffer und den Medientyp weiter', async () => {
    let gesehen: { typ?: string; groesse?: number } = {};
    await leseListe(Buffer.from('abc'), 'image/jpeg', async (bild, typ) => {
      gesehen = { typ, groesse: bild.length };
      return '[]';
    });
    assert.equal(gesehen.typ, 'image/jpeg');
    assert.equal(gesehen.groesse, 3);
  });
});

describe('leseListe - bis in die Punkteliste', () => {
  /*
     Der wichtigste Test der Datei: vom Modell bis zur Entscheidung. Die
     Kartei kennt nur drei der acht Namen aus dem Screenshot - der Rest muss
     zur Rueckfrage, nicht als neuer Spieler angelegt werden.
  */
  const KARTEI: readonly KarteiPerson[] = [
    { id: 'r_qjfcfog', name: 'NorikoTv' },
    { id: 'r_zbpxa3z', name: 'Polosios' },
    { id: 'r_cp141h1', name: 'theRealBaloou' }
  ];

  test('traegt nur bekannte Namen ein, der Rest wird Rueckfrage', async () => {
    const zeilen = await leseListe(Buffer.from(''), 'image/png', async () => ECHTE_ANTWORT);
    const bericht = teileAuf(bewerteRunde(zeilen, KARTEI));

    // "Baloou" ist NICHT "theRealBaloou" - Distanz 7, viel zu weit.
    // Kein einziger Name aus dem Screenshot ist in der Kartei.
    assert.equal(bericht.einzutragen.length, 0);
    assert.equal(bericht.rueckfragen.length, 8);
  });

  test('traegt ein, sobald der Name in der Kartei steht', async () => {
    const mitBaloou = [...KARTEI, { id: 'r_neu', name: 'Baloou' }];
    const zeilen = await leseListe(Buffer.from(''), 'image/png', async () => ECHTE_ANTWORT);
    const bericht = teileAuf(bewerteRunde(zeilen, mitBaloou));

    assert.equal(bericht.einzutragen.length, 1);
    const e = bericht.einzutragen[0]!;
    assert.equal(personVon(e)?.name, 'Baloou');
    assert.equal(e.zeile.punkte?.punkte, 2614);
  });

  test('haelt eine Zeile mit null-Punkten zurueck, auch bei bekanntem Namen', async () => {
    const antwort = JSON.stringify([{ name: 'Baloou', rohPunkte: null }]);
    const zeilen = await leseListe(Buffer.from(''), 'image/png', async () => antwort);
    const bericht = teileAuf(bewerteRunde(zeilen, [{ id: 'r_neu', name: 'Baloou' }]));

    assert.equal(bericht.einzutragen.length, 0);
    assert.match(bericht.rueckfragen[0]!.grund!, /nicht lesbar/);
  });
});

describe('pruefeAntwort - Schutz gegen entgleiste Antworten', () => {
  /*
     Echter Vorfall beim Testen: auf einem Bildschirm OHNE Rangliste hat das
     Modell eine erfunden (Resident-Evil-Figuren) und sich dann in einer
     Zeile festgefahren, die es elfmal wiederholt hat. Beides wird hier
     strukturell abgefangen - nicht erst dadurch, dass die Namen zufaellig
     nicht in der Kartei stehen.
  */
  function viele(anzahl: number, name = 'Spieler') {
    return JSON.stringify({
      zeilen: Array.from({ length: anzahl }, (_, i) => ({
        name: name + i, rohPunkte: String(1000 - i)
      }))
    });
  }

  test('laesst eine volle 10er-Lobby durch', () => {
    assert.equal(pruefeAntwort(viele(10)).length, 10);
  });

  test('laesst 12 Zeilen gerade noch durch (Luft fuer eine Kopfzeile)', () => {
    assert.equal(pruefeAntwort(viele(12)).length, 12);
  });

  test('verwirft mehr Zeilen, als eine Lobby haben kann', () => {
    assert.throws(
      () => pruefeAntwort(viele(20)),
      (err: unknown) => {
        assert.ok(err instanceof ModellAntwortUnbrauchbar);
        assert.match(err.message, /hoechstens 10/);
        return true;
      }
    );
  });

  test('verwirft die GANZE Antwort, nicht nur die ueberzaehligen Zeilen', () => {
    // Die ersten zehn zu nehmen waere gefaehrlich: wenn das Modell hier
    // danebenliegt, ist auch der Anfang nicht vertrauenswuerdig.
    assert.throws(() => pruefeAntwort(viele(20)), ModellAntwortUnbrauchbar);
  });

  test('verwirft eine Antwort, die sich in einer Zeile festgefahren hat', () => {
    const fest = JSON.stringify({ zeilen: [
      { name: 'Skylit', rohPunkte: '11 714' },
      { name: 'Carlos Oliveira', rohPunkte: '5 600' },
      { name: 'Carlos Oliveira', rohPunkte: '5 600' },
      { name: 'Carlos Oliveira', rohPunkte: '5 600' }
    ] });
    assert.throws(
      () => pruefeAntwort(fest),
      (err: unknown) => {
        assert.ok(err instanceof ModellAntwortUnbrauchbar);
        assert.match(err.message, /festgefahren/);
        return true;
      }
    );
  });

  test('laesst denselben Namen zweimal durch - das klaert die Rueckfrage', () => {
    // Zweimal kann ein echter Lesefehler sein (kobikeinnobi im echten
    // Screenshot). Erst ab dreimal ist es ein Festfahren.
    const zweimal = JSON.stringify({ zeilen: [
      { name: 'kobikeinnobi', rohPunkte: '327' },
      { name: 'kobikeinnobi', rohPunkte: '74' }
    ] });
    assert.equal(pruefeAntwort(zweimal).length, 2);
  });

  test('akzeptiert eine leere Liste als gueltige Antwort', () => {
    // "Keine Rangliste im Bild" ist eine richtige Antwort, kein Fehler.
    assert.deepEqual(pruefeAntwort('{"zeilen": []}'), []);
  });
});

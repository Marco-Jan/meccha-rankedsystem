import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  nameKey, hartNormalisiert, levenshtein, ordneZu, istSicher,
  type KarteiPerson
} from '../src/namen.js';

/*
   Die echten Namen aus turnier/data/spieler.json. Absichtlich diese und
   keine erfundenen: der Abgleich muss gegen die Kartei funktionieren, die
   wirklich da ist.
*/
const KARTEI: readonly KarteiPerson[] = [
  { id: 'r_qjfcfog', name: 'NorikoTv' },
  { id: 'r_zbpxa3z', name: 'Polosios' },
  { id: 'r_cp141h1', name: 'theRealBaloou' }
];

describe('nameKey - muss zeichengleich zu turnier/kartei.js:37 bleiben', () => {
  test('erzeugt genau die keys, die in spieler.json stehen', () => {
    // Diese Paare sind aus der echten spieler.json abgelesen. Gehen sie
    // kaputt, findet der Feeder bestehende Spieler nicht mehr.
    assert.equal(nameKey('NorikoTv'), 'norikotv');
    assert.equal(nameKey('Polosios'), 'polosios');
    assert.equal(nameKey('theRealBaloou'), 'therealbaloou');
  });

  test('trimmt und zieht Leerzeichen zusammen', () => {
    assert.equal(nameKey('  Noriko   Tv  '), 'noriko tv');
  });

  test('laesst Satzzeichen und Deko stehen - anders als hartNormalisiert', () => {
    // Genau hier unterscheiden sich die beiden Formen. Wuerde nameKey
    // Satzzeichen wegwerfen, waere es nicht mehr die Form des Servers.
    assert.equal(nameKey('Baloou!'), 'baloou!');
    assert.equal(nameKey('xX_Name_Xx'), 'xx_name_xx');
  });
});

describe('hartNormalisiert', () => {
  test('wirft Deko weg', () => {
    assert.equal(hartNormalisiert('xX_Baloou_Xx'), 'xxbaloouxx');
    assert.equal(hartNormalisiert('Baloou!'), 'baloou');
    assert.equal(hartNormalisiert('No ri ko'), 'noriko');
  });

  test('behaelt Umlaute und nichtlateinische Schrift', () => {
    // "mller" waere ein anderer Mensch.
    assert.equal(hartNormalisiert('Müller'), 'müller');
    assert.equal(hartNormalisiert('さくら'), 'さくら');
  });

  test('zieht Breitschrift auf die Normalform (NFKC)', () => {
    assert.equal(hartNormalisiert('Ｂａｌｏｏｕ'), 'baloou');
  });

  test('wird bei reiner Deko leer', () => {
    assert.equal(hartNormalisiert('★☆★'), '');
    assert.equal(hartNormalisiert('___'), '');
  });
});

describe('levenshtein', () => {
  test('kennt die Grundfaelle', () => {
    assert.equal(levenshtein('', ''), 0);
    assert.equal(levenshtein('abc', 'abc'), 0);
    assert.equal(levenshtein('abc', ''), 3);
    assert.equal(levenshtein('', 'abc'), 3);
  });

  test('zaehlt einzelne Aenderungen', () => {
    assert.equal(levenshtein('norikotv', 'n0rikotv'), 1);   // ersetzen
    assert.equal(levenshtein('norikotv', 'norikot'), 1);    // loeschen
    assert.equal(levenshtein('norikotv', 'norikotvx'), 1);  // einfuegen
    assert.equal(levenshtein('kitten', 'sitting'), 3);
  });

  test('bricht ueber der Obergrenze ab, ohne zu luegen', () => {
    // Ueber der Grenze ist nur garantiert, dass das Ergebnis groesser ist.
    assert.ok(levenshtein('abcdef', 'uvwxyz', 2) > 2);
    // Innerhalb der Grenze muss der Wert exakt stimmen.
    assert.equal(levenshtein('norikotv', 'n0rikotv', 2), 1);
  });
});

describe('ordneZu - Stufe 1: exakt', () => {
  test('trifft bei identischem Namen', () => {
    const z = ordneZu('NorikoTv', KARTEI);
    assert.equal(z.art, 'exakt');
    assert.ok(istSicher(z));
    if (z.art === 'exakt') assert.equal(z.person.id, 'r_qjfcfog');
  });

  test('trifft trotz anderer Gross-/Kleinschreibung', () => {
    const z = ordneZu('NORIKOTV', KARTEI);
    assert.equal(z.art, 'exakt');
  });
});

describe('ordneZu - Stufe 2: normalisiert', () => {
  test('findet den Namen hinter der Deko', () => {
    const z = ordneZu('theRealBaloou!', KARTEI);
    assert.equal(z.art, 'normalisiert');
    assert.ok(istSicher(z));
    if (z.art === 'normalisiert') {
      assert.equal(z.person.name, 'theRealBaloou');
      // Eingetragen wird der Kartei-Name, nicht der Rohname.
      assert.notEqual(z.person.name, 'theRealBaloou!');
    }
  });

  test('meldet mehrdeutig, wenn zwei Karteinamen sich nur in Deko unterscheiden', () => {
    const zwei: KarteiPerson[] = [
      { id: 'a', name: 'Baloou' },
      { id: 'b', name: 'B_a_l_o_o_u' }
    ];
    const z = ordneZu('Baloou', zwei);
    // Stufe 1 trifft "Baloou" exakt - Deko-Kollisionen erst danach.
    assert.equal(z.art, 'exakt');

    const z2 = ordneZu('Baloou!', zwei);
    assert.equal(z2.art, 'mehrdeutig');
    assert.equal(istSicher(z2), false);
  });
});

describe('ordneZu - Stufe 3: fuzzy', () => {
  test('faengt den klassischen OCR-Fehler O statt 0 ab', () => {
    const z = ordneZu('N0rikoTv', KARTEI);   // 8 Zeichen -> Distanz 1 erlaubt
    assert.equal(z.art, 'fuzzy');
    assert.ok(istSicher(z));
    if (z.art === 'fuzzy') {
      assert.equal(z.person.name, 'NorikoTv');
      assert.equal(z.distanz, 1);
      assert.ok(z.confidence < 1);
    }
  });

  test('erlaubt bei langen Namen zwei Fehler', () => {
    // theRealBaloou hart = 13 Zeichen -> Distanz 2 erlaubt
    const z = ordneZu('theRea1Ba1oou', KARTEI);
    assert.equal(z.art, 'fuzzy');
    if (z.art === 'fuzzy') assert.equal(z.person.name, 'theRealBaloou');
  });

  test('verweigert bei kurzen Namen jede Abweichung', () => {
    // Der wichtigste Test hier: Tom und Tim sind verschiedene Leute, auch
    // wenn sie nur 1 auseinanderliegen.
    const kurz: KarteiPerson[] = [{ id: 'a', name: 'Tom' }];
    const z = ordneZu('Tim', kurz);
    assert.equal(z.art, 'unbekannt');
    assert.equal(istSicher(z), false);
  });

  test('raet nicht, wenn zwei Kandidaten gleich nah sind', () => {
    const aehnlich: KarteiPerson[] = [
      { id: 'a', name: 'Spielerin' },
      { id: 'b', name: 'Spielerix' }
    ];
    const z = ordneZu('Spieleriy', aehnlich);
    assert.equal(z.art, 'mehrdeutig');
    assert.equal(istSicher(z), false);
    if (z.art === 'mehrdeutig') assert.equal(z.kandidaten.length, 2);
  });
});

describe('ordneZu - unbekannt', () => {
  test('meldet unbekannt bei echtem Fremdnamen', () => {
    const z = ordneZu('Qw3rty', KARTEI);
    assert.equal(z.art, 'unbekannt');
    assert.equal(istSicher(z), false);
  });

  test('meldet unbekannt bei reiner Deko', () => {
    const z = ordneZu('★☆★', KARTEI);
    assert.equal(z.art, 'unbekannt');
  });

  test('meldet unbekannt bei leerer Kartei', () => {
    assert.equal(ordneZu('NorikoTv', []).art, 'unbekannt');
  });
});

describe('ordneZu - Aliase', () => {
  /*
     Der Normalfall im Betrieb: die Kartei fuehrt den Twitch-Namen, im Spiel
     steht ein anderer. Levenshtein hilft nicht (theRealBaloou <-> Baloou
     ist Distanz 7), nur der Alias.

     Die Aliase stehen im Server schon in nameKey-Form - siehe
     turnier/kartei.js:99 und :120.
  */
  const MIT_ALIAS: readonly KarteiPerson[] = [
    { id: 'r_cp141h1', name: 'theRealBaloou', aliases: ['baloou'] },
    { id: 'r_qjfcfog', name: 'NorikoTv', aliases: [] }
  ];

  test('findet die Person ueber ihren Alias', () => {
    const z = ordneZu('Baloou', MIT_ALIAS);
    assert.equal(z.art, 'exakt');
    if (z.art === 'exakt') assert.equal(z.person.name, 'theRealBaloou');
  });

  test('findet den Alias auch bei anderer Schreibweise', () => {
    assert.equal(ordneZu('BALOOU', MIT_ALIAS).art, 'exakt');
    assert.equal(ordneZu('  baloou  ', MIT_ALIAS).art, 'exakt');
  });

  test('findet den Alias auch mit Deko dran', () => {
    const z = ordneZu('Baloou!', MIT_ALIAS);
    assert.equal(z.art, 'normalisiert');
    if (z.art === 'normalisiert') assert.equal(z.person.name, 'theRealBaloou');
  });

  test('findet den Alias auch mit einem Lesefehler', () => {
    // "baloou" ist 6 Zeichen -> Distanz 1 erlaubt
    const z = ordneZu('Ba1oou', MIT_ALIAS);
    assert.equal(z.art, 'fuzzy');
    if (z.art === 'fuzzy') assert.equal(z.person.name, 'theRealBaloou');
  });

  test('findet den Hauptnamen weiterhin', () => {
    const z = ordneZu('theRealBaloou', MIT_ALIAS);
    assert.equal(z.art, 'exakt');
    if (z.art === 'exakt') assert.equal(z.person.name, 'theRealBaloou');
  });

  test('funktioniert ohne aliases-Feld weiter (aeltere Serverfassung)', () => {
    // Faellt das Feld weg, ist das die alte Lage - kein Absturz.
    const ohne: KarteiPerson[] = [{ id: 'a', name: 'theRealBaloou' }];
    assert.equal(ordneZu('theRealBaloou', ohne).art, 'exakt');
    assert.equal(ordneZu('Baloou', ohne).art, 'unbekannt');
  });

  test('gibt der Person mit passendem Alias den Vorzug vor einem Fuzzy-Treffer', () => {
    const beide: KarteiPerson[] = [
      { id: 'a', name: 'Skylit', aliases: [] },
      { id: 'b', name: 'Zweiter', aliases: ['skylitt'] }
    ];
    // "Skylit" trifft a exakt, nicht b ueber den Alias.
    const z = ordneZu('Skylit', beide);
    assert.equal(z.art, 'exakt');
    if (z.art === 'exakt') assert.equal(z.person.id, 'a');
  });
});

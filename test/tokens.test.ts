import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ladeTokens, Tokenliste, brauchtFreigabe,
  ABSTAND_FEHLSCHLAG_MS, ABSTAND_ANGENOMMEN_MS
} from '../src/tokens.js';

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-tokens-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

let n = 0;
const frisch = () => path.join(ORDNER, 'tokens-' + (++n) + '.json');

describe('Tokens - anlegen', () => {
  let liste: Tokenliste;
  beforeEach(() => { liste = ladeTokens(frisch()); });

  test('legt einen Token mit Namen an', () => {
    const t = liste.anlegen('NorikoTv', false, 'Jones');
    assert.equal(t.name, 'NorikoTv');
    assert.equal(t.vertraut, false);
    assert.ok(t.token.length >= 30);
  });

  test('vergibt jedes Mal einen anderen Token', () => {
    const a = liste.anlegen('A', false, 'Jones').token;
    const b = liste.anlegen('B', false, 'mj').token;
    assert.notEqual(a, b);
  });

  test('kennt vertraute Tokens fuer eigene Rechner', () => {
    assert.equal(liste.anlegen('Spiel-PC', true).vertraut, true);
  });

  test('verlangt einen Namen', () => {
    // Ein Token ohne Namen waere in der Freigabeliste nicht zuzuordnen.
    assert.throws(() => liste.anlegen('   ', false, 'Jones'));
  });

  /*
     Ohne Ingame-Namen wuesste der Server nicht, welche Zeile aus dem
     Scoreboard er werten soll. Lieber hier scheitern als spaeter
     stillschweigend nichts eintragen.
  */
  test('ein Zuschauer-Token verlangt den Ingame-Namen', () => {
    assert.throws(() => liste.anlegen('NorikoTv'), /Ingame-Namen/);
    assert.throws(() => liste.anlegen('NorikoTv', false, '  '), /Ingame-Namen/);
  });

  test('ein vertrauter Token braucht keinen - er erfasst die ganze Lobby', () => {
    const t = liste.anlegen('Spiel-PC', true);
    assert.equal(t.vertraut, true);
    assert.equal(t.ingameName, undefined);
  });

  test('merkt sich den Ingame-Namen', () => {
    assert.equal(liste.anlegen('Nori', false, 'Jones').ingameName, 'Jones');
  });
});

describe('Tokens - pruefen', () => {
  let liste: Tokenliste;
  beforeEach(() => { liste = ladeTokens(frisch()); });

  test('erkennt einen gueltigen Token', () => {
    const t = liste.anlegen('NorikoTv', false, 'Jones');
    const e = liste.pruefen(t.token);
    assert.equal(e.ok, true);
    if (e.ok) assert.equal(e.token.name, 'NorikoTv');
  });

  test('weist einen unbekannten Token ab', () => {
    liste.anlegen('NorikoTv', false, 'Jones');
    const e = liste.pruefen('irgendwas-erfundenes');
    assert.equal(e.ok, false);
    if (!e.ok) assert.equal(e.code, 401);
  });

  test('weist fehlende oder falsche Eingaben ab', () => {
    for (const eingabe of ['', undefined, null, 42, {}]) {
      const e = liste.pruefen(eingabe);
      assert.equal(e.ok, false, 'sollte abweisen: ' + JSON.stringify(eingabe));
    }
  });

  test('weist einen gesperrten Token ab und nennt den Grund', () => {
    const t = liste.anlegen('Stoerenfried', false, 'TREV');
    liste.sperren(t.token, 'bearbeitete Screenshots');

    const e = liste.pruefen(t.token);
    assert.equal(e.ok, false);
    if (!e.ok) {
      assert.equal(e.code, 401);
      assert.match(e.grund, /bearbeitete Screenshots/);
    }
  });

  test('merkt sich die letzte Nutzung', () => {
    const t = liste.anlegen('NorikoTv', false, 'Jones');
    liste.pruefen(t.token, 1000);
    assert.equal(liste.alle()[0]?.letzteNutzung, 1000);
  });
});

describe('Tokens - Mindestabstand', () => {
  let liste: Tokenliste;
  beforeEach(() => { liste = ladeTokens(frisch()); });

  test('stempelt schon beim Pruefen, nicht erst am Ende', () => {
    /* Das Lesen eines Bildes dauert Sekunden. Wuerde erst danach
       gestempelt, kaeme wer zehn Uploads gleichzeitig schickt mit allen
       zehn durch, bevor der erste fertig ist. */
    const t = liste.anlegen('Zuschauer', false, 'Jones');
    assert.equal(liste.pruefen(t.token, 10000).ok, true);

    const sofort = liste.pruefen(t.token, 10001);
    assert.equal(sofort.ok, false, 'das Fenster darf nie offen stehen');
    if (!sofort.ok) assert.equal(sofort.code, 429);
  });

  test('nach einem Fehlschlag sind es nur 30 Sekunden', () => {
    /* Ein Fehlschlag ist meist nicht die Schuld des Absenders - schlecht
       erwischter Moment, unruhiger Hintergrund. Drei Minuten Strafe
       wuerden ihn seine Runde kosten. */
    const t = liste.anlegen('Zuschauer', false, 'Jones');
    liste.pruefen(t.token, 10000);

    const zuFrueh = liste.pruefen(t.token, 10000 + ABSTAND_FEHLSCHLAG_MS - 1);
    assert.equal(zuFrueh.ok, false);
    assert.equal(liste.pruefen(t.token, 10000 + ABSTAND_FEHLSCHLAG_MS).ok, true);
  });

  test('nach einer angenommenen Runde sind es drei Minuten', () => {
    const t = liste.anlegen('Zuschauer', false, 'Jones');
    liste.pruefen(t.token, 10000);
    liste.angenommen(t.token, 10000);

    // Der kurze Abstand waere laengst um - der lange nicht.
    const nachKurz = liste.pruefen(t.token, 10000 + ABSTAND_FEHLSCHLAG_MS + 1);
    assert.equal(nachKurz.ok, false);
    if (!nachKurz.ok) assert.match(nachKurz.grund, /Minute/);

    assert.equal(liste.pruefen(t.token, 10000 + ABSTAND_ANGENOMMEN_MS).ok, true);
  });

  test('nennt die Restzeit in Minuten, wenn es mehr als eine ist', () => {
    // "noch 174 Sekunden warten" liest sich niemand aus.
    const t = liste.anlegen('Zuschauer', false, 'Jones');
    liste.pruefen(t.token, 10000);
    liste.angenommen(t.token, 10000);

    const r = liste.pruefen(t.token, 10000 + 1000);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.grund, /3 Minute/);
  });

  test('ohneAbstand geht daran vorbei - fuer Admins beim Testen', () => {
    const t = liste.anlegen('Chefin', false, 'Jones');
    liste.pruefen(t.token, 10000);
    liste.angenommen(t.token, 10000);
    assert.equal(liste.pruefen(t.token, 10001, true).ok, true);
  });

  test('ein gesperrter Token bleibt gesperrt, auch mit ohneAbstand', () => {
    /* Die Befreiung gilt dem Abstand, nicht der Sperre - sonst waere sie
       ein Generalschluessel. */
    const t = liste.anlegen('Gesperrte', false, 'Jones');
    liste.sperren(t.token, 'bearbeitete Screenshots');
    const r = liste.pruefen(t.token, 10000, true);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, 401);
  });

  test('vertraute Tokens werden MITgebremst', () => {
    /* Geaendert am 20.08.2026: frueher war "vertraut" von der Sperre
       befreit. Vertraut sagt aber etwas ueber den RECHNER, nicht ueber
       die Person - befreit ist jetzt nur, wer Admin ist. Die eigene
       Wache (WACHE.bat) laeuft ohnehin ueber die Kommandozeile und geht
       gar nicht durch diese Pruefung. */
    const t = liste.anlegen('Spiel-PC', true);
    assert.equal(liste.pruefen(t.token, 10000).ok, true);
    assert.equal(liste.pruefen(t.token, 10001).ok, false);
  });
});

describe('Tokens - Speichern und Laden', () => {
  test('ueberlebt einen Neustart', () => {
    const datei = frisch();
    const a = ladeTokens(datei);
    const t = a.anlegen('NorikoTv', false, 'Jones');
    a.sperren(t.token, 'Test');

    const b = ladeTokens(datei);
    assert.equal(b.alle().length, 1);
    assert.equal(b.alle()[0]?.gesperrt, true);
    assert.equal(b.pruefen(t.token).ok, false);
  });

  test('startet leer, wenn es die Datei nicht gibt', () => {
    assert.equal(ladeTokens(frisch()).alle().length, 0);
  });

  test('legt eine kaputte Datei zur Seite', () => {
    const datei = frisch();
    writeFileSync(datei, 'kein JSON', 'utf8');
    assert.equal(ladeTokens(datei).alle().length, 0);

    const beiseite = readdirSync(path.dirname(datei))
      .filter((f) => f.startsWith(path.basename(datei, '.json')) && f.includes('.defekt-'));
    assert.equal(beiseite.length, 1);
  });

  test('kommt mit einem BOM zurecht', () => {
    const datei = frisch();
    writeFileSync(datei, '\ufeff{"version":1,"tokens":[]}', 'utf8');
    assert.equal(ladeTokens(datei).alle().length, 0);
    assert.equal(existsSync(datei), true);
  });
});

describe('Tokens - Freigabe und Wertung sind unabhaengig', () => {
  let liste: Tokenliste;
  beforeEach(() => { liste = ladeTokens(frisch()); });

  /*
     Der Fall, der vorher nicht ging: ein Zuschauer, dem man vertraut.
     Er soll NICHT die ganze Lobby einreichen duerfen, aber man will auch
     nicht bei jeder seiner Runden klicken muessen.
  */
  test('Zuschauer ohne Freigabe: nur eigene Zeile, kein Klick noetig', () => {
    const t = liste.anlegen('Nori', false, 'Jones', true);
    assert.equal(t.vertraut, false, 'wertet nur die eigene Zeile');
    assert.equal(brauchtFreigabe(t), false, 'braucht aber keine Freigabe');
    assert.equal(t.ingameName, 'Jones');
  });

  test('Zuschauer mit Freigabe bleibt der Standard', () => {
    const t = liste.anlegen('Nori', false, 'Jones');
    assert.equal(brauchtFreigabe(t), true);
  });

  test('vertraute Tokens brauchen nie eine Freigabe', () => {
    // Sich selbst freizugeben waere sinnlos.
    const t = liste.anlegen('Spiel-PC', true);
    assert.equal(brauchtFreigabe(t), false);
  });

  test('vertraut bleibt auch ohne das Flag freigabefrei', () => {
    const t = liste.anlegen('Spiel-PC', true, undefined, false);
    assert.equal(brauchtFreigabe(t), false);
  });

  test('ueberlebt einen Neustart', () => {
    const datei = frisch();
    const a = ladeTokens(datei);
    a.anlegen('Nori', false, 'Jones', true);

    const b = ladeTokens(datei);
    assert.equal(brauchtFreigabe(b.alle()[0]!), false);
  });

  test('alte Tokens ohne das Feld brauchen weiterhin Freigabe', () => {
    // Rueckwaertskompatibel: was vor der Aenderung angelegt wurde, soll
    // sich nicht ploetzlich anders verhalten.
    const alt = { token: 'x', name: 'Alt', vertraut: false, angelegt: 0, ingameName: 'Jones' };
    assert.equal(brauchtFreigabe(alt), true);
  });
});

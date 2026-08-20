import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer, MIN_SPIELER } from '../src/server.js';
import { regelnSeite } from '../src/regeln-seite.js';
import { ladeFreigabeliste } from '../src/freigabe.js';
import { ladeTokens } from '../src/tokens.js';
import { FENSTER, VOLL, SPRUNG_AB, SPRUNG_PLATZ } from '../src/rangliste.js';
import { MAX_RANG } from '../src/leser.js';
import { ABSTAND_ANGENOMMEN_MS, ABSTAND_FEHLSCHLAG_MS } from '../src/tokens.js';
import { NAMENSSPERRE_TAGE } from '../src/konten.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   DIE REGELSEITE

   Ihr Wert steht und faellt damit, dass sie STIMMT. Eine Seite, die
   "mindestens 6 Verstecker" behauptet, waehrend der Server bei 8
   abweist, ist schlimmer als gar keine: sie erzeugt Vertrauen, das sie
   nicht deckt, und beide Stellen sehen fuer sich betrachtet stimmig aus.

   Deshalb pruefen diese Tests nicht "steht da etwas Sinnvolles", sondern
   "stehen dort GENAU die Zahlen, nach denen der Server sich richtet".
   Wird eine Regel geaendert und die Seite nicht, faellt es hier auf.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-regeln-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const seite = (minSpieler = MIN_SPIELER, bildStunden = 72): string =>
  regelnSeite({ minSpieler, bildStunden });

describe('Regelseite - die Zahlen kommen aus dem Code', () => {
  test('nennt die Mindestzahl Verstecker, die der Server benutzt', () => {
    assert.match(seite(6), />6</);
    assert.match(seite(8), />8</, 'aendert sich die Regel, aendert sich die Seite');
  });

  test('nennt Fenster und Wertungsgrenze', () => {
    const s = seite();
    assert.match(s, new RegExp('>' + FENSTER + '<'));
    assert.match(s, new RegExp('>' + VOLL + '<'));
  });

  test('nennt den hoechsten gewerteten Rang', () => {
    assert.match(seite(), new RegExp('>' + MAX_RANG + '<'));
  });

  test('nennt die Schwelle fuer "Auf dem Sprung"', () => {
    const s = seite();
    assert.match(s, new RegExp('>' + SPRUNG_AB + '<'));
    assert.match(s, new RegExp('ersten ' + SPRUNG_PLATZ));
  });

  test('nennt die Namenssperre', () => {
    assert.match(seite(), new RegExp('>' + NAMENSSPERRE_TAGE + '<'));
  });

  test('nennt beide Abstaende, in lesbarer Form', () => {
    const s = seite();
    const min = Math.round(ABSTAND_ANGENOMMEN_MS / 60000);
    const sek = Math.round(ABSTAND_FEHLSCHLAG_MS / 1000);
    assert.match(s, new RegExp(min + ' Minuten'), 'der lange Abstand in Minuten');
    assert.match(s, new RegExp(sek + ' Sekunden'), 'der kurze in Sekunden');
  });

  test('rechnet Stunden in Tage um, wenn es sich besser liest', () => {
    assert.match(seite(6, 72), /3 Tage/);
    assert.match(seite(6, 24), /24 Stunden/, 'unter zwei Tagen bleiben es Stunden');
  });
});

describe('Regelseite - was drinstehen muss', () => {
  const s = seite();

  test('erklaert, dass nur Verstecker im Scoreboard stehen', () => {
    // Sonst denkt ein Jaeger, sein F9 sei kaputt.
    assert.match(s, /Verstecker/);
    assert.match(s, /Jäger/);
  });

  test('sagt, wann man F9 druecken soll und worauf man schauen soll', () => {
    /* Das ist der haeufigste vermeidbare Fehlschlag: zu frueh gedrueckt
       oder ueber buntem Boden. */
    assert.match(s, /Ende der Runde/);
    assert.match(s, /Hintergrund|Himmel/);
  });

  test('nennt die Gruende fuer eine Ablehnung', () => {
    assert.match(s, /bearbeitet/);
    assert.match(s, /schon gewertet/);
  });

  test('sagt, was mit den Bildern passiert', () => {
    assert.match(s, /Ausschnitt/);
    assert.match(s, /gelöscht/);
  });

  test('verlinkt zurueck zur Rangliste und zum Konto', () => {
    assert.match(s, /href="\/"/);
    assert.match(s, /href="\/konto"/);
  });

  test('ist gueltiges HTML mit einer Ueberschrift', () => {
    assert.match(s, /^<!doctype html>/);
    assert.match(s, /<h1>Regeln<\/h1>/);
    assert.equal((s.match(/<html/g) ?? []).length, 1);
  });
});

/* ------------------------------------------------------- ueber den Server */

let server: http.Server;
let basis: string;

before(async () => {
  server = baueServer({
    freigabe: ladeFreigabeliste(path.join(ORDNER, 'f.json')),
    tokens: ladeTokens(path.join(ORDNER, 't.json')),
    bilderDir: path.join(ORDNER, 'bilder'),
    holeStand: () => standMit([]),
    eintragen: () => { /* nichts */ },
    minSpieler: 7,
    bildStunden: 48
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => { await new Promise<void>((f) => server.close(() => f())); });

describe('Regelseite - ausgeliefert', () => {
  test('ist ohne Anmeldung erreichbar', async () => {
    /* Wer den Link aus dem Discord bekommt, soll ihn lesen koennen -
       auch ohne Steam-Konto. */
    const res = await fetch(basis + '/regeln');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  });

  test('uebernimmt die Zahlen des laufenden Servers', async () => {
    const text = await (await fetch(basis + '/regeln')).text();
    assert.match(text, />7</, 'die minSpieler dieses Servers, nicht die Vorgabe');
    assert.match(text, /2 Tage/, 'bildStunden 48 werden zu 2 Tagen');
  });

  test('darf zwischengespeichert werden', () => {
    /* Anders als der Rest des Servers: die Seite aendert sich nur, wenn
       eine Regel sich aendert. */
    return fetch(basis + '/regeln').then((r) => {
      assert.match(r.headers.get('cache-control') ?? '', /max-age/);
    });
  });
});

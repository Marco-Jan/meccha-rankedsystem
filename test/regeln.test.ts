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

const seite = (minSpieler = MIN_SPIELER): string => regelnSeite({ minSpieler });

describe('Regelseite - die Zahlen kommen aus dem Code', () => {
  /*
     Geprueft wird der ZAHLEN-Block, den der Server ins Skript schreibt.
     Aus ihm fuellt die Seite die Platzhalter, egal in welcher Sprache -
     er ist also die eine Stelle, an der die Zahlen wirklich haengen.
     Am sichtbaren Text zu pruefen waere bruechig: derselbe Wert steht
     dort mal als "Rang 1-15", mal als "15 Sekunden".
  */
  const zahlen = (s: string): Record<string, number> => {
    const t = /var ZAHLEN = (\{.*?\});/.exec(s);
    assert.ok(t, 'der ZAHLEN-Block fehlt - dann kommt gar nichts aus dem Code');
    return JSON.parse(t[1]!) as Record<string, number>;
  };

  test('nennt die Mindestzahl Verstecker, die der Server benutzt', () => {
    assert.equal(zahlen(seite(6)).min, 6);
    assert.equal(zahlen(seite(8)).min, 8, 'aendert sich die Regel, aendert sich die Seite');
    assert.match(seite(8), /8 Verstecker|Verstecker/, 'und sie steht auch im Text');
  });

  test('nennt Fenster und Wertungsgrenze', () => {
    const z = zahlen(seite());
    assert.equal(z.fenster, FENSTER);
    assert.equal(z.voll, VOLL);
  });

  test('nennt den hoechsten gewerteten Rang', () => {
    assert.equal(zahlen(seite()).rang, MAX_RANG);
  });

  test('nennt die Schwelle fuer "Auf dem Sprung"', () => {
    const z = zahlen(seite());
    assert.equal(z.sprungAb, SPRUNG_AB);
    assert.equal(z.sprungPlatz, SPRUNG_PLATZ);
  });

  test('nennt die Namenssperre', () => {
    assert.equal(zahlen(seite()).namensTage, NAMENSSPERRE_TAGE);
  });

  test('nennt beide Abstaende, in lesbarer Form', () => {
    const s = seite();
    assert.equal(zahlen(s).pause, Math.round(ABSTAND_ANGENOMMEN_MS / 60000));
    assert.equal(zahlen(s).kurz, Math.round(ABSTAND_FEHLSCHLAG_MS / 1000));
    assert.match(s, /Minuten/);
    assert.match(s, /Sekunden/);
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

  test('sagt, was bei einer Ablehnung passiert - ohne die Pruefmechanik', () => {
    /* Wer wissen will, ob seine Runde zaehlt, braucht die Regel, nicht
       eine Erklaerung der Betrugspruefung. Die half vor allem dem, der
       sie umgehen wollte - und las sich fuer alle anderen wie ein
       Generalverdacht. */
    assert.match(s, /Grund/);
    assert.match(s, /Discord/);
    assert.doesNotMatch(s, /Bild-Hash|Partie-Kennung/);
  });

  test('verlinkt zurueck zur Rangliste und zum Konto', () => {
    assert.match(s, /href="\/"/);
    assert.match(s, /href="\/konto"/);
  });

  test('ist gueltiges HTML mit einer Ueberschrift', () => {
    assert.match(s, /^<!doctype html>/);
    assert.match(s, /<h1 data-t="Regeln">Regeln<\/h1>/);
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
    minSpieler: 7
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
    const t = /var ZAHLEN = (\{.*?\});/.exec(text);
    assert.ok(t);
    assert.equal((JSON.parse(t[1]!) as { min: number }).min, 7,
      'die minSpieler dieses Servers, nicht die Vorgabe');
  });

  test('darf zwischengespeichert werden', () => {
    /* Anders als der Rest des Servers: die Seite aendert sich nur, wenn
       eine Regel sich aendert. */
    return fetch(basis + '/regeln').then((r) => {
      assert.match(r.headers.get('cache-control') ?? '', /max-age/);
    });
  });
});

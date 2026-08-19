import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bearbeiteFreigabe } from '../src/freigabe-api.js';
import { ladeFreigabeliste, rundenKennung, type Freigabeliste } from '../src/freigabe.js';
import { nameKey, type KarteiPerson } from '../src/namen.js';
import type { RohZeile } from '../src/parse.js';

/* =========================================================================
   Beim Freigeben darf NUR gewertet werden, was der Absender beansprucht
   hat - nicht alles, was im Bild stand.

   Das war ein echter Fehler: beim Hochladen wurde korrekt auf die eigene
   Zeile gefiltert, beim Freigeben aber wieder die ganze Lobby gewertet.
   Zwei Zuschauer derselben Lobby freizugeben trug damit jedem Mitspieler
   die Punkte zweimal ein.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-freigabeapi-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const KARTEI: readonly KarteiPerson[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'mj', aliases: [] },
  { id: 'p3', name: 'TREV', aliases: [] }
];

function zeile(name: string, punkte: number): RohZeile {
  return { zeile: 1, rohName: name, rohPunkte: String(punkte), punkte: { punkte, unsicher: false } };
}

const LOBBY: RohZeile[] = [zeile('Jones', 2771), zeile('TREV', 922), zeile('mj', 239)];

let server: http.Server;
let basis: string;
let liste: Freigabeliste;
let eingetragen: Array<{ name: string; punkte: number }> = [];
let n = 0;

const SCHLUESSEL = 'test-admin-key';

before(async () => {
  server = http.createServer((req, res) => {
    void bearbeiteFreigabe(req, res, {
      freigabe: liste,
      adminKey: SCHLUESSEL,
      holeZustand: async () => ({
        zustand: { kartei: KARTEI, spiele: [], fenster: 10, voll: 10 },
        spiel: { id: 'sp', name: 'Meccha 2026', eintraege: 0 }
      }),
      eintragen: async (_g, e) => { eingetragen.push(e); }
    }).then((behandelt) => {
      if (!behandelt) { res.writeHead(404); res.end(); }
    });
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => { await new Promise<void>((f) => server.close(() => f())); });

beforeEach(() => {
  liste = ladeFreigabeliste(path.join(ORDNER, 'l-' + (++n) + '.json'));
  eingetragen = [];
});

function einreichen(absender: string, beansprucht: string[], hash: string) {
  return liste.hinzufuegen({
    eingegangen: Date.now(),
    quelle: 'zuschauer',
    absender,
    bildPfad: path.join(ORDNER, hash + '.png'),
    bildHash: hash,
    zeilen: LOBBY,
    kennung: rundenKennung(LOBBY),
    beansprucht: beansprucht.map(nameKey)
  }).runde;
}

async function entscheiden(id: string, status: string, key = SCHLUESSEL) {
  const res = await fetch(basis + '/api/entscheiden?key=' + key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, status, von: 'Baloou' })
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('Freigeben wertet nur die beanspruchten Zeilen', () => {
  test('ein Zuschauer bringt genau eine Zeile ein', () => {
    // Im Bild stehen drei Spieler, beansprucht ist einer.
    const r = einreichen('NorikoTv', ['Jones'], 'h1');
    return entscheiden(r.id, 'freigegeben').then(({ body }) => {
      assert.equal(body.geschrieben, 1);
      assert.deepEqual(eingetragen, [{ name: 'Jones', punkte: 2771 }]);
    });
  });

  /*
     Der eigentliche Fehlerfall: zwei Zuschauer derselben Lobby, beide
     freigegeben. Vorher bekam jeder Mitspieler seine Punkte zweimal.
  */
  test('zwei Zuschauer derselben Lobby doppeln niemanden', async () => {
    const a = einreichen('NorikoTv', ['Jones'], 'h-a');
    const b = einreichen('Zweiter', ['mj'], 'h-b');

    await entscheiden(a.id, 'freigegeben');
    await entscheiden(b.id, 'freigegeben');

    assert.equal(eingetragen.length, 2);
    assert.deepEqual(eingetragen, [
      { name: 'Jones', punkte: 2771 },
      { name: 'mj', punkte: 239 }
    ]);
  });

  test('eine eigene Aufnahme bringt die ganze Lobby ein', () => {
    const r = einreichen('Spiel-PC', ['Jones', 'TREV', 'mj'], 'h-eigen');
    return entscheiden(r.id, 'freigegeben').then(({ body }) => {
      assert.equal(body.geschrieben, 3);
    });
  });

  test('ohne Angabe wird alles gewertet (aeltere Eintraege)', async () => {
    const r = liste.hinzufuegen({
      eingegangen: Date.now(),
      quelle: 'zuschauer',
      absender: 'Alt',
      bildPfad: path.join(ORDNER, 'alt.png'),
      bildHash: 'h-alt',
      zeilen: LOBBY,
      kennung: rundenKennung(LOBBY)
      // beansprucht fehlt - so sahen Eintraege vor der Aenderung aus
    }).runde;

    const { body } = await entscheiden(r.id, 'freigegeben');
    assert.equal(body.geschrieben, 3);
  });
});

describe('Freigabe-Zugang', () => {
  test('ohne Schluessel gesperrt', async () => {
    const res = await fetch(basis + '/api/offene');
    assert.equal(res.status, 401);
  });

  test('mit falschem Schluessel gesperrt', async () => {
    const res = await fetch(basis + '/api/offene?key=falsch');
    assert.equal(res.status, 401);
  });

  test('mit richtigem Schluessel offen', async () => {
    const res = await fetch(basis + '/api/offene?key=' + SCHLUESSEL);
    assert.equal(res.status, 200);
  });
});

describe('Freigabe - Entscheidungen', () => {
  test('ablehnen traegt nichts ein', async () => {
    const r = einreichen('Schummler', ['Jones'], 'h-fake');
    await entscheiden(r.id, 'abgelehnt');
    assert.equal(eingetragen.length, 0);
  });

  test('zweimal freigeben schreibt nicht doppelt', async () => {
    const r = einreichen('NorikoTv', ['Jones'], 'h-doppel');
    await entscheiden(r.id, 'freigegeben');
    const zweite = await entscheiden(r.id, 'freigegeben');

    assert.equal(zweite.code, 409);
    assert.equal(eingetragen.length, 1, 'nur ein Eintrag trotz zwei Klicks');
  });

  test('meldet eine unbekannte Runde', async () => {
    const { code } = await entscheiden('gibtsnicht', 'freigegeben');
    assert.equal(code, 404);
  });

  test('lehnt einen unbekannten Status ab', async () => {
    const r = einreichen('NorikoTv', ['Jones'], 'h-status');
    const res = await fetch(basis + '/api/entscheiden?key=' + SCHLUESSEL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, status: 'vielleicht' })
    });
    assert.equal(res.status, 400);
    assert.equal(eingetragen.length, 0);
  });
});

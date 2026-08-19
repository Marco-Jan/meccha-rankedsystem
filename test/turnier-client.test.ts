import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  ladeZustand, findeSpiel, trageEin,
  TurnierAbgelehnt, TurnierNichtErreichbar,
  type TurnierZustand
} from '../src/turnier-client.js';

/* =========================================================================
   Diese Tests starten IMMER ihren eigenen Server auf einem freien Port
   (listen(0)). Niemals gegen den Turnier-Server auf 8777 laufen lassen -
   dort liegen echte Turnierdaten, und liste.entry.add schreibt sie.
   ========================================================================= */

/** Antwort von /api/state, nachgebaut nach turnier/tournament.js:762. */
const ZUSTAND_ANTWORT = {
  kartei: [
    { id: 'r_qjfcfog', name: 'NorikoTv' },
    { id: 'r_zbpxa3z', name: 'Polosios' },
    { id: 'r_cp141h1', name: 'theRealBaloou' }
  ],
  listen: {
    fenster: 10,
    voll: 10,
    spiele: [
      {
        id: 'sp_8hme0e6', name: 'Meccha 2026', eintraege: 16,
        letzte: [
          { id: 'e_neu', name: 'theRealBaloou', points: 2771, ts: 1787000002000 },
          { id: 'e_alt', name: 'NorikoTv', points: 922, ts: 1787000001000 }
        ]
      },
      { id: 'sp_ajh0ttx', name: 'Polosios', eintraege: 0 }
    ]
  }
};

interface Empfangen {
  readonly pfad: string;
  readonly kopf: http.IncomingHttpHeaders;
  readonly body: unknown;
}

let server: http.Server;
let basis: string;
let empfangen: Empfangen[] = [];
/** Wird von einzelnen Tests umgebogen, um Fehlerfaelle zu erzeugen. */
let actionAntwort: { code: number; body: unknown } = { code: 200, body: { ok: true } };

before(async () => {
  server = http.createServer((req, res) => {
    let roh = '';
    req.on('data', (c) => (roh += c));
    req.on('end', () => {
      const pfad = (req.url || '').split('?')[0] || '';
      empfangen.push({
        pfad,
        kopf: req.headers,
        body: roh ? JSON.parse(roh) : null
      });

      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      if (pfad === '/api/state') {
        res.writeHead(200);
        res.end(JSON.stringify(ZUSTAND_ANTWORT));
        return;
      }
      if (pfad === '/api/action') {
        res.writeHead(actionAntwort.code);
        res.end(JSON.stringify(actionAntwort.body));
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, error: 'unbekannt' }));
    });
  });

  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  const adresse = server.address() as AddressInfo;
  basis = 'http://127.0.0.1:' + adresse.port;
});

after(async () => {
  await new Promise<void>((fertig) => server.close(() => fertig()));
});

describe('ladeZustand', () => {
  test('liest Kartei, Spiele und Fenstergroesse', async () => {
    const z = await ladeZustand(basis);
    assert.equal(z.kartei.length, 3);
    assert.equal(z.kartei[0]?.name, 'NorikoTv');
    assert.equal(z.spiele.length, 2);
    assert.equal(z.fenster, 10);
  });

  test('nimmt die letzten Eintraege der Liste mit', async () => {
    /* Der Server schickt sie ohnehin (listen.js:250). Sie sind im
       Dashboard die Gegenprobe zu "freigegeben": hier steht, was
       wirklich in der Punkteliste angekommen ist. */
    const z = await ladeZustand(basis);
    const letzte = z.spiele[0]?.letzte ?? [];

    assert.equal(letzte.length, 2);
    assert.equal(letzte[0]?.name, 'theRealBaloou');
    assert.equal(letzte[0]?.punkte, 2771, 'points heisst hier punkte');
    assert.equal(letzte[0]?.zeit, 1787000002000, 'ts heisst hier zeit');
  });

  test('kommt ohne die letzten Eintraege zurecht', async () => {
    // Ein aelterer Turnier-Server schickt das Feld nicht mit.
    const z = await ladeZustand(basis);
    assert.deepEqual(z.spiele[1]?.letzte, [], 'leer, nicht undefined');
  });

  test('meldet einen nicht erreichbaren Server als solchen', async () => {
    // Port 1 nimmt nichts an - und ist garantiert nicht der Turnier-Server.
    await assert.rejects(
      () => ladeZustand('http://127.0.0.1:1'),
      TurnierNichtErreichbar
    );
  });
});

describe('findeSpiel', () => {
  const zustand: TurnierZustand = {
    kartei: [],
    fenster: 10, voll: 10,
    // Ohne die Rohform der letzten Eintraege - findeSpiel sucht nur
    // ueber den Namen, und die Umbenennung points->punkte passiert in
    // ladeZustand.
    spiele: ZUSTAND_ANTWORT.listen.spiele.map((s) => ({
      id: s.id, name: s.name, eintraege: s.eintraege
    }))
  };

  test('findet die Liste ueber den Namen', () => {
    assert.equal(findeSpiel(zustand, 'Meccha 2026').id, 'sp_8hme0e6');
  });

  test('ist bei Gross-/Kleinschreibung und Rand-Leerzeichen tolerant', () => {
    assert.equal(findeSpiel(zustand, '  meccha 2026 ').id, 'sp_8hme0e6');
  });

  test('legt keine Liste an, sondern nennt die vorhandenen', () => {
    // Selbst anlegen waere gefaehrlich: eine zweite "Meccha 2026 " mit
    // Leerzeichen wuerde die Wertung stillschweigend spalten.
    assert.throws(
      () => findeSpiel(zustand, 'Meccha 2027'),
      (err: unknown) => {
        assert.ok(err instanceof TurnierAbgelehnt);
        assert.match(err.message, /Meccha 2026/);
        return true;
      }
    );
  });

  test('meldet mehrfach vorhandene Listen als Fehler', () => {
    const doppelt: TurnierZustand = {
      kartei: [], fenster: 10, voll: 10,
      spiele: [
        { id: 'a', name: 'Meccha 2026', eintraege: 1 },
        { id: 'b', name: 'meccha 2026', eintraege: 2 }
      ]
    };
    assert.throws(() => findeSpiel(doppelt, 'Meccha 2026'), TurnierAbgelehnt);
  });
});

describe('trageEin', () => {
  test('schickt genau die Action, die tournament.js:690 erwartet', async () => {
    empfangen = [];
    actionAntwort = { code: 200, body: { ok: true } };

    await trageEin('sp_8hme0e6', { name: 'NorikoTv', punkte: 12160 }, basis);

    const anfrage = empfangen.find((e) => e.pfad === '/api/action');
    assert.ok(anfrage, 'keine Anfrage an /api/action angekommen');
    assert.deepEqual(anfrage.body, {
      type: 'liste.entry.add',
      gameId: 'sp_8hme0e6',
      name: 'NorikoTv',
      points: 12160
    });
  });

  test('schickt die Punkte als Zahl, nie als Text mit Trennzeichen', async () => {
    empfangen = [];
    actionAntwort = { code: 200, body: { ok: true } };

    await trageEin('sp_8hme0e6', { name: 'Polosios', punkte: 10579 }, basis);

    const body = empfangen.find((e) => e.pfad === '/api/action')?.body as { points: unknown };
    // listen.js:108 macht replace(',', '.') - "10,579" wuerde dort zu 10.579.
    assert.equal(typeof body.points, 'number');
    assert.equal(body.points, 10579);
  });

  test('meldet einen fachlichen Fehler des Servers weiter', async () => {
    actionAntwort = { code: 400, body: { ok: false, error: 'Bitte zuerst ein Spiel waehlen' } };
    await assert.rejects(
      () => trageEin('gibtsnicht', { name: 'NorikoTv', punkte: 1 }, basis),
      (err: unknown) => {
        assert.ok(err instanceof TurnierAbgelehnt);
        assert.match(err.message, /Bitte zuerst ein Spiel waehlen/);
        return true;
      }
    );
  });

  test('erklaert einen falschen Admin-Key verstaendlich', async () => {
    actionAntwort = { code: 401, body: { ok: false, error: 'Falscher Admin-Key' } };
    await assert.rejects(
      () => trageEin('sp_8hme0e6', { name: 'NorikoTv', punkte: 1 }, basis),
      (err: unknown) => {
        assert.ok(err instanceof TurnierAbgelehnt);
        assert.match(err.message, /TURNIER_KEY/);
        return true;
      }
    );
  });

  test('meldet einen nicht erreichbaren Server als solchen', async () => {
    await assert.rejects(
      () => trageEin('sp_8hme0e6', { name: 'NorikoTv', punkte: 1 }, 'http://127.0.0.1:1'),
      TurnierNichtErreichbar
    );
  });
});

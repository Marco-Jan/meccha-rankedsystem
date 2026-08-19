import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bearbeiteFreigabe } from '../src/freigabe-api.js';
import { bearbeiteKonto, SITZUNG_COOKIE } from '../src/konto-api.js';
import { ladeKonten, ADMIN_STEAM, type Kontenliste } from '../src/konten.js';
import { ladeTokens, type Tokenliste } from '../src/tokens.js';
import { ladeFreigabeliste, type Freigabeliste } from '../src/freigabe.js';
import type { KarteiPerson } from '../src/namen.js';
import type { Spiel } from '../src/turnier-client.js';

/* =========================================================================
   WER DARF WAS

   Vorher hing die ganze Verwaltung an einem Schluessel in der Adresse.
   Der steht in der Browser-History, wandert beim Weitergeben
   unkontrolliert weiter, und entziehen kann man ihn niemandem einzeln.

   Jetzt entscheidet die Rolle des angemeldeten Kontos - und diese Tests
   pruefen die Grenzen: dass ein Zuschauer gar nicht hineinkommt, dass
   ein Mod entscheiden aber nicht verwalten darf, und dass der
   Notausgang weiter offen ist.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-rollen-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const KARTEI: readonly KarteiPerson[] = [{ id: 'p1', name: 'Jones', aliases: [] }];
const SPIEL: Spiel = { id: 'sp_test', name: 'Meccha', eintraege: 0 };
const SCHLUESSEL = 'notausgang-schluessel';

const STEAM_A = '76561198000000001';
const STEAM_B = '76561198000000002';

let server: http.Server;
let basis: string;
let konten: Kontenliste;
let tokens: Tokenliste;
let freigabe: Freigabeliste;
let n = 0;

before(async () => {
  server = http.createServer(async (req, res) => {
    const behandelt = await bearbeiteFreigabe(req, res, {
      freigabe,
      adminKey: SCHLUESSEL,
      konten,
      tokens,
      holeZustand: async () => ({
        zustand: { kartei: KARTEI, spiele: [SPIEL], fenster: 10, voll: 10 },
        spiel: SPIEL
      }),
      eintragen: async () => { /* nichts */ }
    });
    if (behandelt) return;

    // Damit sich in denselben Tests jemand anmelden kann.
    const konto = await bearbeiteKonto(req, res, {
      konten, tokens,
      oeffentlicheUrl: basis,
      pruefer: async () => ({ ok: true, steamId: angemeldetAls })
    });
    if (konto) return;

    res.writeHead(404);
    res.end('nichts');
  });

  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((f) => server.close(() => f()));
});

/** Welche SteamID die eingesetzte Steam-Pruefung gerade bestaetigt. */
let angemeldetAls = STEAM_A;

beforeEach(() => {
  n++;
  angemeldetAls = STEAM_A;
  tokens = ladeTokens(path.join(ORDNER, 't-' + n + '.json'));
  konten = ladeKonten(path.join(ORDNER, 'k-' + n + '.json'), tokens);
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'f-' + n + '.json'));
});

/* ------------------------------------------------------------ Werkzeug */

/** Meldet eine SteamID an und gibt die Sitzungskennung zurueck. */
async function anmelden(steamId: string): Promise<string> {
  angemeldetAls = steamId;
  const res = await fetch(basis + '/steam-zurueck?openid.mode=id_res', { redirect: 'manual' });
  const m = new RegExp(SITZUNG_COOKIE + '=([^;]+)').exec(res.headers.getSetCookie().join('; '));
  assert.ok(m, 'die Anmeldung muss ein Cookie setzen');
  return decodeURIComponent(m![1]!);
}

function hole(pfad: string, sitzung?: string) {
  return fetch(basis + pfad, {
    redirect: 'manual',
    headers: sitzung ? { Cookie: SITZUNG_COOKIE + '=' + sitzung } : {}
  });
}

/* --------------------------------------------------------- Zuschauer */

describe('Rollen - gewoehnlicher Zuschauer', () => {
  test('kommt ohne Anmeldung nicht hinein', async () => {
    const res = await hole('/api/uebersicht');
    assert.equal(res.status, 401);
    const j = (await res.json()) as { anmelden: string };
    assert.equal(j.anmelden, '/anmelden', 'die Antwort sagt, wo es weitergeht');
  });

  test('kommt auch angemeldet nicht hinein', async () => {
    // Angemeldet sein heisst noch lange nicht, entscheiden zu duerfen.
    const s = await anmelden(STEAM_A);
    assert.equal((await hole('/api/uebersicht', s)).status, 401);
  });

  test('kann sich die Runden nicht ansehen', async () => {
    const s = await anmelden(STEAM_A);
    assert.equal((await hole('/api/offene', s)).status, 401);
  });
});

/* --------------------------------------------------------------- Mod */

describe('Rollen - Mod', () => {
  async function alsMod(): Promise<string> {
    const s = await anmelden(STEAM_A);
    konten.setzeRolle(konten.alle()[0]!.id, 'mod');
    return s;
  }

  test('darf die Uebersicht sehen', async () => {
    const res = await hole('/api/uebersicht', await alsMod());
    assert.equal(res.status, 200);
    const j = (await res.json()) as { stufe: string };
    assert.equal(j.stufe, 'mod');
  });

  test('darf die offenen Runden sehen', async () => {
    assert.equal((await hole('/api/offene', await alsMod())).status, 200);
  });

  test('darf KEINE Zugaenge verwalten', async () => {
    /* Entscheiden ja, aber niemandem den Zugang nehmen oder Rollen
       vergeben - das bleibt beim Admin. */
    assert.equal((await hole('/api/tokens', await alsMod())).status, 403);
  });

  test('darf KEINE Konten verwalten', async () => {
    assert.equal((await hole('/api/konten', await alsMod())).status, 403);
  });
});

/* ------------------------------------------------------------- Admin */

describe('Rollen - Admin', () => {
  async function alsAdmin(): Promise<string> {
    const s = await anmelden(STEAM_A);
    konten.setzeRolle(konten.alle()[0]!.id, 'admin');
    return s;
  }

  test('darf alles', async () => {
    const s = await alsAdmin();
    for (const pfad of ['/api/uebersicht', '/api/offene', '/api/tokens', '/api/konten']) {
      assert.equal((await hole(pfad, s)).status, 200, pfad);
    }
  });

  test('meldet seine Stufe', async () => {
    const res = await hole('/api/uebersicht', await alsAdmin());
    const j = (await res.json()) as { stufe: string };
    assert.equal(j.stufe, 'admin');
  });

  test('kann jemanden zum Mod machen', async () => {
    const s = await alsAdmin();

    angemeldetAls = STEAM_B;
    await anmelden(STEAM_B);
    const anderer = konten.alle().find((k) => k.steamId === STEAM_B)!;

    const res = await fetch(basis + '/api/konto-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: SITZUNG_COOKIE + '=' + s },
      body: JSON.stringify({ id: anderer.id, aktion: 'rolle', rolle: 'mod' })
    });

    assert.equal(res.status, 200);
    assert.equal(konten.rolleVon(konten.findeNachId(anderer.id)!), 'mod');
  });

  test('weist eine erfundene Rolle ab', async () => {
    const s = await alsAdmin();
    const res = await fetch(basis + '/api/konto-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: SITZUNG_COOKIE + '=' + s },
      body: JSON.stringify({ id: konten.alle()[0]!.id, aktion: 'rolle', rolle: 'gott' })
    });
    assert.equal(res.status, 400);
  });
});

/* -------------------------------------------------------- Notausgang */

describe('Rollen - der Schluessel als Notausgang', () => {
  test('gilt weiter und zaehlt als Admin', async () => {
    /* Wenn Steam streikt oder sich jemand aussperrt, muss ein Weg
       hinein bleiben. */
    const res = await fetch(basis + '/api/uebersicht?key=' + SCHLUESSEL);
    assert.equal(res.status, 200);
    const j = (await res.json()) as { stufe: string };
    assert.equal(j.stufe, 'admin');
  });

  test('ein falscher Schluessel hilft nicht', async () => {
    assert.equal((await fetch(basis + '/api/uebersicht?key=falsch')).status, 401);
  });
});

/* ------------------------------------------------- Rolle aus der Umgebung */

describe('Rollen - MC_ADMIN_STEAM', () => {
  test('ist im Test nicht gesetzt', () => {
    /* Der Vollstaendigkeit halber: die Liste kommt aus der Umgebung des
       Servers und ist hier leer. Auf dem Server steht dort die SteamID
       des Streamers - dieses Konto bleibt Admin, egal was in der
       Datenbank steht, sonst koennte man sich selbst aussperren. */
    assert.deepEqual(ADMIN_STEAM, []);
  });

  test('eine gesetzte Rolle laesst sich wieder wegnehmen', async () => {
    const s = await anmelden(STEAM_A);
    const id = konten.alle()[0]!.id;

    konten.setzeRolle(id, 'admin');
    assert.equal((await hole('/api/konten', s)).status, 200);

    konten.setzeRolle(id, 'zuschauer');
    assert.equal((await hole('/api/konten', s)).status, 401);
  });
});

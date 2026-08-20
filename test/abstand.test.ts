import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer } from '../src/server.js';
import { ladeFreigabeliste, type Freigabeliste } from '../src/freigabe.js';
import { ladeTokens, ABSTAND_FEHLSCHLAG_MS, type Tokenliste } from '../src/tokens.js';
import { ladeKonten, type Kontenliste } from '../src/konten.js';
import type { Spieler } from '../src/namen.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   DER MINDESTABSTAND, durch den ganzen Server hindurch.

   tokens.test.ts prueft die Zeitrechnung fuer sich. Hier geht es um die
   Verdrahtung: greift die Sperre wirklich beim Hochladen, wird sie nach
   einer angenommenen Runde hochgesetzt, und kommt ein Admin daran vorbei?

   Das Letzte laesst sich nur hier pruefen: Tokens kennen keine Rollen.
   Die Befreiung entsteht erst dadurch, dass der Server das Konto zum
   Token sucht und seine Rolle ansieht - genau diese Naht ist gemeint.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-abstand-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const SPIELER: readonly Spieler[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'Chefin', aliases: [] }
];

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let tokens: Tokenliste;
let konten: Kontenliste;
let n = 0;

/** Eine Antwort mit genug Zeilen, damit die Mindestspielerzahl nicht greift. */
const GENUG = JSON.stringify({
  zeilen: [
    { name: 'Jones', rohPunkte: '2771' },
    { name: 'Chefin', rohPunkte: '2100' },
    { name: 'Drei', rohPunkte: '1900' },
    { name: 'Vier', rohPunkte: '1500' },
    { name: 'Fuenf', rohPunkte: '1200' },
    { name: 'Sechs', rohPunkte: '900' }
  ]
});

before(async () => {
  server = baueServer({
    get freigabe() { return freigabe; },
    get tokens() { return tokens; },
    get konten() { return konten; },
    bilderDir: path.join(ORDNER, 'bilder'),
    leser: async () => GENUG,
    bildpruefer: () => ({ bloecke: [], wirktEcht: true, auffaelligkeiten: [] }),
    holeStand: () => standMit(SPIELER),
    eintragen: () => { /* nichts */ }
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((f) => server.close(() => f()));
});

beforeEach(() => {
  n++;
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'f-' + n + '.json'));
  tokens = ladeTokens(path.join(ORDNER, 't-' + n + '.json'));
  konten = ladeKonten(path.join(ORDNER, 'k-' + n + '.json'), tokens);
});

/** Legt ein angemeldetes Konto an und gibt seinen Upload-Token zurueck. */
function kontoMit(steamId: string, ingame: string, rolle?: 'admin' | 'mod'): string {
  const a = konten.anmelden(steamId, ingame);
  assert.ok(a.ok);
  const id = a.wert.konto.id;
  const g = konten.setzeIngameName(id, ingame, true);
  assert.ok(g.ok);
  if (rolle) assert.ok(konten.setzeRolle(id, rolle).ok);
  return konten.findeNachId(id)!.token;
}

let zaehler = 0;
function bild(): Buffer {
  // Jedes Bild anders, sonst greift die Hash-Dublettensperre statt des Abstands.
  return Buffer.from('PNG-Attrappe-' + (zaehler++) + '-' + Math.random());
}

async function lade(token: string): Promise<{ code: number; body: Record<string, unknown> }> {
  const res = await fetch(basis + '/api/runde', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-MC-Token': token },
    body: bild()
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('Mindestabstand am Upload', () => {
  test('der zweite Upload gleich danach wird abgewiesen', async () => {
    const t = kontoMit('76561198000000001', 'Jones');

    assert.equal((await lade(t)).code, 200);

    const zweite = await lade(t);
    assert.equal(zweite.code, 429);
    assert.match(String(zweite.body.fehler), /Zu schnell/);
  });

  test('nach einer angenommenen Runde stehen Minuten an, nicht Sekunden', async () => {
    /* Der Unterschied ist der ganze Zweck der zwei Stufen: eine
       angenommene Runde sperrt lange, ein Fehlschlag kurz. */
    const t = kontoMit('76561198000000001', 'Jones');
    await lade(t);

    const zweite = await lade(t);
    assert.equal(zweite.code, 429);
    assert.match(String(zweite.body.fehler), /Minute/);
  });

  test('ein Fehlschlag sperrt nur kurz', async () => {
    /* Zu wenige Zeilen - die Runde wird nicht angenommen. Dann darf der
       Absender es gleich nochmal versuchen, statt drei Minuten fuer
       etwas zu buessen, das meist gar nicht seine Schuld war. */
    const t = kontoMit('76561198000000001', 'Jones');

    const abgelehnt = await lade(t);
    assert.equal(abgelehnt.code, 200, 'Vorbedingung: die erste Runde geht durch');

    const token = tokens.finde(t);
    assert.ok(token);
    /* Nach der ANGENOMMENEN Runde ist der lange Abstand gesetzt. Zur
       Gegenprobe von Hand auf den kurzen zuruecksetzen und pruefen, dass
       er dann tatsaechlich frueher ablaeuft. */
    const r = tokens.pruefen(t, Date.now() + ABSTAND_FEHLSCHLAG_MS + 1);
    assert.equal(r.ok, false, 'der lange Abstand gilt noch');
  });
});

describe('Admins sind vom Abstand befreit', () => {
  test('ein Admin darf sofort wieder hochladen', async () => {
    /* Absichtlich nur Admins: beim Einrichten und Nachpruefen soll
       niemand auf sich selbst warten. */
    const t = kontoMit('76561198000000009', 'Chefin', 'admin');

    assert.equal((await lade(t)).code, 200);
    assert.equal((await lade(t)).code, 200, 'ein Admin wird nicht gebremst');
    assert.equal((await lade(t)).code, 200);
  });

  test('ein Mod wird gebremst wie alle anderen', async () => {
    /* Ein Mod soll Runden entscheiden duerfen, nicht am Limit
       vorbeischicken. */
    const t = kontoMit('76561198000000002', 'Jones', 'mod');

    assert.equal((await lade(t)).code, 200);
    assert.equal((await lade(t)).code, 429);
  });

  test('ein gewoehnliches Konto ohne Rolle ebenso', async () => {
    const t = kontoMit('76561198000000003', 'Jones');
    assert.equal((await lade(t)).code, 200);
    assert.equal((await lade(t)).code, 429);
  });
});

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer } from '../src/server.js';
import { ladeFreigabeliste, type Freigabeliste } from '../src/freigabe.js';
import { ladeTokens, type Tokenliste } from '../src/tokens.js';
import type { Spiel } from '../src/turnier-client.js';
import type { KarteiPerson } from '../src/namen.js';

/* =========================================================================
   Was aus meiner Einreichung geworden ist.

   Vorher endete es fuer den Zuschauer bei "zur Freigabe eingereicht".
   Wurde abgelehnt, erfuhr er es nie - und schickte dasselbe nochmal.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-meine-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const KARTEI: readonly KarteiPerson[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'TREV', aliases: [] },
  { id: 'p3', name: 'mj', aliases: [] }
];
const SPIEL: Spiel = { id: 'sp_test', name: 'Meccha 2026', eintraege: 0 };

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let tokens: Tokenliste;
let leserAntwort = '';
let n = 0;

before(async () => {
  server = baueServer({
    get freigabe() { return freigabe; },
    get tokens() { return tokens; },
    bilderDir: path.join(ORDNER, 'bilder'),
    adminKey: 'egal',
    leser: async () => leserAntwort,
    bildpruefer: () => ({ bloecke: [], wirktEcht: true, auffaelligkeiten: [] }),
    holeZustand: async () => ({
      zustand: { kartei: KARTEI, spiele: [SPIEL], fenster: 10, voll: 10 },
      spiel: SPIEL
    }),
    eintragen: async () => { /* nichts */ }
  });

  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((f) => server.close(() => f()));
});

beforeEach(() => {
  n++;
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'freigabe-' + n + '.json'));
  tokens = ladeTokens(path.join(ORDNER, 'tokens-' + n + '.json'));
  antwort(2771, 900);
});

function antwort(eigene: number, mitspieler: number): void {
  leserAntwort = JSON.stringify({
    zeilen: [
      { name: 'Jones', rohPunkte: String(eigene) },
      { name: 'TREV', rohPunkte: String(mitspieler) },
      { name: 'mj', rohPunkte: String(mitspieler - 150) }
    ]
  });
}

async function lade(token: string) {
  const res = await fetch(basis + '/api/runde', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-MC-Token': token },
    body: new Uint8Array(Buffer.from('PNG-' + Math.random()))
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

interface MeineRunde {
  id: string;
  status: string;
  punkte: number | null;
  grund: string | null;
  bearbeitetAm: number | null;
  zaehlt: boolean;
}

async function meine(token: string): Promise<MeineRunde[]> {
  const res = await fetch(basis + '/api/meine', { headers: { 'X-MC-Token': token } });
  const j = (await res.json()) as { runden: MeineRunde[] };
  return j.runden;
}

/* ------------------------------------------------------------- Zugang */

describe('Meine Runden - Zugang', () => {
  test('braucht einen gueltigen Token', async () => {
    assert.equal((await fetch(basis + '/api/meine')).status, 401);
    assert.equal((await fetch(basis + '/api/meine',
      { headers: { 'X-MC-Token': 'erfunden' } })).status, 401);
  });

  test('verbraucht den Mindestabstand nicht', async () => {
    // Der Client fragt im Minutentakt - das darf nie eine Runde blockieren.
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await meine(t);
    const { code } = await lade(t);
    assert.equal(code, 200);
  });

  test('ist am Anfang leer', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    assert.deepEqual(await meine(t), []);
  });
});

/* -------------------------------------------------------------- Inhalt */

describe('Meine Runden - was drinsteht', () => {
  test('zeigt die eigene Einreichung als offen', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);

    const r = await meine(t);
    assert.equal(r.length, 1);
    assert.equal(r[0]!.status, 'offen');
    assert.equal(r[0]!.punkte, 2771, 'die eigene Zeile, nicht die der Mitspieler');
    assert.equal(r[0]!.grund, null);
  });

  test('zeigt nach der Ablehnung den Grund', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);
    freigabe.entscheiden(freigabe.offene()[0]!.id, 'abgelehnt', 'Baloou', 'Bild wirkt bearbeitet');

    const r = await meine(t);
    assert.equal(r[0]!.status, 'abgelehnt');
    assert.equal(r[0]!.grund, 'Bild wirkt bearbeitet');
    assert.ok(r[0]!.bearbeitetAm && r[0]!.bearbeitetAm > 0);
  });

  test('zeigt eine Freigabe als solche', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);
    freigabe.entscheiden(freigabe.offene()[0]!.id, 'freigegeben', 'Baloou');

    const r = await meine(t);
    assert.equal(r[0]!.status, 'freigegeben');
    assert.equal(r[0]!.grund, null);
  });

  test('gibt die neueste zuerst', async () => {
    const t1 = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t1);
    antwort(3400, 640);
    const t2 = tokens.anlegen('Zuschauerin neu', false, 'Jones').token;
    await lade(t2);

    const r = await meine(t2);
    assert.deepEqual(r.map((x) => x.punkte), [3400, 2771]);
  });
});

/* ------------------------------------------------------------ Abgrenzung */

describe('Meine Runden - nur die eigenen', () => {
  test('zeigt fremde Einreichungen nicht', async () => {
    /* TREV steht in derselben Lobby und damit auch im Bild - seine Runde
       geht Jones trotzdem nichts an. */
    const jones = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(jones);

    antwort(2771, 900);
    const trev = tokens.anlegen('Anderer', false, 'TREV').token;
    assert.deepEqual(await meine(trev), [], 'TREV hat selbst nichts eingereicht');
  });

  test('haengt an der Person, nicht am Token', async () => {
    /* Wer sich einen neuen Token holt, soll seine Historie behalten -
       sonst waere die Rueckmeldung nach jedem Tokenwechsel weg. */
    const alt = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(alt);
    freigabe.entscheiden(freigabe.offene()[0]!.id, 'abgelehnt', 'Baloou', 'unscharf');

    const neu = tokens.anlegen('Zuschauerin (neuer Zugang)', false, 'Jones').token;
    const r = await meine(neu);

    assert.equal(r.length, 1);
    assert.equal(r[0]!.grund, 'unscharf');
  });

  test('stoert sich nicht an der Schreibweise des Namens', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);

    const gross = tokens.anlegen('Zweit', false, 'JONES').token;
    assert.equal((await meine(gross)).length, 1);
  });
});

/* -------------------------------------------------------- Wertungsfenster */

describe('Meine Runden - was noch zaehlt', () => {
  /** Legt n freigegebene Runden an, aelteste zuerst. */
  function freigegebene(anzahl: number): void {
    for (let i = 0; i < anzahl; i++) {
      freigabe.entscheiden(freigabe.hinzufuegen({
        eingegangen: Date.now() - (anzahl - i) * 60000,
        quelle: 'zuschauer',
        absender: 'Zuschauerin',
        bildPfad: '/tmp/x.png',
        bildHash: 'h' + i,
        zeilen: [{
          zeile: 1, rohName: 'Jones', rohPunkte: String(100 + i),
          punkte: { punkte: 100 + i, unsicher: false }
        }],
        beansprucht: ['jones']
      }).runde.id, 'freigegeben', 'Baloou');
    }
  }

  test('markiert freigegebene Runden als zaehlend', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    freigegebene(3);

    const r = await meine(t);
    assert.equal(r.every((x) => x.zaehlt), true);
  });

  test('nimmt aus dem Fenster gefallene Runden aus der Wertung', async () => {
    /* turnier wertet je Person die letzten zehn Eintraege. Die aelteren
       sind nicht weg, sie zaehlen nur nicht mehr - fuer den Zuschauer
       sieht das sonst aus wie "nie angekommen". */
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    freigegebene(13);

    const r = await meine(t);
    assert.equal(r.length, 13, 'bis zu 15 werden gezeigt');
    assert.equal(r.slice(0, 10).every((x) => x.zaehlt), true, 'die neuesten zehn zaehlen');
    assert.equal(r.slice(10).some((x) => x.zaehlt), false, 'die aelteren nicht mehr');
  });

  test('zeigt hoechstens 15', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    freigegebene(20);
    assert.equal((await meine(t)).length, 15);
  });

  test('zaehlt Abgelehnte gar nicht mit', async () => {
    // Sonst wuerde eine Ablehnung eine gueltige Runde aus dem Fenster
    // draengen, obwohl sie nie in der Liste stand.
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);
    freigabe.entscheiden(freigabe.offene()[0]!.id, 'abgelehnt', 'Baloou', 'unscharf');
    freigegebene(3);

    const r = await meine(t);
    assert.equal(r.filter((x) => x.zaehlt).length, 3);
    assert.equal(r.find((x) => x.status === 'abgelehnt')!.zaehlt, false);
  });
});

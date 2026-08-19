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
import { ladeSpiegel, type Karteispiegel } from '../src/spiegel.js';
import { ladeNachtrag, type Nachtragliste } from '../src/nachtrag.js';
import { TurnierNichtErreichbar, type Spiel } from '../src/turnier-client.js';
import type { KarteiPerson } from '../src/namen.js';

/* =========================================================================
   DER EIGENTLICHE BEWEIS: mc-ranked arbeitet weiter, waehrend der
   Turnier-Server weg ist.

   Vorher endete jeder Upload in diesem Zustand mit einem 502, und die
   Runde des Zuschauers war verloren - sie landete nicht einmal in der
   Warteschlange. Genau das wird hier durchgespielt, mit demselben
   Aufbau wie in cli/serve.ts: Spiegel vor holeZustand, Nachtragsliste
   vor dem Eintragen.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-ohne-turnier-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const KARTEI: readonly KarteiPerson[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'TREV', aliases: [] },
  { id: 'p3', name: 'mj', aliases: [] }
];
const SPIEL: Spiel = { id: 'sp_test', name: 'Meccha 2026', eintraege: 12 };

const ADMIN = 'test-schluessel';

/** Steht der Turnier-Server gerade? Jeder Test dreht daran. */
let turnierDa = true;
/** Was beim Turnier-Server angekommen ist. */
let eingetragen: Array<{ name: string; punkte: number }> = [];
/** Was der eingesetzte Leser aus dem Bild macht. */
let leserAntwort = '';

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let tokens: Tokenliste;
let spiegel: Karteispiegel;
let nachtrag: Nachtragliste;
let n = 0;

before(async () => {
  server = baueServer({
    get freigabe() { return freigabe; },
    get tokens() { return tokens; },
    bilderDir: path.join(ORDNER, 'bilder'),
    adminKey: ADMIN,
    leser: async () => leserAntwort,
    bildpruefer: () => ({ bloecke: [], wirktEcht: true, auffaelligkeiten: [] }),

    // Genau die Verdrahtung aus cli/serve.ts.
    holeZustand: () => spiegel.holen(),
    eintragen: (gameId, e) => nachtrag.trageEinOderMerke(gameId, e),
    get spiegel() { return spiegel; },
    get nachtrag() { return nachtrag; }
  });

  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((f) => server.close(() => f()));
});

beforeEach(() => {
  n++;
  turnierDa = true;
  eingetragen = [];
  antwortMit(2771);

  freigabe = ladeFreigabeliste(path.join(ORDNER, 'freigabe-' + n + '.json'));
  tokens = ladeTokens(path.join(ORDNER, 'tokens-' + n + '.json'));

  spiegel = ladeSpiegel(path.join(ORDNER, 'spiegel-' + n + '.json'), async () => {
    if (!turnierDa) throw new TurnierNichtErreichbar('http://turnier.test', 'ECONNREFUSED');
    return {
      zustand: { kartei: KARTEI, spiele: [SPIEL], fenster: 10, voll: 10 },
      spiel: SPIEL
    };
  });

  nachtrag = ladeNachtrag(path.join(ORDNER, 'nachtrag-' + n + '.json'), async (_gameId, e) => {
    if (!turnierDa) throw new TurnierNichtErreichbar('http://turnier.test', 'ECONNREFUSED');
    eingetragen.push({ name: e.name, punkte: e.punkte });
  });
});

/* ------------------------------------------------------------ Werkzeug */

/**
 * Legt fest, was der Leser meldet.
 *
 * Die Punktzahl unterscheidet die Runden: gleiche Zeilen waeren dieselbe
 * Partie, und die zweite Einreichung wuerde als Dublette abgewiesen -
 * hier soll aber der Turnier-Ausfall geprueft werden, nicht das.
 */
function antwortMit(punkte: number): void {
  leserAntwort = JSON.stringify({
    zeilen: [
      { name: 'Jones', rohPunkte: String(punkte) },
      { name: 'TREV', rohPunkte: String(punkte - 900) },
      { name: 'mj', rohPunkte: String(punkte - 2000) }
    ]
  });
}

/** Waermt den Spiegel an: ein erfolgreicher Abruf, wie im Betrieb ueblich. */
async function spiegelFuellen(): Promise<void> {
  await spiegel.holen();
}

async function lade(token: string): Promise<{ code: number; body: Record<string, unknown> }> {
  const res = await fetch(basis + '/api/runde', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-MC-Token': token },
    body: new Uint8Array(Buffer.from('PNG-' + Math.random()))
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function admin(pfad: string, optionen: RequestInit = {}) {
  const res = await fetch(basis + pfad + '?key=' + ADMIN, optionen);
  return { code: res.status, body: (await res.json()) as Record<string, never> };
}

/* ------------------------------------------------------- Uploads */

describe('Ohne Turnier-Server - Uploads', () => {
  test('nimmt die Runde eines Zuschauers an, waehrend turnier weg ist', async () => {
    // Der Kern der Sache. Vorher: 502, Runde weg, nochmal F9 druecken.
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    const { code, body } = await lade(t);

    assert.equal(code, 200);
    assert.equal(body.ok, true);
    assert.equal(freigabe.offene().length, 1, 'sie muss in der Warteschlange stehen');
  });

  test('ordnet dabei ueber die gespiegelte Kartei zu', async () => {
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);

    // Ohne Kartei waere die Zeile eine Rueckfrage - hier ist sie zugeordnet.
    const runde = freigabe.offene()[0]!;
    assert.deepEqual(runde.beansprucht, ['jones']);
    assert.equal(runde.zeilen.some((z) => z.rohName === 'Jones'), true);
  });

  test('weist ab, solange es noch gar keinen Stand gibt', async () => {
    /* Ein Server, der noch nie mit turnier gesprochen hat, kann keinen
       Namen zuordnen. Dann ist ein ehrliches 502 richtig. */
    turnierDa = false;

    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    const { code, body } = await lade(t);

    assert.equal(code, 502);
    assert.match(String(body.fehler), /nicht erreichbar/);
  });
});

/* ------------------------------------------------------- Freigeben */

describe('Ohne Turnier-Server - Freigeben', () => {
  test('merkt die Eintraege vor, statt die Freigabe scheitern zu lassen', async () => {
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);
    const id = freigabe.offene()[0]!.id;

    const a = await admin('/api/entscheiden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'freigegeben', von: 'Baloou' })
    });

    assert.equal(a.code, 200);
    assert.equal(a.body.ok, true);
    assert.equal(a.body.geschrieben, 0);
    assert.equal(a.body.gemerkt, 1, 'eine Zeile wartet jetzt');
    assert.equal(nachtrag.anzahl(), 1);
    assert.deepEqual(eingetragen, []);
  });

  test('die Runde gilt trotzdem als freigegeben', async () => {
    /* Sonst muesste sie spaeter nochmal freigegeben werden - und alles,
       was beim ersten Mal durchkam, waere doppelt drin. */
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);
    const id = freigabe.offene()[0]!.id;

    await admin('/api/entscheiden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'freigegeben', von: 'Baloou' })
    });

    assert.equal(freigabe.offene().length, 0);
    assert.equal(freigabe.alle().find((r) => r.id === id)!.status, 'freigegeben');
  });

  test('traegt nach, sobald turnier wieder da ist', async () => {
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);
    const id = freigabe.offene()[0]!.id;
    await admin('/api/entscheiden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'freigegeben', von: 'Baloou' })
    });

    turnierDa = true;
    const a = await admin('/api/nachtrag-jetzt', { method: 'POST' });

    assert.equal(a.body.erledigt, 1);
    assert.equal(a.body.offen, 0);
    assert.deepEqual(eingetragen, [{ name: 'Jones', punkte: 2771 }]);
    assert.equal(nachtrag.anzahl(), 0);
  });
});

/* ------------------------------------------- Zugaenge ohne Freigabe */

describe('Ohne Turnier-Server - Zugang ohne Freigabe', () => {
  test('meldet dem Client, dass der Eintrag wartet', async () => {
    await spiegelFuellen();
    turnierDa = false;

    // ohneFreigabe: geht sonst direkt in die Punkteliste.
    const t = tokens.anlegen('Vertrauter Gast', false, 'Jones', true).token;
    const { code, body } = await lade(t);

    assert.equal(code, 200);
    assert.equal(body.direkt, true);
    assert.equal(body.geschrieben, 0);
    assert.equal(body.gemerkt, 1);
    assert.equal(nachtrag.anzahl(), 1);
  });

  test('traegt sofort ein, wenn turnier da ist', async () => {
    // Gegenprobe: ohne Ausfall darf sich nichts geaendert haben.
    const t = tokens.anlegen('Vertrauter Gast', false, 'Jones', true).token;
    const { body } = await lade(t);

    assert.equal(body.geschrieben, 1);
    assert.equal(body.gemerkt, 0);
    assert.deepEqual(eingetragen, [{ name: 'Jones', punkte: 2771 }]);
    assert.equal(nachtrag.anzahl(), 0);
  });
});

/* ---------------------------------------------------------- Dashboard */

describe('Ohne Turnier-Server - was das Dashboard zeigt', () => {
  test('sagt ehrlich, dass turnier weg ist und aus dem Spiegel gearbeitet wird', async () => {
    /* Mit Spiegel antwortet holeZustand() auch im Ausfall - ohne die
       Lage stuende hier faelschlich "erreichbar". */
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);

    const a = await admin('/api/uebersicht');
    const turnier = a.body.turnier as unknown as {
      erreichbar: boolean; ausSpiegel: boolean; gespiegeltAm: number; kartei: number;
    };

    assert.equal(turnier.erreichbar, false);
    assert.equal(turnier.ausSpiegel, true);
    assert.ok(turnier.gespiegeltAm > 0);
    assert.equal(turnier.kartei, 3, 'die gespiegelte Kartei steht weiter zur Verfuegung');
  });

  test('zaehlt die wartenden Eintraege', async () => {
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t);

    const a = await admin('/api/uebersicht');
    const nt = a.body.nachtrag as unknown as { wartend: number; letzterFehler: string };
    assert.equal(nt.wartend, 1);
    assert.match(String(nt.letzterFehler), /ECONNREFUSED/);
  });

  test('listet sie mit Name und Punktzahl auf', async () => {
    // Damit man nachsehen kann, was fehlt - und es notfalls von Hand tippt.
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t);

    const a = await admin('/api/nachtrag');
    const w = a.body.wartend as unknown as Array<{ name: string; punkte: number; absender: string }>;

    assert.equal(w.length, 1);
    assert.equal(w[0]!.name, 'Jones');
    assert.equal(w[0]!.punkte, 2771);
  });

  test('laesst einen Nachtrag wegwerfen', async () => {
    await spiegelFuellen();
    turnierDa = false;

    const t = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t);

    const liste = await admin('/api/nachtrag');
    const id = (liste.body.wartend as unknown as Array<{ id: string }>)[0]!.id;

    const weg = await admin('/api/nachtrag-loeschen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    assert.equal(weg.code, 200);
    assert.equal(nachtrag.anzahl(), 0);
  });

  test('schuetzt die Nachtrags-Endpunkte mit dem Admin-Schluessel', async () => {
    for (const pfad of ['/api/nachtrag', '/api/nachtrag-jetzt', '/api/nachtrag-loeschen']) {
      const res = await fetch(basis + pfad + '?key=falsch', { method: 'POST' });
      assert.equal(res.status, 401, pfad);
    }
  });
});

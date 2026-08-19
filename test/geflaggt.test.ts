import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer } from '../src/server.js';
import { ladeFreigabeliste, VERDACHT_BILD_STUNDEN, type Freigabeliste } from '../src/freigabe.js';
import { ladeTokens, type Tokenliste } from '../src/tokens.js';
import type { Spiel } from '../src/turnier-client.js';
import type { KarteiPerson } from '../src/namen.js';

/* =========================================================================
   GEFLAGGT - was passiert, wenn dieselbe Punktzahl wiederkommt.

   Der wichtigste Test dieser Datei ist der zweite: ein Zugang auf
   "zaehlt sofort" darf NICHT durchlaufen, wenn er auffaellt. Sonst waere
   die Pruefung genau dort wirkungslos, wo Faelschen sich lohnt - bei
   jemandem, dem schon vertraut wird und dessen Bilder niemand mehr
   ansieht.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-geflaggt-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const KARTEI: readonly KarteiPerson[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'TREV', aliases: [] },
  { id: 'p3', name: 'mj', aliases: [] }
];
const SPIEL: Spiel = { id: 'sp_test', name: 'Meccha 2026', eintraege: 3 };
const ADMIN = 'test-schluessel';

let eingetragen: Array<{ name: string; punkte: number }> = [];
let leserAntwort = '';
/** Steuert die eingesetzte Bildpruefung je Test. */
let bildWirktEcht = true;

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let tokens: Tokenliste;
let n = 0;

before(async () => {
  server = baueServer({
    get freigabe() { return freigabe; },
    get tokens() { return tokens; },
    bilderDir: path.join(ORDNER, 'bilder'),
    adminKey: ADMIN,
    leser: async () => leserAntwort,
    // Erfundene Testbilder - die echte Pruefung wuerde jede Runde anhalten.
    bildpruefer: () => ({
      bloecke: [],
      wirktEcht: bildWirktEcht,
      auffaelligkeiten: bildWirktEcht ? [] : ['Metadaten fehlen']
    }),
    holeZustand: async () => ({
      zustand: { kartei: KARTEI, spiele: [SPIEL], fenster: 10, voll: 10 },
      spiel: SPIEL
    }),
    eintragen: async (_gameId, e) => { eingetragen.push({ name: e.name, punkte: e.punkte }); }
  });

  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise<void>((f) => server.close(() => f()));
});

beforeEach(() => {
  n++;
  eingetragen = [];
  bildWirktEcht = true;
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'freigabe-' + n + '.json'));
  tokens = ladeTokens(path.join(ORDNER, 'tokens-' + n + '.json'));
  antwort(11714, 800);
});

/* ------------------------------------------------------------ Werkzeug */

/**
 * Was der Leser meldet: die eigene Zeile und zwei Mitspieler.
 *
 * Die Mitspieler-Punktzahl macht die Partie eindeutig - sonst waere die
 * zweite Einreichung dieselbe Partie und wuerde schon vorher abgewiesen.
 * Genau darum geht es hier: echte, verschiedene Runden, immer derselbe
 * eigene Wert.
 */
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

/* --------------------------------------------------------- Der Kernfall */

describe('Geflaggt - Zugang ohne Freigabe', () => {
  test('laesst die erste Runde durchlaufen', async () => {
    const t = tokens.anlegen('Gast', false, 'Jones', true).token;
    const { body } = await lade(t);

    assert.equal(body.direkt, true);
    assert.equal(body.geschrieben, 1);
    assert.deepEqual(eingetragen, [{ name: 'Jones', punkte: 11714 }]);
  });

  test('haelt die zweite mit derselben Punktzahl an', async () => {
    const t1 = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t1);

    // Anderer Token, andere Partie - aber wieder exakt 11714.
    antwort(11714, 640);
    const t2 = tokens.anlegen('Gast zwei', false, 'Jones', true).token;
    const { code, body } = await lade(t2);

    assert.equal(code, 200);
    assert.equal(body.geflaggt, true);
    assert.notEqual(body.direkt, true, 'sie darf NICHT direkt eingetragen werden');
    assert.equal(eingetragen.length, 1, 'nur die erste Runde ist in der Liste');
    assert.equal(freigabe.offene().length, 1, 'die zweite wartet auf Pruefung');
  });

  test('schreibt den Grund zur Runde', async () => {
    const t1 = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t1);
    antwort(11714, 640);
    const t2 = tokens.anlegen('Gast zwei', false, 'Jones', true).token;
    await lade(t2);

    const runde = freigabe.offene()[0]!;
    assert.ok((runde.verdacht ?? []).length > 0);
    assert.match(runde.verdacht![0]!, /2\. Mal mit exakt 11714/);
  });

  test('haelt eine andere Punktzahl nicht an', async () => {
    // Gegenprobe: ohne Wiederholung bleibt alles wie vorher.
    const t1 = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t1);

    antwort(9021, 640);
    const t2 = tokens.anlegen('Gast zwei', false, 'Jones', true).token;
    const { body } = await lade(t2);

    assert.equal(body.direkt, true);
    assert.equal(body.geflaggt, undefined);
    assert.equal(eingetragen.length, 2);
  });

  test('haelt auch ein nachbearbeitetes Bild an', async () => {
    /* Zweiter Auffaelligkeitsgrund neben der wiederholten Punktzahl.
       Ohne ihn kaeme genau am Zugang, dem man vertraut hat, ein in
       Paint bearbeitetes Bild ungesehen durch. */
    bildWirktEcht = false;

    const t = tokens.anlegen('Gast', false, 'Jones', true).token;
    const { body } = await lade(t);

    assert.equal(body.geflaggt, true);
    assert.notEqual(body.direkt, true);
    assert.deepEqual(eingetragen, [], 'nichts darf ungesehen eingetragen werden');
    assert.match(freigabe.offene()[0]!.verdacht![0]!, /nachbearbeitet/);
  });

  test('haelt inhaltsgleiche Zeilen an', async () => {
    /* Dieselben Namen und Punktzahlen wie eine fruehere Runde, nur von
       einem anderen Mitspieler eingereicht. Fuer DIESELBE Person greift
       schon die Partie-Sperre eine Stufe frueher ("schon gewertet"). */
    const jones = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(jones);

    const trev = tokens.anlegen('Mitspieler', false, 'TREV', true).token;
    const { body } = await lade(trev);

    assert.equal(body.geflaggt, true);
    assert.equal(eingetragen.length, 1, 'nur die erste Runde ist eingetragen');
    assert.match(freigabe.offene()[0]!.verdacht![0]!, /Dieselben Zeilen/);
  });

  test('haelt vertraute Zugaenge nicht an', async () => {
    /* Das sind deine eigenen Rechner. Dort steht niemand Fremdes davor -
       und wenn du selbst zweimal denselben Wert einreichst, willst du
       dich nicht selbst freigeben muessen. */
    const t1 = tokens.anlegen('Spiel-PC', true).token;
    await lade(t1);

    antwort(11714, 640);
    const t2 = tokens.anlegen('Spiel-PC zwei', true).token;
    const { body } = await lade(t2);

    assert.equal(body.direkt, true);
    assert.equal(eingetragen.length, 6, 'vertraut heisst: die ganze Lobby, zweimal drei Zeilen');
  });
});

/* ------------------------------------------------- Zuschauer mit Freigabe */

describe('Geflaggt - Zugang mit Freigabe', () => {
  test('meldet dem Client, dass die Runde auffiel', async () => {
    const t1 = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t1);

    antwort(11714, 640);
    const t2 = tokens.anlegen('Zuschauerin zwei', false, 'Jones').token;
    const { body } = await lade(t2);

    assert.equal(body.geflaggt, true);
    assert.equal(freigabe.offene().length, 2, 'beide warten, die zweite mit Flagge');
  });

  test('zaehlt auch abgelehnte Runden als Wiederholung mit', async () => {
    /* Wer abgelehnt wurde und es erneut versucht, ist der Fall, um den
       es geht - die Ablehnung darf ihn nicht aus der Zaehlung nehmen. */
    const t1 = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t1);
    const id = freigabe.offene()[0]!.id;
    freigabe.entscheiden(id, 'abgelehnt', 'Baloou', 'sieht bearbeitet aus');

    antwort(11714, 640);
    const t2 = tokens.anlegen('Zuschauerin zwei', false, 'Jones').token;
    const { body } = await lade(t2);

    assert.equal(body.geflaggt, true);
  });
});

/* ---------------------------------------------------------- Dashboard */

describe('Geflaggt - was das Dashboard bekommt', () => {
  test('liefert Verdacht und Vorgeschichte mit', async () => {
    const t1 = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t1);
    freigabe.entscheiden(freigabe.offene()[0]!.id, 'abgelehnt', 'Baloou', 'gefaelscht');

    antwort(11714, 640);
    const t2 = tokens.anlegen('Zuschauerin zwei', false, 'Jones').token;
    await lade(t2);

    const res = await fetch(basis + '/api/offene?key=' + ADMIN);
    const j = (await res.json()) as {
      offen: Array<{
        verdacht: string[];
        vorgeschichte: string | null;
        verlauf: Array<{ punkte: number; status: string }>;
      }>;
    };

    assert.equal(j.offen.length, 1);
    assert.match(j.offen[0]!.verdacht[0]!, /2\. Mal/);
    assert.match(String(j.offen[0]!.vorgeschichte), /abgelehnt/);

    // Womit verglichen wurde - mit Bild, solange es noch da ist.
    const v = (j.offen[0] as unknown as {
      vergleiche: Array<{ punkte: number; absender: string; bildDa: boolean }>;
    }).vergleiche;
    assert.equal(v.length, 1, 'die abgelehnte Runde von vorhin');
    assert.equal(v[0]!.punkte, 11714);
    assert.equal(v[0]!.bildDa, true);

    // Und der Verlauf der Person, damit man die Zahl einordnen kann.
    assert.deepEqual(j.offen[0]!.verlauf.map((v) => [v.punkte, v.status]),
      [[11714, 'abgelehnt']]);
  });
});

/* -------------------------------------------------------- Aufbewahrung */

describe('Geflaggt - das Bild bleibt liegen', () => {
  test('hebt das Bild ueber die uebliche Frist hinaus auf', async () => {
    /* Ohne Bild ist eine Faelschung spaeter nicht mehr nachzuvollziehen -
       und ein Muster faellt oft erst nach Wochen auf. */
    const t1 = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t1);
    antwort(11714, 640);
    const t2 = tokens.anlegen('Gast zwei', false, 'Jones', true).token;
    await lade(t2);

    const geflaggt = freigabe.offene()[0]!;
    freigabe.entscheiden(geflaggt.id, 'abgelehnt', 'Baloou', 'gefaelscht');

    // Zwei Tage spaeter: normale Bilder waeren laengst weg.
    const zweiTage = Date.now() + 48 * 60 * 60 * 1000;
    freigabe.bilderAufraeumen(24, zweiTage);

    assert.equal(freigabe.finde(geflaggt.id)!.bildGeloescht, undefined);
    assert.equal(existsSync(geflaggt.bildPfad), true);
  });

  test('loescht es nach der langen Frist doch', async () => {
    const t1 = tokens.anlegen('Gast', false, 'Jones', true).token;
    await lade(t1);
    antwort(11714, 640);
    const t2 = tokens.anlegen('Gast zwei', false, 'Jones', true).token;
    await lade(t2);

    const geflaggt = freigabe.offene()[0]!;
    freigabe.entscheiden(geflaggt.id, 'abgelehnt', 'Baloou', 'gefaelscht');

    const spaeter = Date.now() + (VERDACHT_BILD_STUNDEN + 24) * 60 * 60 * 1000;
    freigabe.bilderAufraeumen(24, spaeter);

    assert.equal(freigabe.finde(geflaggt.id)!.bildGeloescht, true);
  });

  test('raeumt gewoehnliche Runden weiter nach der kurzen Frist auf', async () => {
    const t = tokens.anlegen('Zuschauerin', false, 'Jones').token;
    await lade(t);

    const runde = freigabe.offene()[0]!;
    freigabe.entscheiden(runde.id, 'freigegeben', 'Baloou');
    freigabe.bilderAufraeumen(24, Date.now() + 48 * 60 * 60 * 1000);

    assert.equal(freigabe.finde(runde.id)!.bildGeloescht, true);
  });
});

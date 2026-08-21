import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer } from '../src/server.js';
import { Freigabeliste, ladeFreigabeliste } from '../src/freigabe.js';
import {
  Tokenliste, ladeTokens, RUECKNAHME_MS, RUECKNAHME_HAEUFIG, ABSTAND_ANGENOMMEN_MS
} from '../src/tokens.js';
import type { Spieler } from '../src/namen.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   DIE LETZTE EINREICHUNG ZURUECKHOLEN

   Der Absender sieht erst NACH dem Absenden, was der Leser aus seinem
   Bild gemacht hat. Steht dort Unsinn, half bisher nur warten - drei
   Minuten, und die Lobby ist weiter.

   Das Gewicht dieser Tests liegt nicht auf "es funktioniert", sondern
   auf den beiden Regeln, die es davor bewahren, ein Werkzeug zum
   Wuerfeln zu werden:

     - einmal je Partie. Sonst schickt jemand dieselbe Runde immer
       wieder ein und holt sie zurueck, bis die Zeichenerkennung ihm
       einmal eine hoehere Zahl liest.
     - wer es haeufig tut, wird geflaggt. Nicht gesperrt - ein unruhiger
       Bildschirm ist kein Betrug. Aber dann sieht ein Mensch drauf.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-ruecknahme-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const SPIELER: readonly Spieler[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'mj', aliases: [] },
  { id: 'p3', name: 'TREV', aliases: [] }
];

let eingetragen: Array<{ kontoId: string; punkte: number }> = [];
let entfernt: string[] = [];
let naechsteKennung = 0;

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let tokens: Tokenliste;
let token: string;
let eigenerToken: string;
let n = 0;

/** Jede Runde andere Punkte, damit sie eine eigene Partie-Kennung bekommt. */
function leser(): string {
  naechsteKennung++;
  return JSON.stringify({
    zeilen: [
      { name: 'Jones', rohPunkte: String(2000 + naechsteKennung) },
      { name: 'TREV', rohPunkte: String(900 + naechsteKennung) },
      { name: 'mj', rohPunkte: String(200 + naechsteKennung) }
    ]
  });
}
let antwort = leser();

before(async () => {
  server = baueServer({
    get freigabe() { return freigabe; },
    get tokens() { return tokens; },
    bilderDir: path.join(ORDNER, 'bilder'),
    /* Die Fixtures haben drei Zeilen. Hier geht es um die
       Ruecknahme, nicht um die Mindestzahl - die prueft
       server.test.ts. */
    minSpieler: 0,
    leser: async () => antwort,
    bildpruefer: () => ({ bloecke: [], wirktEcht: true, auffaelligkeiten: [] }),
    eintragen: (kontoId, punkte) => {
      eingetragen.push({ kontoId, punkte });
      return ['e_' + eingetragen.length];
    },
    zuruecknehmen: (ids) => { entfernt.push(...ids); },
    holeStand: () => standMit(SPIELER)
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => { await new Promise<void>((f) => server.close(() => f())); });

beforeEach(() => {
  n++;
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'f-' + n + '.json'));
  tokens = ladeTokens(path.join(ORDNER, 't-' + n + '.json'));
  token = tokens.anlegen('Zuschauerin', false, 'Jones').token;
  eigenerToken = tokens.anlegen('Spiel-PC', true).token;
  eingetragen = [];
  entfernt = [];
  antwort = leser();
});

async function schicke(inhalt: string, wer = token) {
  const res = await fetch(basis + '/api/runde', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-MC-Token': wer },
    body: new Uint8Array(Buffer.from('PNG-' + inhalt))
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

async function zurueck(wer = token) {
  const res = await fetch(basis + '/api/ruecknahme', {
    method: 'POST', headers: { 'X-MC-Token': wer }
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('Ruecknahme', () => {
  test('der Server sagt beim Einreichen, wie lange sie geht', async () => {
    /* Die Frist kommt vom SERVER, nicht aus einer Konstante im Client.
       Sonst zaehlt der Client etwas herunter, das drueben laengst
       abgelaufen ist. */
    const { body } = await schicke('a');
    assert.equal(body.ruecknahmeMs, RUECKNAHME_MS);
  });

  test('holt die Runde ganz aus der Liste', async () => {
    await schicke('b');
    assert.equal(freigabe.alle().length, 1);

    const { code, body } = await zurueck();
    assert.equal(code, 200);
    assert.equal(body.ok, true);
    assert.equal(freigabe.alle().length, 0, 'die Runde muss WEG sein');
  });

  test('entfernt statt abzulehnen - sonst sperrt die Partie-Kennung', async () => {
    /* DER Punkt. Bliebe die Runde als "abgelehnt" stehen, floege der
       zweite Versuch als "diese Partie ist schon erfasst" heraus - und
       genau der zweite Versuch ist der Zweck der Ruecknahme. */
    await schicke('c');
    await zurueck();

    const { code, body } = await schicke('c-nochmal');
    assert.equal(code, 200);
    assert.equal(body.neu, true, 'derselbe Endstand muss wieder durchgehen');
  });

  test('macht sofort wieder frei', async () => {
    /* Drei Minuten zu warten waere hier sinnlos: bis dahin ist die
       Lobby weiter, und der zweite Versuch ist das Einzige, worum es
       geht. */
    await schicke('d');
    const t1 = tokens.finde(token);
    assert.ok((t1!.sperreBis ?? 0) > Date.now() + ABSTAND_ANGENOMMEN_MS / 2,
      'nach dem Einreichen gilt der lange Abstand');

    await zurueck();
    const t2 = tokens.finde(token);
    assert.ok((t2!.sperreBis ?? 0) <= Date.now() + 100, 'danach sofort frei');
  });

  test('nimmt auch die Ranglisten-Eintraege zurueck', async () => {
    // Der eigene Rechner wertet direkt - dann haengt mehr daran.
    await schicke('e', eigenerToken);
    assert.ok(eingetragen.length > 0, 'erst muss etwas eingetragen sein');

    await zurueck(eigenerToken);
    assert.equal(entfernt.length, eingetragen.length,
      'jeder Eintrag muss wieder verschwinden');
  });

  test('ein zweiter Klick geht ins Leere', async () => {
    /* Nicht ein zweites Mal wirken: sonst raeumt der Doppelklick die
       Runde davor mit weg. */
    await schicke('f');
    assert.equal((await zurueck()).code, 200);

    const { code, body } = await zurueck();
    assert.equal(code, 409);
    assert.equal(body.art, 'nichts');
  });

  test('ohne Einreichung gibt es nichts zurueckzuholen', async () => {
    const { code, body } = await zurueck();
    assert.equal(code, 409);
    assert.equal(body.art, 'nichts');
  });

  test('ohne gueltigen Token gar nichts', async () => {
    const res = await fetch(basis + '/api/ruecknahme', {
      method: 'POST', headers: { 'X-MC-Token': 'erfunden' }
    });
    assert.equal(res.status, 401);
  });
});

describe('Ruecknahme - gegen die Wuerfelbude', () => {
  test('dieselbe Partie laesst sich nur EINMAL zurueckholen', async () => {
    /* Ohne diese Regel: einschicken, zurueckholen, einschicken,
       zurueckholen - bis die Zeichenerkennung einmal eine hoehere Zahl
       liest. Nur die guten Wuerfe blieben stehen.

       Der ehrliche Fall braucht sie nicht: ein Lesefehler faellt beim
       ersten Mal auf. */
    await schicke('g');
    assert.equal((await zurueck()).code, 200);

    // Dieselbe Partie noch einmal - der Leser gibt dieselben Zahlen.
    const gleich = antwort;
    antwort = gleich;
    await schicke('g-nochmal');

    const zweite = await zurueck();
    assert.equal(zweite.code, 409, 'ein zweites Mal darf es nicht geben');
  });

  test('eine ANDERE Partie darf wieder zurueckgeholt werden', async () => {
    // Die Regel gilt je Partie, nicht als Lebenskontingent.
    await schicke('h');
    assert.equal((await zurueck()).code, 200);

    antwort = leser();               // andere Punkte, andere Kennung
    await schicke('i');
    assert.equal((await zurueck()).code, 200);
  });

  test('haeufiges Zurueckholen flaggt die naechste Runde', async () => {
    /* Keine Sperre - wer haeufig zurueckholt, kann auch nur einen
       unruhigen Bildschirm haben. Aber dann sieht ein Mensch drauf und
       das Bild bleibt liegen, statt lautlos durchzugehen. */
    for (let i = 0; i < RUECKNAHME_HAEUFIG; i++) {
      antwort = leser();
      await schicke('haeufig-' + i);
      assert.equal((await zurueck()).code, 200, 'Ruecknahme ' + i);
    }

    antwort = leser();
    const { body } = await schicke('danach');
    assert.equal(body.geflaggt, true,
      'nach ' + RUECKNAHME_HAEUFIG + ' Ruecknahmen wird geprueft');
  });

  test('darunter wird NICHT geflaggt', async () => {
    // Einmal ist ein Lesefehler. Dafuer gibt es die Ruecknahme.
    antwort = leser();
    await schicke('einmal');
    await zurueck();

    antwort = leser();
    const { body } = await schicke('danach');
    assert.equal(body.geflaggt, false);
  });
});

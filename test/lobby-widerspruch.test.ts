import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { baueServer } from '../src/server.js';
import { Freigabeliste, ladeFreigabeliste } from '../src/freigabe.js';
import { Tokenliste, ladeTokens } from '../src/tokens.js';
import type { Spieler } from '../src/namen.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   DIESELBE PARTIE, ZWEI VERSCHIEDENE NAMEN

   Am 21.08.2026 vorgefuehrt: einen echten Screenshot nehmen, in einem
   Bildprogramm den eigenen Namen ueber die erste Zeile legen, das
   Ergebnis auf den Bildschirm holen und F9 druecken.

   Der Client fotografiert dann den Bildschirm - und was dabei entsteht,
   ist eine tadellose Windows-Aufnahme. Die Bildpruefung fand nichts,
   weil es nichts zu finden gab: die DATEI war echt, nur ihr Inhalt
   nicht. Nachgemessen an der hochgeladenen Datei: gAMA vorhanden,
   Datenbloecke à 65.524 Byte, genau wie eine echte Aufnahme.

   Innerhalb des Bildes ist ebenfalls nichts widerspruechlich: 1643 ueber
   1229 ueber 1189 ist eine voellig stimmige Rangliste. Es gibt keinen
   Haken, an dem ein Automat sich festhalten koennte.

   Verraten kann ihn nur, WER DASSELBE SCOREBOARD GESEHEN HAT.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-lobby-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const SPIELER: readonly Spieler[] = [
  { id: 'p_baloou', name: 'Baloou', aliases: [] },
  { id: 'p_rokky', name: 'Rokky', aliases: [] },
  { id: 'p_nori', name: 'Nori', aliases: [] }
];

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let tokens: Tokenliste;
let baloou: string;
let rokky: string;
let antwort = '';
let n = 0;

/** Das echte Scoreboard: Rokky vorne mit 1643. */
const ECHT = JSON.stringify({
  zeilen: [
    { name: 'Rokky', rohPunkte: '1643' },
    { name: 'Baloou', rohPunkte: '533' },
    { name: 'Nori', rohPunkte: '384' }
  ]
});

/** Dasselbe Bild, aber der Name der ersten Zeile ausgetauscht. */
const GEFAELSCHT = JSON.stringify({
  zeilen: [
    { name: 'Baloou', rohPunkte: '1643' },
    { name: 'Rokky', rohPunkte: '533' },
    { name: 'Nori', rohPunkte: '384' }
  ]
});

before(async () => {
  server = baueServer({
    get freigabe() { return freigabe; },
    get tokens() { return tokens; },
    bilderDir: path.join(ORDNER, 'bilder'),
    minSpieler: 0,
    leser: async () => antwort,
    bildpruefer: () => ({ bloecke: [], wirktEcht: true, auffaelligkeiten: [] }),
    eintragen: () => { /* nichts */ },
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
  baloou = tokens.anlegen('Baloou', false, 'Baloou').token;
  rokky = tokens.anlegen('Rokky', false, 'Rokky').token;
});

async function schicke(inhalt: string, wer: string, leser: string) {
  antwort = leser;
  const res = await fetch(basis + '/api/runde', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', 'X-MC-Token': wer },
    body: new Uint8Array(Buffer.from('PNG-' + inhalt))
  });
  return { code: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe('Lobby-Widerspruch', () => {
  test('der Name auf einer fremden Zeile faellt auf', async () => {
    /* DER Test. Rokky schickt das echte Bild - dort hat er selbst 1643.
       Baloou schickt danach dasselbe Scoreboard mit seinem Namen auf
       genau dieser Zeile. Die Partie-Kennung ist gleich, sie entsteht
       aus den Punktzahlen. */
    await schicke('echt', rokky, ECHT);
    const { body } = await schicke('gefaelscht', baloou, GEFAELSCHT);

    assert.equal(body.geflaggt, true,
      'die zweite Einsendung muss auffallen');
  });

  test('und der Grund nennt den anderen Absender', async () => {
    /* Ein Flag ohne Begruendung zwingt den Menschen, selbst zu suchen.
       Der Grund soll sagen, WO nachzusehen ist. */
    await schicke('echt2', rokky, ECHT);
    await schicke('gefaelscht2', baloou, GEFAELSCHT);

    const runde = freigabe.alle().find((r) => r.absender === 'Baloou');
    assert.ok(runde, 'die Runde fehlt');
    assert.match((runde.verdacht ?? []).join(' '), /Widerspruch/);
    assert.match((runde.verdacht ?? []).join(' '), /Rokky/);
    assert.match((runde.verdacht ?? []).join(' '), /1643/);
  });

  test('zwei ehrliche Einsendungen derselben Lobby sind KEIN Widerspruch', async () => {
    /* Der haeufige Fall: drei Zuschauer sitzen in einer Lobby und
       schicken alle ein. Sie sehen dasselbe Scoreboard, jeder
       beansprucht seine eigene Zeile - daran ist nichts falsch, und ein
       Flag hier waere die schnellste Art, die Pruefung wertlos zu
       machen. */
    await schicke('ehrlich-a', rokky, ECHT);
    await schicke('ehrlich-b', baloou, ECHT);

    /* Auf den GRUND geprueft, nicht auf die Sammelmeldung: dasselbe
       Scoreboard zweimal loest schon "inhaltsgleiche Runde" aus, und das
       ist eine andere, aeltere Regel. Sie ist hier auch richtig - ein
       Mensch darf ruhig sehen, dass zwei dasselbe Bild geschickt haben.
       Ein WIDERSPRUCH ist es aber nicht. */
    const runde = freigabe.alle().find((r) => r.absender === 'Baloou');
    assert.ok(runde);
    assert.doesNotMatch((runde.verdacht ?? []).join(' '), /Widerspruch/);
  });

  test('die erste Einsendung allein faellt nicht auf', async () => {
    // Ohne einen Zweiten gibt es nichts zu vergleichen. Das ist die
    // Grenze dieses Tests, und sie gehoert benannt.
    await schicke('allein', baloou, GEFAELSCHT);
    const runde = freigabe.alle().find((r) => r.absender === 'Baloou');
    assert.ok(runde);
    assert.doesNotMatch((runde.verdacht ?? []).join(' '), /Widerspruch/);
  });

  test('ein verlesener Name erfindet keinen Widerspruch', async () => {
    /* Die Erkennung verliest Namen staendig. Wer rohe Zeichenketten
       vergleicht, findet Widersprueche, wo nur die Schrift schwer
       lesbar war - und flaggt dann ehrliche Leute.

       "R0kky" mit Null zeigt ueber die uebliche Zuordnung weiterhin auf
       Rokkys Konto. Kein Widerspruch. */
    await schicke('unscharf-a', rokky, JSON.stringify({
      zeilen: [
        { name: 'R0kky', rohPunkte: '1643' },
        { name: 'Baloou', rohPunkte: '533' },
        { name: 'Nori', rohPunkte: '384' }
      ]
    }));
    await schicke('unscharf-b', baloou, ECHT);
    const runde = freigabe.alle().find((r) => r.absender === 'Baloou');
    assert.ok(runde);
    assert.doesNotMatch((runde.verdacht ?? []).join(' '), /Widerspruch/);
  });

  test('ein Aussteiger ohne Namen loest nichts aus', async () => {
    /* Verlaesst jemand die Partie, steht seine Punktzahl ohne Namen da
       ("?"). Das ist kein anderes Konto, sondern gar keins. */
    await schicke('weg-a', rokky, JSON.stringify({
      zeilen: [
        { name: '?', rohPunkte: '1643' },
        { name: 'Rokky', rohPunkte: '533' },
        { name: 'Nori', rohPunkte: '384' }
      ]
    }));
    await schicke('weg-b', baloou, GEFAELSCHT);
    const runde = freigabe.alle().find((r) => r.absender === 'Baloou');
    assert.ok(runde);
    assert.doesNotMatch((runde.verdacht ?? []).join(' '), /Widerspruch/);
  });
});

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { bearbeiteFreigabe } from '../src/freigabe-api.js';
import { ladeFreigabeliste, type Freigabeliste, type OffeneRunde } from '../src/freigabe.js';
import type { Spieler } from '../src/namen.js';
import { standMit } from './hilfe-stand.js';

/* =========================================================================
   DIE BILDERGALERIE

   Ihr Zweck ist das NEBENEINANDERLEGEN: kommt eine Punktzahl komisch vor,
   filtert man auf den Spieler und sieht seine letzten Ausschnitte als
   Reihe. Deshalb liegt das Gewicht dieser Tests auf den Filtern und der
   Reihenfolge - eine Galerie, die falsch sortiert oder beim Filtern
   jemanden verschluckt, ist schlimmer als keine.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-galerie-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const SPIELER: readonly Spieler[] = [{ id: 'p1', name: 'Jones', aliases: [] }];
const SCHLUESSEL = 'galerie-schluessel';

let server: http.Server;
let basis: string;
let freigabe: Freigabeliste;
let n = 0;

before(async () => {
  server = http.createServer(async (req, res) => {
    const behandelt = await bearbeiteFreigabe(req, res, {
      freigabe,
      adminKey: SCHLUESSEL,
      holeStand: () => standMit(SPIELER),
      eintragen: () => { /* nichts */ }
    });
    if (!behandelt) { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((f) => server.listen(0, '127.0.0.1', f));
  basis = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
});

after(async () => { await new Promise<void>((f) => server.close(() => f())); });

beforeEach(() => {
  n++;
  freigabe = ladeFreigabeliste(path.join(ORDNER, 'f-' + n + '.json'));
});

let bildZaehler = 0;

/** Legt eine Runde an, samt echter Dateien - bildDa prueft das Dasein. */
function runde(o: {
  absender: string;
  wer: string;
  punkte: number;
  eingegangen: number;
  status?: 'freigegeben' | 'abgelehnt';
  bearbeitetAm?: number;
  verdacht?: string[];
  ohneBild?: boolean;
}): OffeneRunde {
  bildZaehler++;
  const bildPfad = path.join(ORDNER, 'b-' + bildZaehler + '.png');
  const ausschnittPfad = path.join(ORDNER, 'b-' + bildZaehler + '.jpg');
  if (!o.ohneBild) {
    writeFileSync(bildPfad, 'gross');
    writeFileSync(ausschnittPfad, 'klein');
  }

  const r = freigabe.hinzufuegen({
    eingegangen: o.eingegangen,
    quelle: 'zuschauer',
    absender: o.absender,
    bildPfad,
    ausschnittPfad,
    bildHash: 'h-' + bildZaehler,
    zeilen: [{
      zeile: 1, rohName: o.wer, rohPunkte: String(o.punkte),
      punkte: { punkte: o.punkte, unsicher: false }
    }],
    beansprucht: [o.wer.toLowerCase()],
    ...(o.verdacht ? { verdacht: o.verdacht } : {})
  }).runde;

  if (o.status) {
    freigabe.entscheiden(r.id, o.status, 'Admin', o.status === 'abgelehnt' ? 'Bild wirkt bearbeitet' : undefined);
    if (o.bearbeitetAm !== undefined) r.bearbeitetAm = o.bearbeitetAm;
  }
  return r;
}

interface Kachel {
  id: string; absender: string; status: string; punkte: number | null;
  geflaggt: boolean; bildDa: boolean; originalDa: boolean; grund: string | null;
}

async function galerie(query = ''): Promise<{
  gesamt: number; namen: string[]; runden: Kachel[];
}> {
  const res = await fetch(basis + '/api/galerie?key=' + SCHLUESSEL + query);
  assert.equal(res.status, 200);
  return (await res.json()) as { gesamt: number; namen: string[]; runden: Kachel[] };
}

describe('Galerie - was sie zeigt', () => {
  test('ohne Schluessel gesperrt', async () => {
    assert.equal((await fetch(basis + '/api/galerie')).status, 401);
  });

  test('zeigt ALLE Runden, nicht nur die offenen', async () => {
    runde({ absender: 'A', wer: 'Jones', punkte: 100, eingegangen: 1000 });
    runde({ absender: 'B', wer: 'mj', punkte: 200, eingegangen: 2000, status: 'freigegeben' });
    runde({ absender: 'C', wer: 'TREV', punkte: 300, eingegangen: 3000, status: 'abgelehnt' });

    const g = await galerie();
    assert.equal(g.gesamt, 3);
    assert.deepEqual([...g.runden.map((r) => r.status)].sort(),
      ['abgelehnt', 'freigegeben', 'offen']);
  });

  test('nennt die beanspruchte Punktzahl', async () => {
    runde({ absender: 'A', wer: 'Jones', punkte: 2771, eingegangen: 1000 });
    assert.equal((await galerie()).runden[0]!.punkte, 2771);
  });

  test('meldet, ob ueberhaupt noch ein Bild da ist', async () => {
    runde({ absender: 'A', wer: 'Jones', punkte: 1, eingegangen: 1000 });
    runde({ absender: 'B', wer: 'Jones', punkte: 2, eingegangen: 2000, ohneBild: true });

    const g = await galerie();
    const mitBild = g.runden.filter((r) => r.bildDa);
    assert.equal(mitBild.length, 1, 'nur eine hat Dateien auf der Platte');
  });
});

describe('Galerie - Reihenfolge', () => {
  test('sortiert nach der zuletzt geschehenen Sache, neueste oben', async () => {
    /* Dieselbe Regel wie in der eigenen Rundenliste: sonst passt die
       Reihenfolge nicht zu den angezeigten Zeiten. */
    runde({ absender: 'frueh-entschieden', wer: 'Jones', punkte: 1, eingegangen: 1000 });
    runde({ absender: 'spaet-eingegangen', wer: 'Jones', punkte: 2, eingegangen: 5000 });
    runde({
      absender: 'alt-aber-frisch-entschieden', wer: 'Jones', punkte: 3,
      eingegangen: 2000, status: 'abgelehnt', bearbeitetAm: 9000
    });

    const g = await galerie();
    assert.equal(g.runden[0]!.absender, 'alt-aber-frisch-entschieden',
      'sie kam frueher an, wurde aber zuletzt entschieden');
  });
});

describe('Galerie - Filter', () => {
  beforeEach(() => {
    runde({ absender: 'A', wer: 'Jones', punkte: 100, eingegangen: 1000 });
    runde({ absender: 'B', wer: 'mj', punkte: 200, eingegangen: 2000, status: 'freigegeben' });
    runde({ absender: 'C', wer: 'TREV', punkte: 300, eingegangen: 3000, status: 'abgelehnt' });
    runde({
      absender: 'D', wer: 'Jones', punkte: 400, eingegangen: 4000,
      verdacht: ['3. Mal mit exakt 400 Punkten']
    });
  });

  test('nach Status', async () => {
    assert.equal((await galerie('&status=abgelehnt')).runden.length, 1);
    assert.equal((await galerie('&status=freigegeben')).runden.length, 1);
    assert.equal((await galerie('&status=offen')).runden.length, 2);
  });

  test('geflaggt ist ein eigener Filter, kein Status', async () => {
    /* Eine geflaggte Runde ist meistens OFFEN - beides nebeneinander zu
       filtern waere sonst unmoeglich. */
    const g = await galerie('&status=geflaggt');
    assert.equal(g.runden.length, 1);
    assert.equal(g.runden[0]!.absender, 'D');
    assert.equal(g.runden[0]!.geflaggt, true);
  });

  test('nach Spieler, ueber den beanspruchten Namen', async () => {
    const g = await galerie('&spieler=jones');
    assert.equal(g.runden.length, 2, 'A und D beanspruchen beide Jones');
  });

  test('Filter lassen sich kombinieren', async () => {
    const g = await galerie('&spieler=jones&status=offen');
    assert.equal(g.runden.length, 2);
  });

  test('die Namensliste kommt aus ALLEN Runden, nicht aus den gefilterten', async () => {
    /* Sonst schrumpfte die Auswahl, sobald man sie benutzt, und man
       kaeme nicht mehr zurueck. */
    const g = await galerie('&spieler=jones');
    assert.deepEqual([...g.namen].sort(), ['jones', 'mj', 'trev']);
  });

  test('ein Ablehnungsgrund wird mitgeliefert', async () => {
    const g = await galerie('&status=abgelehnt');
    assert.match(String(g.runden[0]!.grund), /bearbeitet/);
  });
});

describe('Galerie - Grenze', () => {
  test('liefert hoechstens so viele, wie verlangt, meldet aber die Gesamtzahl', async () => {
    for (let i = 0; i < 5; i++) {
      runde({ absender: 'A', wer: 'Jones', punkte: i + 1, eingegangen: 1000 + i });
    }
    const g = await galerie('&grenze=2');
    assert.equal(g.runden.length, 2);
    assert.equal(g.gesamt, 5, 'damit die Anzeige "2 von 5" sagen kann');
  });

  test('eine unsinnige Grenze wird gebaendigt', async () => {
    runde({ absender: 'A', wer: 'Jones', punkte: 1, eingegangen: 1000 });
    assert.equal((await galerie('&grenze=99999')).runden.length, 1);
    assert.equal((await galerie('&grenze=-5')).runden.length, 1);
    assert.equal((await galerie('&grenze=quatsch')).runden.length, 1);
  });
});

import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ladeNachtrag, type Nachtragliste } from '../src/nachtrag.js';
import { TurnierNichtErreichbar } from '../src/turnier-client.js';
import type { Eintrag } from '../src/turnier-client.js';

/* =========================================================================
   Die Warteschlange fuer Eintraege, die gerade nicht durchkommen.

   Der wichtigste Teil dieser Tests ist die REIHENFOLGE: turnier wertet
   den Schnitt der letzten zehn Eintraege, eine Vertauschung faellt also
   in die Wertung durch.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-nachtrag-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

/** Was beim erfundenen Turnier-Server angekommen ist. */
let angekommen: Array<{ gameId: string; name: string; punkte: number }> = [];
let erreichbar = true;

async function eintragen(gameId: string, e: Eintrag): Promise<void> {
  if (!erreichbar) throw new TurnierNichtErreichbar('http://x', 'ECONNREFUSED');
  angekommen.push({ gameId, name: e.name, punkte: e.punkte });
}

let n = 0;
let datei: string;
let liste: Nachtragliste;

beforeEach(() => {
  n++;
  angekommen = [];
  erreichbar = true;
  datei = path.join(ORDNER, 'nachtrag-' + n + '.json');
  liste = ladeNachtrag(datei, eintragen);
});

/* ---------------------------------------------------------- der gute Fall */

describe('Nachtrag - turnier ist da', () => {
  test('traegt sofort ein', async () => {
    const wie = await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 2771 });
    assert.equal(wie, 'eingetragen');
    assert.deepEqual(angekommen, [{ gameId: 'sp_1', name: 'Jones', punkte: 2771 }]);
    assert.equal(liste.anzahl(), 0);
  });

  test('legt ohne Not keine Datei an', async () => {
    await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 1 });
    assert.equal(readdirSync(ORDNER).includes(path.basename(datei)), false);
  });
});

/* --------------------------------------------------------- turnier ist weg */

describe('Nachtrag - turnier ist weg', () => {
  test('merkt sich den Eintrag, statt zu werfen', async () => {
    // Das ist der ganze Zweck: eine freigegebene Runde darf nicht kippen,
    // nur weil turnier gerade nicht ans Telefon geht.
    erreichbar = false;
    const wie = await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 2771 });

    assert.equal(wie, 'gemerkt');
    assert.equal(liste.anzahl(), 1);
    assert.equal(angekommen.length, 0);
  });

  test('haelt Name, Punktzahl und Absender fest', async () => {
    erreichbar = false;
    await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 2771 }, 'Zuschauerin');

    const n0 = liste.alle()[0]!;
    assert.equal(n0.name, 'Jones');
    assert.equal(n0.punkte, 2771);
    assert.equal(n0.absender, 'Zuschauerin');
    assert.equal(n0.gameId, 'sp_1');
    assert.match(String(n0.letzterFehler), /ECONNREFUSED/);
  });

  test('traegt nach, sobald turnier zurueck ist', async () => {
    erreichbar = false;
    await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 2771 });

    erreichbar = true;
    const a = await liste.arbeiteAb();

    assert.deepEqual(a, { erledigt: 1, offen: 0, fehler: null });
    assert.deepEqual(angekommen, [{ gameId: 'sp_1', name: 'Jones', punkte: 2771 }]);
    assert.equal(liste.anzahl(), 0);
  });

  test('haelt beim Abarbeiten die Reihenfolge ein', async () => {
    erreichbar = false;
    for (const [name, punkte] of [['Jones', 1], ['TREV', 2], ['mj', 3]] as const) {
      await liste.trageEinOderMerke('sp_1', { name, punkte });
    }

    erreichbar = true;
    await liste.arbeiteAb();

    assert.deepEqual(angekommen.map((e) => e.name), ['Jones', 'TREV', 'mj']);
  });

  test('bleibt still, wenn turnier immer noch weg ist', async () => {
    erreichbar = false;
    await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 1 });

    const a = await liste.arbeiteAb();
    assert.equal(a.erledigt, 0);
    assert.equal(a.offen, 1);
    assert.match(String(a.fehler), /ECONNREFUSED/);
    assert.equal(liste.alle()[0]!.versuche, 2, 'der Versuch wird mitgezaehlt');
  });
});

/* --------------------------------------------------------- Reihenfolge */

describe('Nachtrag - Reihenfolge', () => {
  test('stellt einen frischen Eintrag hinten an, wenn schon welche warten', async () => {
    /* Sonst ueberholt der neue die Wartenden, und in der Punkteliste
       stuenden sie in einer anderen Reihenfolge als sie entstanden sind -
       das verschiebt das Fenster der letzten zehn. */
    erreichbar = false;
    await liste.trageEinOderMerke('sp_1', { name: 'Erste', punkte: 1 });

    erreichbar = true;
    const wie = await liste.trageEinOderMerke('sp_1', { name: 'Zweite', punkte: 2 });

    assert.equal(wie, 'gemerkt', 'trotz erreichbarem Server: hinten anstellen');
    assert.equal(angekommen.length, 0);
    assert.deepEqual(liste.alle().map((x) => x.name), ['Erste', 'Zweite']);

    await liste.arbeiteAb();
    assert.deepEqual(angekommen.map((e) => e.name), ['Erste', 'Zweite']);
  });

  test('bricht beim ersten Fehler ab, statt zu ueberspringen', async () => {
    erreichbar = false;
    for (const name of ['Erste', 'Zweite', 'Dritte']) {
      await liste.trageEinOderMerke('sp_1', { name, punkte: 1 });
    }

    // Nur der erste geht durch, dann faellt turnier wieder aus.
    let durch = 0;
    const wackelig = ladeNachtrag(datei, async (gameId, e) => {
      if (durch >= 1) throw new TurnierNichtErreichbar('http://x', 'weg');
      durch++;
      angekommen.push({ gameId, name: e.name, punkte: e.punkte });
    });

    const a = await wackelig.arbeiteAb();

    assert.equal(a.erledigt, 1);
    assert.equal(a.offen, 2);
    assert.deepEqual(angekommen.map((e) => e.name), ['Erste']);
    assert.deepEqual(wackelig.alle().map((x) => x.name), ['Zweite', 'Dritte'],
      'die uebrigen behalten ihre Reihenfolge');
  });
});

/* -------------------------------------------------------------- Loeschen */

describe('Nachtrag - loeschen', () => {
  test('wirft einen Eintrag weg', async () => {
    erreichbar = false;
    await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 1 });
    const id = liste.alle()[0]!.id;

    assert.equal(liste.loesche(id), true);
    assert.equal(liste.anzahl(), 0);
  });

  test('meldet eine unbekannte Kennung', () => {
    assert.equal(liste.loesche('gibtsnicht'), false);
  });

  test('laesst die anderen in Ruhe', async () => {
    erreichbar = false;
    for (const name of ['Erste', 'Zweite', 'Dritte']) {
      await liste.trageEinOderMerke('sp_1', { name, punkte: 1 });
    }
    liste.loesche(liste.alle()[1]!.id);
    assert.deepEqual(liste.alle().map((x) => x.name), ['Erste', 'Dritte']);
  });
});

/* ----------------------------------------------------- Speichern und Laden */

describe('Nachtrag - Speichern und Laden', () => {
  test('ueberlebt einen Neustart', async () => {
    erreichbar = false;
    await liste.trageEinOderMerke('sp_1', { name: 'Jones', punkte: 2771 }, 'Zuschauerin');

    const neu = ladeNachtrag(datei, eintragen);
    assert.equal(neu.anzahl(), 1);
    assert.equal(neu.alle()[0]!.name, 'Jones');

    erreichbar = true;
    await neu.arbeiteAb();
    assert.deepEqual(angekommen, [{ gameId: 'sp_1', name: 'Jones', punkte: 2771 }]);
  });

  test('legt eine beschaedigte Datei zur Seite, statt sie zu ueberschreiben', () => {
    // Hier stehen Punkte, die noch niemand bekommen hat.
    const kaputt = path.join(ORDNER, 'kaputt-' + n + '.json');
    writeFileSync(kaputt, 'das ist kein json', 'utf8');

    const l = ladeNachtrag(kaputt, eintragen);
    assert.equal(l.anzahl(), 0);
    assert.ok(readdirSync(ORDNER).some((f) => f.includes('defekt')));
  });
});

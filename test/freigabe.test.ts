import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Freigabeliste, ladeFreigabeliste, type OffeneRunde } from '../src/freigabe.js';
import type { RohZeile } from '../src/parse.js';

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-freigabe-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

let n = 0;
function frischeDatei(): string {
  return path.join(ORDNER, 'liste-' + (++n) + '.json');
}

function zeile(name: string, punkte: number): RohZeile {
  return {
    zeile: 1,
    rohName: name,
    rohPunkte: String(punkte),
    punkte: { punkte, unsicher: false }
  };
}

function runde(hash: string, zeilen: RohZeile[] = [zeile('Jones', 2771)]) {
  return {
    eingegangen: Date.now(),
    quelle: 'zuschauer' as const,
    absender: 'Testperson',
    bildPfad: 'C:/irgendwo/bild.png',
    bildHash: hash,
    zeilen
  };
}

describe('Freigabeliste - ablegen', () => {
  let liste: Freigabeliste;
  beforeEach(() => { liste = ladeFreigabeliste(frischeDatei()); });

  test('legt eine Runde als offen ab', () => {
    const { runde: r, neuAngelegt } = liste.hinzufuegen(runde('abc'));
    assert.equal(neuAngelegt, true);
    assert.equal(r.status, 'offen');
    assert.equal(liste.offene().length, 1);
  });

  test('nichts wird automatisch gewertet', () => {
    // Der ganze Zweck der Liste: der Auftrag verlangt ausdruecklich, dass
    // Zuschauer keine Punktzahl selbst eintragen koennen.
    liste.hinzufuegen(runde('abc'));
    assert.equal(liste.alle().every((r) => r.status === 'offen'), true);
  });

  test('hebt den Bildpfad auf - ohne Bild keine Pruefung moeglich', () => {
    const { runde: r } = liste.hinzufuegen(runde('abc'));
    assert.equal(r.bildPfad, 'C:/irgendwo/bild.png');
  });
});

describe('Freigabeliste - Dubletten', () => {
  let liste: Freigabeliste;
  beforeEach(() => { liste = ladeFreigabeliste(frischeDatei()); });

  test('derselbe Screenshot zaehlt nur einmal', () => {
    // Der billigste Trick, um Punkte zu verdoppeln: dasselbe Bild
    // nochmal schicken.
    const a = liste.hinzufuegen(runde('gleicher-hash'));
    const b = liste.hinzufuegen(runde('gleicher-hash'));
    assert.equal(a.neuAngelegt, true);
    assert.equal(b.neuAngelegt, false);
    assert.equal(b.runde.id, a.runde.id);
    assert.equal(liste.alle().length, 1);
  });

  test('ein anderes Bild ist eine neue Runde', () => {
    liste.hinzufuegen(runde('hash-1'));
    liste.hinzufuegen(runde('hash-2'));
    assert.equal(liste.alle().length, 2);
  });

  test('warnt bei gleichem Inhalt trotz anderem Hash', () => {
    // Neu abgespeichertes Bild: anderer Hash, gleiche Zeilen.
    const zeilen = [zeile('Jones', 2771), zeile('mj', 239)];
    const a = liste.hinzufuegen(runde('hash-1', zeilen)).runde;
    const b = liste.hinzufuegen(runde('hash-2', [...zeilen])).runde;

    const treffer = liste.aehnliche(b);
    assert.equal(treffer.length, 1);
    assert.equal(treffer[0]?.id, a.id);
  });

  test('meldet keine Aehnlichkeit bei anderem Inhalt', () => {
    const a = liste.hinzufuegen(runde('h1', [zeile('Jones', 2771)])).runde;
    const b = liste.hinzufuegen(runde('h2', [zeile('Jones', 9999)])).runde;
    assert.equal(liste.aehnliche(b).length, 0);
    assert.equal(liste.aehnliche(a).length, 0);
  });
});

describe('Freigabeliste - entscheiden', () => {
  let liste: Freigabeliste;
  beforeEach(() => { liste = ladeFreigabeliste(frischeDatei()); });

  test('freigeben setzt Status, Person und Zeitpunkt', () => {
    const { runde: r } = liste.hinzufuegen(runde('abc'));
    const e = liste.entscheiden(r.id, 'freigegeben', 'Baloou');
    assert.equal(e.ok, true);
    assert.equal(r.status, 'freigegeben');
    assert.equal(r.bearbeitetVon, 'Baloou');
    assert.ok((r.bearbeitetAm ?? 0) > 0);
    assert.equal(liste.offene().length, 0);
  });

  test('ablehnen haelt den Grund fest', () => {
    const { runde: r } = liste.hinzufuegen(runde('abc'));
    liste.entscheiden(r.id, 'abgelehnt', 'Baloou', 'Screenshot sieht bearbeitet aus');
    assert.equal(r.status, 'abgelehnt');
    assert.match(r.grund ?? '', /bearbeitet/);
  });

  /*
     Der wichtigste Test hier. Ohne diese Sperre koennte ein zweiter Klick
     eine abgelehnte Runde nachtraeglich freigeben - oder eine schon
     freigegebene ein zweites Mal eintragen lassen.
  */
  test('eine bearbeitete Runde wird nicht noch einmal entschieden', () => {
    const { runde: r } = liste.hinzufuegen(runde('abc'));
    liste.entscheiden(r.id, 'abgelehnt', 'Baloou', 'gefaelscht');

    const zweiter = liste.entscheiden(r.id, 'freigegeben', 'JemandAnders');
    assert.equal(zweiter.ok, false);
    if (!zweiter.ok) assert.match(zweiter.fehler, /schon abgelehnt/);
    assert.equal(r.status, 'abgelehnt');
  });

  test('doppeltes Freigeben wird ebenfalls abgewiesen', () => {
    const { runde: r } = liste.hinzufuegen(runde('abc'));
    assert.equal(liste.entscheiden(r.id, 'freigegeben', 'Baloou').ok, true);
    assert.equal(liste.entscheiden(r.id, 'freigegeben', 'Baloou').ok, false);
  });

  test('meldet eine unbekannte Runde', () => {
    const e = liste.entscheiden('gibtsnicht', 'freigegeben', 'Baloou');
    assert.equal(e.ok, false);
  });
});

describe('Freigabeliste - Speichern und Laden', () => {
  test('ueberlebt einen Neustart', () => {
    const datei = frischeDatei();
    const a = ladeFreigabeliste(datei);
    const { runde: r } = a.hinzufuegen(runde('abc'));
    a.entscheiden(r.id, 'freigegeben', 'Baloou');
    a.jetztSpeichern();

    const b = ladeFreigabeliste(datei);
    assert.equal(b.alle().length, 1);
    assert.equal(b.alle()[0]?.status, 'freigegeben');
    assert.equal(b.alle()[0]?.bearbeitetVon, 'Baloou');
  });

  test('startet leer, wenn es die Datei noch nicht gibt', () => {
    assert.equal(ladeFreigabeliste(frischeDatei()).alle().length, 0);
  });

  test('legt eine kaputte Datei zur Seite statt sie zu ueberschreiben', () => {
    // Da stecken Runden drin, die noch niemand gesehen hat - dieselbe
    // Vorsicht wie in turnier/jsonstore.js.
    const datei = frischeDatei();
    writeFileSync(datei, '{ das ist kein JSON', 'utf8');

    const liste = ladeFreigabeliste(datei);
    assert.equal(liste.alle().length, 0);

    const beiseite = readdirSync(path.dirname(datei))
      .filter((f) => f.startsWith(path.basename(datei, '.json')) && f.includes('.defekt-'));
    assert.equal(beiseite.length, 1);
  });

  test('kommt mit einem BOM zurecht', () => {
    const datei = frischeDatei();
    writeFileSync(datei, '\ufeff{"version":1,"runden":[]}', 'utf8');
    assert.equal(ladeFreigabeliste(datei).alle().length, 0);
    // Nicht als kaputt einsortiert:
    assert.equal(existsSync(datei), true);
  });
});

describe('Freigabeliste - aufraeumen', () => {
  test('behaelt offene Runden unabhaengig vom Alter', () => {
    const liste = ladeFreigabeliste(frischeDatei());
    const alt = { ...runde('alt'), eingegangen: Date.now() - 400 * 24 * 3600 * 1000 };
    liste.hinzufuegen(alt);
    assert.equal(liste.aufraeumen(30), 0);
    assert.equal(liste.alle().length, 1);
  });

  test('entfernt alte bearbeitete Runden', () => {
    const liste = ladeFreigabeliste(frischeDatei());
    const { runde: r } = liste.hinzufuegen(runde('alt'));
    liste.entscheiden(r.id, 'freigegeben', 'Baloou');
    r.bearbeitetAm = Date.now() - 60 * 24 * 3600 * 1000;

    assert.equal(liste.aufraeumen(30), 1);
    assert.equal(liste.alle().length, 0);
  });

  test('behaelt frisch bearbeitete Runden', () => {
    const liste = ladeFreigabeliste(frischeDatei());
    const { runde: r } = liste.hinzufuegen(runde('neu'));
    liste.entscheiden(r.id, 'freigegeben', 'Baloou');
    assert.equal(liste.aufraeumen(30), 0);
  });
});

describe('Freigabeliste - Hash', () => {
  test('gleiches Bild ergibt gleichen Hash', () => {
    const a = Freigabeliste.hashVon(Buffer.from('bilddaten'));
    const b = Freigabeliste.hashVon(Buffer.from('bilddaten'));
    assert.equal(a, b);
  });

  test('ein geaendertes Pixel ergibt einen anderen Hash', () => {
    const a = Freigabeliste.hashVon(Buffer.from('bilddaten'));
    const b = Freigabeliste.hashVon(Buffer.from('bilddatem'));
    assert.notEqual(a, b);
  });
});

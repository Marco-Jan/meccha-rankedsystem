import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Rangliste, ladeRangliste, FENSTER, VOLL } from '../src/rangliste.js';

/* =========================================================================
   Die Wertung ist der Kern des ganzen Projekts, und ihr Fehlerbild ist
   heimtueckisch: eine falsche Rechnung sieht wie eine richtige aus und
   faellt erst auf, wenn eine Saison gelaufen ist. Deshalb wird hier jeder
   Fall einzeln festgenagelt.
   ========================================================================= */

function neu(): { r: Rangliste; datei: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'mc-rangliste-'));
  const datei = path.join(dir, 'rangliste.json');
  return { r: ladeRangliste(datei), datei };
}

/** Namen frei erfinden - so heisst jedes Konto wie seine Kennung. */
const namenAusId = (id: string): string | null => id;

/** n Eintraege mit festen Punkten, sauber auseinanderliegend. */
function traegeEin(r: Rangliste, kontoId: string, punkte: readonly number[], start = 1000): void {
  punkte.forEach((p, i) => r.eintragen(kontoId, p, start + i * 1000));
}

describe('Wertung: Schnitt der letzten 10', () => {
  test('leere Rangliste hat weder Wertung noch Anwaerter', () => {
    const { r } = neu();
    const t = r.tabelle(namenAusId);
    assert.equal(t.gewertet.length, 0);
    assert.equal(t.anwaerter.length, 0);
  });

  test('ein Eintrag macht einen Anwaerter, keinen Gewerteten', () => {
    const { r } = neu();
    r.eintragen('k1', 500);

    const t = r.tabelle(namenAusId);
    assert.equal(t.gewertet.length, 0);
    assert.equal(t.anwaerter.length, 1);
    assert.equal(t.anwaerter[0]!.schnitt, 500);
    assert.equal(t.anwaerter[0]!.imFenster, 1);
    assert.equal(t.anwaerter[0]!.gesamt, 1);
    assert.equal(t.anwaerter[0]!.platz, undefined);
  });

  test('neun Eintraege reichen noch nicht fuer die Wertung', () => {
    const { r } = neu();
    traegeEin(r, 'k1', [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const t = r.tabelle(namenAusId);
    assert.equal(t.gewertet.length, 0, 'mit 9 steht niemand in der Wertung');
    assert.equal(t.anwaerter[0]!.imFenster, 9);
  });

  test('der zehnte Eintrag holt in die Wertung', () => {
    const { r } = neu();
    traegeEin(r, 'k1', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);

    const t = r.tabelle(namenAusId);
    assert.equal(t.anwaerter.length, 0);
    assert.equal(t.gewertet.length, 1);
    assert.equal(t.gewertet[0]!.schnitt, 100);
    assert.equal(t.gewertet[0]!.platz, 1);
  });

  test('der Schnitt ist Summe durch Anzahl, nicht gerundet', () => {
    const { r } = neu();
    // Summe 55, durch 10 = 5.5 - darf nicht auf 5 oder 6 fallen
    traegeEin(r, 'k1', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.equal(r.tabelle(namenAusId).gewertet[0]!.schnitt, 5.5);
  });

  test('ab dem elften faellt der aelteste aus dem Fenster', () => {
    const { r } = neu();
    // Zehnmal 0, dann eine 1000. Das Fenster schiebt sich um eins weiter:
    // die erste 0 faellt raus, uebrig sind neun 0 und die 1000.
    traegeEin(r, 'k1', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    r.eintragen('k1', 1000, 99_000);

    const z = r.tabelle(namenAusId).gewertet[0]!;
    assert.equal(z.imFenster, FENSTER);
    assert.equal(z.gesamt, 11, 'gesamt zaehlt alles, auch was aus dem Fenster fiel');
    assert.equal(z.schnitt, 100, '1000 / 10');
  });

  test('werte enthaelt genau das Fenster, aeltester zuerst', () => {
    const { r } = neu();
    traegeEin(r, 'k1', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    const z = r.tabelle(namenAusId).gewertet[0]!;
    assert.equal(z.werte.length, FENSTER);
    assert.deepEqual(z.werte.map((w) => w.punkte), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test('ein alter Ausrutscher verschwindet aus der Wertung', () => {
    /* Der eigentliche Sinn des Fensters: wer zehn gute Runden nachlegt,
       traegt eine schlechte nicht ewig mit sich herum. */
    const { r } = neu();
    r.eintragen('k1', 0, 1);
    traegeEin(r, 'k1', [100, 100, 100, 100, 100, 100, 100, 100, 100, 100], 2000);

    assert.equal(r.tabelle(namenAusId).gewertet[0]!.schnitt, 100);
  });
});

describe('Reihenfolge in der Tabelle', () => {
  test('hoeherer Schnitt steht vorne', () => {
    const { r } = neu();
    traegeEin(r, 'leise', Array(10).fill(50));
    traegeEin(r, 'laut', Array(10).fill(900));

    const g = r.tabelle(namenAusId).gewertet;
    assert.deepEqual(g.map((z) => z.name), ['laut', 'leise']);
    assert.deepEqual(g.map((z) => z.platz), [1, 2]);
  });

  test('bei gleichem Schnitt steht vorne, wer mehr Eintraege hat', () => {
    const { r } = neu();
    traegeEin(r, 'zehn', Array(10).fill(100));
    traegeEin(r, 'zwanzig', Array(20).fill(100));

    const g = r.tabelle(namenAusId).gewertet;
    assert.deepEqual(g.map((z) => z.name), ['zwanzig', 'zehn'],
      'er hat es oefter gezeigt');
  });

  test('bei voellig gleichem Stand entscheidet der Name - damit es nicht springt', () => {
    const { r } = neu();
    traegeEin(r, 'bertha', Array(10).fill(100));
    traegeEin(r, 'anton', Array(10).fill(100));

    const g = r.tabelle(namenAusId).gewertet;
    assert.deepEqual(g.map((z) => z.name), ['anton', 'bertha']);
  });

  test('gleicher Schnitt heisst gleicher Platz, der naechste ueberspringt', () => {
    const { r } = neu();
    traegeEin(r, 'a', Array(10).fill(100));
    traegeEin(r, 'b', Array(10).fill(100));
    traegeEin(r, 'c', Array(10).fill(50));

    const g = r.tabelle(namenAusId).gewertet;
    assert.deepEqual(g.map((z) => z.platz), [1, 1, 3],
      'zwei auf Platz 1, danach folgt Platz 3 - nicht 2');
  });

  test('Anwaerter werden nach denselben Regeln sortiert, aber ohne Platz', () => {
    const { r } = neu();
    traegeEin(r, 'schwach', [10, 20]);
    traegeEin(r, 'stark', [900, 900]);

    const a = r.tabelle(namenAusId).anwaerter;
    assert.deepEqual(a.map((z) => z.name), ['stark', 'schwach']);
    assert.ok(a.every((z) => z.platz === undefined));
  });
});

describe('Reihenfolge der Eintraege selbst', () => {
  test('gleiche Millisekunde: seq entscheidet, welcher aus dem Fenster faellt', () => {
    /* Ohne seq waere die Reihenfolge bei identischem Zeitstempel
       undefiniert - dann koennte sich die Wertung zwischen zwei
       Neustarts aendern, ohne dass jemand etwas eingetragen hat. */
    const { r } = neu();
    for (let i = 0; i < 11; i++) r.eintragen('k1', i, 5000);

    const z = r.tabelle(namenAusId).gewertet[0]!;
    assert.deepEqual(z.werte.map((w) => w.punkte), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      'die 0 ist herausgefallen, nicht irgendeine andere');
  });

  test('eintraegeVon liefert chronologisch, aeltester zuerst', () => {
    const { r } = neu();
    r.eintragen('k1', 3, 3000);
    r.eintragen('k1', 1, 1000);
    r.eintragen('k1', 2, 2000);

    assert.deepEqual(r.eintraegeVon('k1').map((e) => e.punkte), [1, 2, 3]);
  });

  test('eintraegeVon zeigt nur die eigene Person', () => {
    const { r } = neu();
    r.eintragen('k1', 1);
    r.eintragen('k2', 2);
    assert.equal(r.eintraegeVon('k1').length, 1);
  });
});

describe('Eintraege pflegen', () => {
  test('entfernen nimmt einen Eintrag aus der Wertung', () => {
    const { r } = neu();
    traegeEin(r, 'k1', Array(10).fill(100));
    const daneben = r.eintragen('k1', 0, 99_000);

    assert.equal(r.tabelle(namenAusId).gewertet[0]!.schnitt, 90);
    assert.equal(r.entfernen(daneben.id), true);
    assert.equal(r.tabelle(namenAusId).gewertet[0]!.schnitt, 100);
  });

  test('entfernen meldet false, wenn es den Eintrag nicht gibt', () => {
    const { r } = neu();
    assert.equal(r.entfernen('gibtsnicht'), false);
  });

  test('aendern korrigiert die Punktzahl, ohne die Reihenfolge zu stoeren', () => {
    const { r } = neu();
    r.eintragen('k1', 1, 1000);
    const mitte = r.eintragen('k1', 2, 2000);
    r.eintragen('k1', 3, 3000);

    assert.equal(r.aendern(mitte.id, 999), true);
    assert.deepEqual(r.eintraegeVon('k1').map((e) => e.punkte), [1, 999, 3]);
  });

  test('aendern weist Unfug ab, statt NaN in die Wertung zu lassen', () => {
    const { r } = neu();
    const e = r.eintragen('k1', 5);
    assert.equal(r.aendern(e.id, Number.NaN), false);
    assert.equal(r.eintraegeVon('k1')[0]!.punkte, 5);
  });

  test('eintragen weist Unfug ab', () => {
    const { r } = neu();
    assert.throws(() => r.eintragen('k1', Number.NaN));
    assert.throws(() => r.eintragen('k1', Number.POSITIVE_INFINITY));
  });
});

describe('Wenn ein Konto verschwindet', () => {
  test('Eintraege ohne Konto fallen aus der Tabelle', () => {
    /* Sonst stuende ein "?" in der Wertung, und niemand koennte sagen,
       wem die Punkte gehoeren. */
    const { r } = neu();
    traegeEin(r, 'da', Array(10).fill(100));
    traegeEin(r, 'weg', Array(10).fill(900));

    const t = r.tabelle((id) => (id === 'weg' ? null : id));
    assert.deepEqual(t.gewertet.map((z) => z.name), ['da']);
  });

  test('letzte zeigt so einen Eintrag trotzdem an, mit Fragezeichen', () => {
    /* Hier ist das Gegenteil richtig: die Liste soll zeigen, was
       tatsaechlich eingetragen wurde - auch das Unerklaerliche. */
    const { r } = neu();
    r.eintragen('weg', 500);
    const l = r.letzte(() => null);
    assert.equal(l.length, 1);
    assert.equal(l[0]!.name, '?');
  });
});

describe('Speichern und Laden', () => {
  test('was eingetragen wurde, ist nach dem Neuladen noch da', () => {
    const { r, datei } = neu();
    traegeEin(r, 'k1', [10, 20, 30]);
    r.jetztSpeichern();

    const wieder = ladeRangliste(datei);
    assert.deepEqual(wieder.eintraegeVon('k1').map((e) => e.punkte), [10, 20, 30]);
  });

  test('seq laeuft nach dem Neuladen weiter, statt bei 0 zu beginnen', () => {
    /* Sonst bekaemen neue Eintraege dieselben Nummern wie alte, und bei
       gleichem Zeitstempel waere die Reihenfolge wieder offen. */
    const { r, datei } = neu();
    for (let i = 0; i < 3; i++) r.eintragen('k1', i, 5000);
    r.jetztSpeichern();

    const wieder = ladeRangliste(datei);
    wieder.eintragen('k1', 99, 5000);
    assert.deepEqual(wieder.eintraegeVon('k1').map((e) => e.punkte), [0, 1, 2, 99]);
  });

  test('eine fehlende Datei ist kein Fehler, sondern eine leere Rangliste', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mc-rangliste-'));
    const r = ladeRangliste(path.join(dir, 'gibtsnicht.json'));
    assert.equal(r.alle().length, 0);
  });

  test('eine Datei mit BOM wird gelesen', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mc-rangliste-'));
    const datei = path.join(dir, 'rangliste.json');
    writeFileSync(datei, '﻿' + JSON.stringify({
      version: 1,
      eintraege: [{ id: 'e1', kontoId: 'k1', punkte: 42, ts: 1, seq: 0 }]
    }), 'utf8');

    assert.equal(ladeRangliste(datei).eintraegeVon('k1')[0]!.punkte, 42);
  });

  test('eine kaputte Datei wird zur Seite gelegt, nicht ueberschrieben', () => {
    /* Hier steckt die gesamte Wertung drin. Sie beim naechsten Speichern
       stillschweigend zu ueberschreiben waere der groesste vermeidbare
       Datenverlust im ganzen Projekt. */
    const dir = mkdtempSync(path.join(tmpdir(), 'mc-rangliste-'));
    const datei = path.join(dir, 'rangliste.json');
    writeFileSync(datei, '{ das ist kein json', 'utf8');

    const r = ladeRangliste(datei);
    assert.equal(r.alle().length, 0);

    const beiseite = readdirSync(dir).filter((f) => f.includes('.defekt-'));
    assert.equal(beiseite.length, 1, 'die kaputte Datei liegt jetzt daneben');
    assert.match(readFileSync(path.join(dir, beiseite[0]!), 'utf8'), /das ist kein json/);
  });

  test('Eintraege mit unbrauchbarer Punktzahl werden beim Laden aussortiert', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mc-rangliste-'));
    const datei = path.join(dir, 'rangliste.json');
    writeFileSync(datei, JSON.stringify({
      version: 1,
      eintraege: [
        { id: 'e1', kontoId: 'k1', punkte: 10, ts: 1, seq: 0 },
        { id: 'e2', kontoId: 'k1', punkte: null, ts: 2, seq: 1 },
        { id: 'e3', kontoId: 'k1', punkte: 'viel', ts: 3, seq: 2 }
      ]
    }), 'utf8');

    const r = ladeRangliste(datei);
    assert.equal(r.alle().length, 1, 'nur der brauchbare bleibt');
    assert.equal(r.tabelle(namenAusId).anwaerter[0]!.schnitt, 10);
  });

  test('die Datei wird angelegt, auch wenn der Ordner fehlt', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'mc-rangliste-'));
    const datei = path.join(dir, 'tief', 'drin', 'rangliste.json');
    const r = ladeRangliste(datei);
    r.eintragen('k1', 1);
    r.jetztSpeichern();
    assert.ok(existsSync(datei));
  });
});

describe('Auskunft fuer die Kontoseite', () => {
  test('fehlendeRunden zaehlt bis zur Wertung herunter', () => {
    const { r } = neu();
    assert.equal(r.fehlendeRunden('k1'), VOLL);
    traegeEin(r, 'k1', [1, 2, 3]);
    assert.equal(r.fehlendeRunden('k1'), VOLL - 3);
  });

  test('wer in der Wertung steht, dem fehlt nichts mehr', () => {
    const { r } = neu();
    traegeEin(r, 'k1', Array(15).fill(100));
    assert.equal(r.fehlendeRunden('k1'), 0);
  });

  test('letzte zeigt die neuesten zuerst und begrenzt die Anzahl', () => {
    const { r } = neu();
    traegeEin(r, 'k1', [1, 2, 3, 4, 5]);

    const l = r.letzte(namenAusId, 3);
    assert.deepEqual(l.map((e) => e.punkte), [5, 4, 3]);
  });
});

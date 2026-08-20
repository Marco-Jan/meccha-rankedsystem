import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Listen, ladeListen, ERSTE_LISTE } from '../src/listen.js';
import { ladeRangliste } from '../src/rangliste.js';
import { ladeWertung } from '../src/wertung.js';
import { ladeKonten } from '../src/konten.js';
import { ladeTokens } from '../src/tokens.js';

/* =========================================================================
   MEHRERE RANGLISTEN

   Eine freigegebene Runde landet in JEDER aktiven Liste. Damit laufen
   Jahres- und Monatswertung nebeneinander.

   Zwei Stellen sind hier gefaehrlich, und beide bekommen mehr Tests als
   der Rest:

     - Die ZUORDNUNG alter Eintraege. Vor dem 20.08.2026 trugen sie keine
       Kennung. Wuerden sie beim Umstieg nicht umgehaengt, waeren sie
       herrenlos: in keiner Tabelle, in keinem Export. Eine Saison waere
       lautlos verschwunden.

     - Die LETZTE aktive Liste. Liesse sie sich abschalten, gaebe es einen
       Zustand, in dem freigegebene Runden nirgends landen - und "in null
       Listen eingetragen" sieht aus wie "eingetragen".
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-listen-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

let n = 0;
const frisch = (): string => path.join(ORDNER, 'listen-' + (++n) + '.json');
const neu = (): Listen => ladeListen(frisch());

describe('Listen anlegen', () => {
  test('die erste ist sofort aktiv', () => {
    const l = neu();
    const a = l.anlegen('Meccha 2026');
    assert.ok(a.ok);
    assert.equal(a.wert.aktiv, true);
    assert.equal(l.aktive().length, 1);
  });

  test('eine neue schaltet die alte NICHT ab', () => {
    /* Mehrere duerfen gleichzeitig laufen - eine Runde landet dann in
       allen. Was nebeneinander laufen soll, entscheidet der Admin
       danach von Hand. */
    const l = neu();
    l.anlegen('Jahr');
    l.anlegen('Monat');
    assert.equal(l.aktive().length, 2);
  });

  test('derselbe Name geht nicht zweimal', () => {
    /* "Meccha 2026" und "Meccha 2026 " waeren im Dashboard nicht zu
       unterscheiden, und die Wertung liefe still auseinander. Genau der
       Fehler ist im Vorgaengerprojekt schon einmal passiert. */
    const l = neu();
    l.anlegen('Meccha 2026');
    const zweite = l.anlegen('  meccha 2026  ');
    assert.equal(zweite.ok, false);
    if (!zweite.ok) assert.match(zweite.fehler, /gibt es schon/);
  });

  test('ein leerer Name wird abgewiesen', () => {
    const l = neu();
    assert.equal(l.anlegen('   ').ok, false);
  });

  test('lange Namen werden gekuerzt, nicht abgewiesen', () => {
    const l = neu();
    const a = l.anlegen('x'.repeat(200));
    assert.ok(a.ok);
    assert.ok(a.wert.name.length <= 40);
  });
});

describe('Listen ein- und ausschalten', () => {
  test('die letzte aktive laesst sich nicht abschalten', () => {
    /* Sonst gaebe es einen Zustand, in dem freigegebene Runden nirgends
       landen - lautlos, denn "in null Listen eingetragen" sieht aus wie
       "eingetragen". */
    const l = neu();
    const a = l.anlegen('Einzige');
    assert.ok(a.ok);

    const aus = l.setzeAktiv(a.wert.id, false);
    assert.equal(aus.ok, false);
    if (!aus.ok) assert.match(aus.fehler, /letzte aktive/);
    assert.equal(l.aktive().length, 1);
  });

  test('mit einer zweiten geht es', () => {
    const l = neu();
    const alt = l.anlegen('Alt');
    l.anlegen('Neu');
    assert.ok(alt.ok);

    assert.equal(l.setzeAktiv(alt.wert.id, false).ok, true);
    assert.equal(l.aktive().length, 1);
    assert.equal(l.alle().length, 2, 'abgeschaltet heisst nicht geloescht');
  });

  test('eine abgeschaltete laesst sich wieder einschalten', () => {
    const l = neu();
    const a = l.anlegen('Alt');
    l.anlegen('Neu');
    assert.ok(a.ok);

    l.setzeAktiv(a.wert.id, false);
    assert.equal(l.setzeAktiv(a.wert.id, true).ok, true);
    assert.equal(l.aktive().length, 2);
  });

  test('umbenennen prueft die Eindeutigkeit mit', () => {
    const l = neu();
    const a = l.anlegen('Eins');
    l.anlegen('Zwei');
    assert.ok(a.ok);
    assert.equal(l.umbenennen(a.wert.id, 'Zwei').ok, false);
    assert.equal(l.umbenennen(a.wert.id, 'Drei').ok, true);
  });
});

describe('Listen speichern', () => {
  test('ueberleben einen Neustart', () => {
    const datei = frisch();
    const a = ladeListen(datei);
    a.anlegen('Bleibt');

    assert.deepEqual(ladeListen(datei).alle().map((l) => l.name), ['Bleibt']);
  });

  test('eine kaputte Datei wird zur Seite gelegt', () => {
    /* Ohne diese Datei sind die Eintraege in rangliste.json herrenlos -
       sie haengen an listeId. Sie beim naechsten Speichern zu
       ueberschreiben waere derselbe Datenverlust wie bei der Rangliste
       selbst. */
    const dir = mkdtempSync(path.join(ORDNER, 'kaputt-'));
    const datei = path.join(dir, 'listen.json');
    writeFileSync(datei, '{ kein json', 'utf8');

    assert.equal(ladeListen(datei).alle().length, 0);
    const beiseite = readdirSync(dir).filter((f) => f.includes('.defekt-'));
    assert.equal(beiseite.length, 1);
    assert.match(readFileSync(path.join(dir, beiseite[0]!), 'utf8'), /kein json/);
  });
});

/* ------------------------------------------------------ Zusammenspiel */

function bau(datenDir: string) {
  const tokens = ladeTokens(path.join(datenDir, 'tokens.json'));
  const konten = ladeKonten(path.join(datenDir, 'konten.json'), tokens);
  const rangliste = ladeRangliste(path.join(datenDir, 'rangliste.json'));
  const listen = ladeListen(path.join(datenDir, 'listen.json'));
  return { wertung: ladeWertung(rangliste, konten, listen), rangliste, listen, konten };
}

describe('Alte Eintraege bekommen eine Liste', () => {
  test('herrenlose Eintraege landen in der ersten Liste', () => {
    /* DER wichtigste Test dieser Datei. Vor dem 20.08.2026 gab es nur
       eine Rangliste, und die Eintraege trugen keine Kennung. Beim
       ersten Start danach muessen sie umgehaengt werden - sonst sind sie
       in keiner Tabelle mehr zu finden, und die ganze Saison waere
       lautlos weg. */
    const dir = mkdtempSync(path.join(ORDNER, 'alt-'));
    writeFileSync(path.join(dir, 'rangliste.json'), JSON.stringify({
      version: 1,
      eintraege: [
        { id: 'e1', kontoId: 'k1', punkte: 100, ts: 1000, seq: 0 },
        { id: 'e2', kontoId: 'k1', punkte: 200, ts: 2000, seq: 1 },
        { id: 'e3', kontoId: 'k2', punkte: 300, ts: 3000, seq: 2 }
      ]
    }), 'utf8');

    const { rangliste, listen } = bau(dir);

    assert.equal(listen.alle().length, 1, 'eine Liste wurde angelegt');
    assert.equal(listen.alle()[0]!.name, ERSTE_LISTE);

    const id = listen.alle()[0]!.id;
    assert.equal(rangliste.anzahlIn(id), 3, 'alle drei haengen jetzt daran');
    assert.deepEqual(rangliste.eintraegeVon(id, 'k1').map((e) => e.punkte), [100, 200]);
  });

  test('die Zuordnung ueberlebt den Neustart', () => {
    // Sonst liefe sie bei jedem Start erneut und haenge Eintraege um,
    // die laengst irgendwo hingehoeren.
    const dir = mkdtempSync(path.join(ORDNER, 'alt2-'));
    writeFileSync(path.join(dir, 'rangliste.json'), JSON.stringify({
      version: 1,
      eintraege: [{ id: 'e1', kontoId: 'k1', punkte: 100, ts: 1000, seq: 0 }]
    }), 'utf8');

    bau(dir);
    const roh = JSON.parse(readFileSync(path.join(dir, 'rangliste.json'), 'utf8')) as
      { eintraege: Array<{ listeId?: string }> };
    assert.ok(roh.eintraege[0]!.listeId, 'die Kennung steht in der Datei');
  });

  test('ohne alte Eintraege wird trotzdem eine Liste angelegt', () => {
    /* Ein frischer Server braucht ein Ziel, sonst laufen die ersten
       freigegebenen Runden ins Leere. */
    const dir = mkdtempSync(path.join(ORDNER, 'frisch-'));
    const { listen } = bau(dir);
    assert.equal(listen.aktive().length, 1);
  });

  test('vorhandene Listen werden nicht angetastet', () => {
    const dir = mkdtempSync(path.join(ORDNER, 'schon-'));
    writeFileSync(path.join(dir, 'listen.json'), JSON.stringify({
      version: 1,
      listen: [{ id: 'l_x', name: 'Meine', angelegt: 1, aktiv: true }]
    }), 'utf8');

    const { listen } = bau(dir);
    assert.deepEqual(listen.alle().map((l) => l.name), ['Meine']);
  });
});

describe('Eintragen geht in alle aktiven Listen', () => {
  test('zwei aktive Listen bekommen je einen Eintrag', () => {
    const dir = mkdtempSync(path.join(ORDNER, 'zwei-'));
    const { wertung, rangliste, listen } = bau(dir);

    const zweite = listen.anlegen('Monat');
    assert.ok(zweite.ok);

    const wohin = wertung.eintragen('k1', 500);

    assert.equal(wohin, 2, 'in beide geschrieben');
    for (const l of listen.aktive()) {
      assert.equal(rangliste.anzahlIn(l.id), 1, l.name + ' hat einen Eintrag');
    }
  });

  test('eine abgeschaltete bleibt aussen vor', () => {
    const dir = mkdtempSync(path.join(ORDNER, 'aus-'));
    const { wertung, rangliste, listen } = bau(dir);

    const alt = listen.alle()[0]!;
    const neu2 = listen.anlegen('Neu');
    assert.ok(neu2.ok);
    listen.setzeAktiv(alt.id, false);

    wertung.eintragen('k1', 500);

    assert.equal(rangliste.anzahlIn(alt.id), 0, 'die abgeschaltete bleibt leer');
    assert.equal(rangliste.anzahlIn(neu2.wert.id), 1);
  });

  test('die Wertungen laufen getrennt', () => {
    /* Der eigentliche Sinn: eine neue Saison faengt bei null an. Die
       alten Punkte duerfen den neuen Schnitt nicht verwaessern. */
    const dir = mkdtempSync(path.join(ORDNER, 'getrennt-'));
    const { rangliste, listen } = bau(dir);

    const jahr = listen.alle()[0]!.id;
    const monat = listen.anlegen('Monat');
    assert.ok(monat.ok);

    for (let i = 0; i < 10; i++) rangliste.eintragen(jahr, 'k1', 100, 1000 + i);
    for (let i = 0; i < 10; i++) rangliste.eintragen(monat.wert.id, 'k1', 900, 1000 + i);

    const namen = (id: string) => (id === 'k1' ? 'Spieler' : null);
    assert.equal(rangliste.tabelle(jahr, namen).gewertet[0]!.schnitt, 100);
    assert.equal(rangliste.tabelle(monat.wert.id, namen).gewertet[0]!.schnitt, 900);
  });

  test('der eigene Stand wird je Liste genannt', () => {
    /* Eine Zahl ueber alle Listen waere nichtssagend: bei zwei aktiven
       haette jeder doppelt so viele Eintraege, ohne oefter gespielt zu
       haben. */
    const dir = mkdtempSync(path.join(ORDNER, 'stand-'));
    const { wertung, listen } = bau(dir);
    listen.anlegen('Monat');

    wertung.eintragen('k1', 500);
    const meins = wertung.meinStand('k1');

    assert.equal(meins.length, 2);
    assert.ok(meins.every((m) => m.eintraege === 1));
  });
});

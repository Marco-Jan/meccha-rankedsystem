import { test, describe, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ladeSpiegel, type Zustand } from '../src/spiegel.js';
import { TurnierNichtErreichbar, TurnierAbgelehnt } from '../src/turnier-client.js';
import type { KarteiPerson } from '../src/namen.js';

/* =========================================================================
   Der Spiegel ist das Stueck, mit dem mc-ranked ohne Turnier-Server
   weiterarbeitet. Geprueft wird vor allem, WANN er einspringt - und wann
   ausdruecklich nicht.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-spiegel-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

const KARTEI: readonly KarteiPerson[] = [
  { id: 'p1', name: 'Jones', aliases: [] },
  { id: 'p2', name: 'TREV', aliases: [] }
];

function zustand(kartei = KARTEI, eintraege = 7): Zustand {
  return {
    zustand: { kartei, spiele: [{ id: 'sp_1', name: 'Meccha 2026', eintraege }], fenster: 10, voll: 10 },
    spiel: { id: 'sp_1', name: 'Meccha 2026', eintraege }
  };
}

let n = 0;
let datei: string;

beforeEach(() => {
  n++;
  datei = path.join(ORDNER, 'spiegel-' + n + '.json');
});

/* ------------------------------------------------------------ der gute Fall */

describe('Karteispiegel - turnier antwortet', () => {
  test('reicht den frischen Zustand durch', async () => {
    const s = ladeSpiegel(datei, async () => zustand());
    const z = await s.holen();
    assert.equal(z.spiel.id, 'sp_1');
    assert.equal(z.zustand.kartei.length, 2);
  });

  test('meldet die Lage als erreichbar', async () => {
    const s = ladeSpiegel(datei, async () => zustand());
    await s.holen();

    const l = s.lage();
    assert.equal(l.erreichbar, true);
    assert.equal(l.ausSpiegel, false);
    assert.equal(l.letzterFehler, null);
    assert.ok(l.gespiegeltAm && l.gespiegeltAm > 0);
  });

  test('legt die Datei an', async () => {
    const s = ladeSpiegel(datei, async () => zustand());
    await s.holen();
    assert.equal(existsSync(datei), true);
  });

  test('schreibt nicht bei jedem Abruf neu', async () => {
    /* Die Kartei aendert sich selten, Uploads kommen oft. Ohne diesen
       Vergleich schriebe der Server bei jedem Bild eine Datei. */
    const s = ladeSpiegel(datei, async () => zustand());
    await s.holen();
    const erste = readFileSync(datei, 'utf8');

    await new Promise((f) => setTimeout(f, 5));
    await s.holen();
    assert.equal(readFileSync(datei, 'utf8'), erste, 'gleicher Inhalt, gleicher Zeitstempel');
  });

  test('schreibt neu, sobald sich die Kartei aendert', async () => {
    let gross = false;
    const s = ladeSpiegel(datei, async () =>
      gross ? zustand([...KARTEI, { id: 'p3', name: 'mj', aliases: [] }]) : zustand());

    await s.holen();
    gross = true;
    await s.holen();

    const d = JSON.parse(readFileSync(datei, 'utf8')) as { zustand: { kartei: unknown[] } };
    assert.equal(d.zustand.kartei.length, 3);
  });
});

/* ------------------------------------------------------ turnier ist weg */

describe('Karteispiegel - turnier ist weg', () => {
  test('antwortet aus dem Spiegel', async () => {
    let weg = false;
    const s = ladeSpiegel(datei, async () => {
      if (weg) throw new TurnierNichtErreichbar('http://x', 'ECONNREFUSED');
      return zustand();
    });

    await s.holen();
    weg = true;

    const z = await s.holen();
    assert.equal(z.zustand.kartei.length, 2, 'die Kartei muss weiter zur Verfuegung stehen');
    assert.equal(z.spiel.id, 'sp_1');
  });

  test('sagt in der Lage, dass gespiegelt geantwortet wurde', async () => {
    let weg = false;
    const s = ladeSpiegel(datei, async () => {
      if (weg) throw new TurnierNichtErreichbar('http://x', 'ECONNREFUSED');
      return zustand();
    });
    await s.holen();
    weg = true;
    await s.holen();

    const l = s.lage();
    assert.equal(l.erreichbar, false);
    assert.equal(l.ausSpiegel, true);
    assert.match(String(l.letzterFehler), /ECONNREFUSED/);
  });

  test('wirft, wenn es noch nie einen Stand gab', async () => {
    // Ohne Kartei laesst sich kein Name zuordnen - dann lieber sagen,
    // dass es nicht geht, als so zu tun als ginge es.
    const s = ladeSpiegel(datei, async () => {
      throw new TurnierNichtErreichbar('http://x', 'ECONNREFUSED');
    });
    await assert.rejects(() => s.holen(), /nicht erreichbar/);
  });

  test('friert den Zeitstempel ein, statt ihn hochzuzaehlen', async () => {
    let weg = false;
    const s = ladeSpiegel(datei, async () => {
      if (weg) throw new TurnierNichtErreichbar('http://x', 'weg');
      return zustand();
    });
    await s.holen();
    const alt = s.lage().gespiegeltAm;

    weg = true;
    await new Promise((f) => setTimeout(f, 5));
    await s.holen();

    assert.equal(s.lage().gespiegeltAm, alt, 'ein Ausfall darf den Stand nicht juenger machen');
  });

  test('kehrt zurueck, sobald turnier wieder antwortet', async () => {
    let weg = true;
    // Ohne Pause, damit der Rueckweg hier nicht von der Uhr abhaengt -
    // die Pause selbst wird weiter unten geprueft.
    const s = ladeSpiegel(datei, async () => {
      if (weg) throw new TurnierNichtErreichbar('http://x', 'weg');
      return zustand(KARTEI, 99);
    }, 0);

    weg = false;
    await s.holen();
    weg = true;
    await s.holen();
    weg = false;
    const z = await s.holen();

    assert.equal(s.lage().erreichbar, true);
    assert.equal(s.lage().ausSpiegel, false);
    assert.equal(z.spiel.eintraege, 99);
  });
});

/* ------------------------------------------------------------- Pause */

describe('Karteispiegel - Pause nach einem Fehlversuch', () => {
  test('fragt nicht bei jedem Abruf erneut nach', async () => {
    /* Ist turnier unerreichbar statt abweisend, laeuft jeder Versuch ins
       Zeitlimit. Ohne Pause zahlt das jeder Upload einzeln - obwohl der
       Spiegel die Antwort schon hat. */
    let versuche = 0;
    let weg = false;
    const s = ladeSpiegel(datei, async () => {
      versuche++;
      if (weg) throw new TurnierNichtErreichbar('http://x', 'weg');
      return zustand();
    }, 5000);

    await s.holen();
    weg = true;
    await s.holen();
    const nachFehler = versuche;

    await s.holen();
    await s.holen();

    assert.equal(versuche, nachFehler, 'in der Pause wird gar nicht gefragt');
    assert.equal(s.lage().ausSpiegel, true);
  });

  test('fragt nach Ablauf der Pause wieder', async () => {
    let weg = true;
    const s = ladeSpiegel(datei, async () => {
      if (weg) throw new TurnierNichtErreichbar('http://x', 'weg');
      return zustand(KARTEI, 42);
    }, 20);

    weg = false;
    await s.holen();
    weg = true;
    await s.holen();

    weg = false;
    await new Promise((f) => setTimeout(f, 30));
    const z = await s.holen();

    assert.equal(z.spiel.eintraege, 42);
    assert.equal(s.lage().erreichbar, true);
  });

  test('pausiert nicht, solange es keinen Stand gibt', async () => {
    // Ohne Spiegel waere der Server sonst nach einem Fehlschlag eine
    // halbe Minute lang blind, obwohl turnier vielleicht schon da ist.
    let versuche = 0;
    const s = ladeSpiegel(datei, async () => {
      versuche++;
      throw new TurnierNichtErreichbar('http://x', 'weg');
    }, 5000);

    await assert.rejects(() => s.holen());
    await assert.rejects(() => s.holen());
    assert.equal(versuche, 2);
  });
});

/* ------------------------------------- Einrichtungsfehler bleiben sichtbar */

describe('Karteispiegel - Einrichtungsfehler', () => {
  test('verdeckt eine Ablehnung NICHT mit dem Spiegel', async () => {
    /* "Punkteliste gibt es nicht" ist kein Ausfall, sondern falsch
       eingerichtet. Mit altem Spiegel weiterzumachen hiesse, in eine
       gameId einzutragen, die es so nicht mehr gibt. */
    let kaputt = false;
    const s = ladeSpiegel(datei, async () => {
      if (kaputt) throw new TurnierAbgelehnt('Punkteliste "Meccha 2026" gibt es nicht');
      return zustand();
    });

    await s.holen();
    kaputt = true;

    await assert.rejects(() => s.holen(), /gibt es nicht/);
    assert.equal(s.lage().ausSpiegel, false);
    assert.equal(s.lage().erreichbar, true, 'turnier hat ja geantwortet - nur ablehnend');
  });
});

/* --------------------------------------------------- Speichern und Laden */

describe('Karteispiegel - Speichern und Laden', () => {
  test('ueberlebt einen Neustart', async () => {
    const eins = ladeSpiegel(datei, async () => zustand());
    await eins.holen();

    const zwei = ladeSpiegel(datei, async () => {
      throw new TurnierNichtErreichbar('http://x', 'weg');
    });
    const z = await zwei.holen();

    assert.equal(z.zustand.kartei.length, 2);
    assert.equal(zwei.lage().ausSpiegel, true);
  });

  test('legt eine beschaedigte Datei zur Seite', async () => {
    const kaputt = path.join(ORDNER, 'kaputt-' + n + '.json');
    writeFileSync(kaputt, '{das ist kein json', 'utf8');

    const s = ladeSpiegel(kaputt, async () => zustand());
    assert.equal(s.hatStand(), false, 'kaputt heisst: kein Stand, nicht halber Stand');

    const beiseite = readdirSync(ORDNER).filter((f) => f.includes('defekt'));
    assert.ok(beiseite.length > 0);

    // Und danach baut der naechste erfolgreiche Abruf ihn neu auf.
    await s.holen();
    assert.equal(s.hatStand(), true);
  });

  test('nimmt eine unvollstaendige Datei nicht als Stand', async () => {
    const halb = path.join(ORDNER, 'halb-' + n + '.json');
    writeFileSync(halb, JSON.stringify({ version: 1, gespiegeltAm: 1 }), 'utf8');

    const s = ladeSpiegel(halb, async () => {
      throw new TurnierNichtErreichbar('http://x', 'weg');
    });
    assert.equal(s.hatStand(), false);
    await assert.rejects(() => s.holen());
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { kontoSeite } from '../src/konto-seite.js';
import { Seite, fuehreAus, idsAus, type Knoten } from './hilfe-dom.js';

/* =========================================================================
   DIE RANGLISTE, WIRKLICH GEZEICHNET

   Diese Datei gibt es, weil dieselbe Stelle zweimal kaputtgegangen ist,
   ohne dass ein Test etwas gemerkt hat:

     1. Ein Zugriff auf ein Element, das im HTML gar nicht steht.
     2. kopfDaten.voll in ladeRangliste() - eine Variable, die es nur
        in baueRangliste() gibt. Zur Laufzeit ein ReferenceError, vom
        catch geschluckt, und die oeffentliche Rangliste blieb LEER.

   Beide waren syntaktisch tadellos. Tests, die im Quelltext nach
   Mustern suchen, koennen so etwas nicht finden - sie pruefen, DASS
   etwas dasteht, nicht ob es laeuft.

   Hier laeuft es: das Skript der Seite wird in einem winzigen
   gefaelschten DOM ausgefuehrt, mit gefaelschten Serverantworten. Was
   dabei herauskommt, wird nachgesehen. Ein ReferenceError faellt sofort
   auf, denn er kommt aus fuehreAus() heraus.
   ========================================================================= */

const HTML = kontoSeite();

/** Eine Ranglistenzeile, wie der Server sie liefert. */
function zeile(
  name: string, schnitt: number, gesamt: number, imFenster: number, platz?: number,
  tendenz: string = 'gleich'
) {
  return {
    listeId: 'l1', kontoId: 'k_' + name, name, schnitt, imFenster, gesamt,
    letzter: 1, werte: [], tendenz, abweichung: 0,
    ...(platz === undefined ? {} : { platz })
  };
}

/** Die Antwort von /api/rangliste, wie server.ts sie baut. */
function ranglisteMit(listen: unknown[]) {
  return { ok: true, fenster: 10, voll: 10, listen };
}

const EINE_LISTE = ranglisteMit([{
  id: 'l1',
  name: 'Meccha 2026',
  eintraege: 79,
  gewertet: [
    zeile('Zironic', 1148.4, 12, 10, 1),
    zeile('Matilder', 1123.4, 11, 10, 2),
    zeile('Nori', 1095.6, 14, 10, 3),
    zeile('Hupferli', 925.4, 10, 10, 4)
  ],
  anwaerter: [
    zeile('Honey', 1411.7, 7, 7),
    zeile('DungaD', 1294.6, 5, 5),
    zeile('Hoeje', 298.7, 6, 6)
  ],
  aufDemSprung: [
    zeile('Honey', 1411.7, 7, 7),
    zeile('DungaD', 1294.6, 5, 5)
  ],
  letzte: []
}]);

const GRUNDANTWORTEN = {
  '/api/status': { ok: true, offen: 0, maxBild: 8388608, minSpieler: 6 },
  '/api/client': { ok: true, name: 'Meccha-Ranked.exe', groesse: 50688, sha256: 'a'.repeat(64), version: '0.5.0', istZip: false },
  '/api/konto': { ok: true, angemeldet: false }
};

async function zeichne(rangliste: unknown): Promise<Seite> {
  const seite = new Seite(
    { ...GRUNDANTWORTEN, '/api/rangliste': rangliste },
    idsAus(HTML)
  );
  await fuehreAus(HTML, seite);
  return seite;
}

/** Der ganze Text im Ranglisten-Bereich. */
function textVon(seite: Seite): string {
  const ziel = seite.hole('rangliste');
  assert.ok(ziel, 'das Element rangliste fehlt');
  return ziel.textContent;
}

describe('Die Tendenz steht in der Zeile', () => {
  /* Der Pfeil sagt nicht, wie sich der PLATZ bewegt hat - den von
     gestern kennt niemand. Er sagt, was gerade hineinlaeuft: liegen die
     letzten Runden ueber dem eigenen Schnitt, steigt er. */
  const MIT_PFEILEN = ranglisteMit([{
    id: 'l1', name: 'Meccha 2026', eintraege: 40,
    gewertet: [
      zeile('Steigt', 900, 12, 10, 1, 'auf'),
      zeile('Faellt', 800, 12, 10, 2, 'ab'),
      zeile('Ruhig', 700, 12, 10, 3, 'gleich'),
      zeile('Neu', 600, 5, 5, 4, 'unklar')
    ],
    anwaerter: [], aufDemSprung: [], letzte: []
  }]);

  const pfeileIn = async (rangliste: unknown) => {
    const ziel = (await zeichne(rangliste)).hole('rangliste');
    assert.ok(ziel);
    return ziel.textContent;
  };

  test('aufwaerts bekommt einen Pfeil hinauf', async () => {
    assert.match(await pfeileIn(MIT_PFEILEN), /▲/);
  });

  test('abwaerts bekommt einen Pfeil hinunter', async () => {
    assert.match(await pfeileIn(MIT_PFEILEN), /▼/);
  });

  test('ohne Bewegung und ohne Grundlage steht kein Pfeil', async () => {
    /* Zwei Pfeile in der Tabelle, nicht vier: "gleich" und "unklar"
       bekommen keinen. Ein Pfeil, den es immer gibt, sagt nichts mehr -
       und "unklar" heisst, wir haben gar nicht nachgesehen.

       Zwei weitere stehen in der Legende, deshalb wird hier nur die
       Tabelle gezaehlt. */
    const seite = await zeichne(MIT_PFEILEN);
    const text = seite.hole('rangliste')!.textContent;
    const hinauf = (text.match(/▲/g) ?? []).length;
    const hinunter = (text.match(/▼/g) ?? []).length;
    assert.equal(hinauf, 2, 'einer in der Zeile, einer in der Legende');
    assert.equal(hinunter, 2);
  });

  test('die Legende erklaert die Pfeile', async () => {
    // Ein nackter Pfeil ist ein Raetsel.
    assert.match(await pfeileIn(MIT_PFEILEN), /Schnitt|average|平均/);
  });

  test('ohne Pfeil in der Liste auch keine Legende', async () => {
    /* Eine Legende zu nichts ist nur Text. */
    const ohne = ranglisteMit([{
      id: 'l1', name: 'Meccha 2026', eintraege: 3,
      gewertet: [zeile('Ruhig', 700, 12, 10, 1, 'gleich')],
      anwaerter: [], aufDemSprung: [], letzte: []
    }]);
    const text = await pfeileIn(ohne);
    assert.doesNotMatch(text, /▲|▼/);
  });
});

describe('Die Rangliste wird gezeichnet', () => {
  test('das Skript laeuft ueberhaupt durch', async () => {
    /* DER Test, der beide bisherigen Fehler gefangen haette. Wirft das
       Skript - fehlendes Element, Variable ausserhalb ihres Bereichs -,
       kommt der Fehler hier heraus statt in einer Konsolenzeile, die
       niemand liest. */
    await zeichne(EINE_LISTE);
  });

  test('fragt die Rangliste beim Server ab', async () => {
    const seite = await zeichne(EINE_LISTE);
    assert.ok(seite.gerufen.includes('/api/rangliste'));
  });

  test('alle gewerteten Spieler stehen da', async () => {
    const text = textVon(await zeichne(EINE_LISTE));
    for (const name of ['Zironic', 'Matilder', 'Nori', 'Hupferli']) {
      assert.match(text, new RegExp(name), name + ' fehlt in der Rangliste');
    }
  });

  test('die Anwaerter auch', async () => {
    const text = textVon(await zeichne(EINE_LISTE));
    for (const name of ['Honey', 'DungaD', 'Hoeje']) {
      assert.match(text, new RegExp(name), name + ' fehlt bei den Anwaertern');
    }
  });

  test('die Platzierung steht dabei', async () => {
    const text = textVon(await zeichne(EINE_LISTE));
    assert.match(text, /1.*Zironic/s, 'Platz 1 gehoert zu Zironic');
  });

  test('der Schnitt wird angezeigt, nicht die Rohpunkte', async () => {
    // 1148.4 - in irgendeiner Schreibweise, aber die Zahl muss da sein.
    const text = textVon(await zeichne(EINE_LISTE)).replace(/\s/g, '');
    assert.ok(/1[.,]?148/.test(text), 'der Schnitt von Zironic fehlt: ' + text.slice(0, 200));
  });

  test('"Auf dem Sprung" erscheint mit den richtigen Leuten', async () => {
    /* Honey und DungaD wuerden es unter die ersten drei schaffen, Hoeje
       nicht - obwohl er mehr Runden hat als DungaD. Genau diese
       Unterscheidung soll der Block treffen. */
    const seite = await zeichne(EINE_LISTE);
    const kasten = seite.hole('rangliste')!.querySelectorAll('.sprung');
    assert.equal(kasten.length, 1, 'der Sprung-Block fehlt');

    const text = kasten[0]!.textContent;
    assert.match(text, /Honey/);
    assert.match(text, /DungaD/);
    assert.doesNotMatch(text, /Hoeje/, 'Hoeje hat zu wenig Punkte fuer die ersten drei');
  });

  test('ohne Kandidaten kein Sprung-Block', async () => {
    const ohne = ranglisteMit([{
      id: 'l1', name: 'Leer', eintraege: 0,
      gewertet: [], anwaerter: [], aufDemSprung: [], letzte: []
    }]);
    const seite = await zeichne(ohne);
    assert.equal(seite.hole('rangliste')!.querySelectorAll('.sprung').length, 0);
  });
});

describe('Mehrere Ranglisten', () => {
  const ZWEI = ranglisteMit([
    {
      id: 'l1', name: 'Meccha 2026', eintraege: 79,
      gewertet: [zeile('Zironic', 1148.4, 12, 10, 1)],
      anwaerter: [], aufDemSprung: [], letzte: []
    },
    {
      id: 'l2', name: 'August 2026', eintraege: 12,
      gewertet: [zeile('Nori', 900, 10, 10, 1)],
      anwaerter: [], aufDemSprung: [], letzte: []
    }
  ]);

  test('bei zwei Listen gibt es einen Umschalter', async () => {
    const seite = await zeichne(ZWEI);
    const schalter = seite.hole('rangliste')!.querySelectorAll('.umschalter');
    assert.equal(schalter.length, 1);
    assert.match(schalter[0]!.textContent, /Meccha 2026/);
    assert.match(schalter[0]!.textContent, /August 2026/);
  });

  test('bei einer Liste keiner', async () => {
    /* Eine einzelne Schaltflaeche, die nichts umschaltet, ist nur eine
       Frage, die sich niemand stellt. */
    const seite = await zeichne(EINE_LISTE);
    assert.equal(seite.hole('rangliste')!.querySelectorAll('.umschalter').length, 0);
  });

  test('gezeigt wird zuerst die erste Liste', async () => {
    const text = textVon(await zeichne(ZWEI));
    assert.match(text, /Zironic/, 'die erste Liste steht im Inhalt');
  });
});

describe('Wenn nichts da ist', () => {
  test('gar keine Liste sagt das, statt leer zu bleiben', async () => {
    const seite = await zeichne(ranglisteMit([]));
    assert.match(textVon(seite), /keine Wertung|No leaderboard/i);
  });

  test('eine leere Liste sagt es ebenfalls', async () => {
    const leer = ranglisteMit([{
      id: 'l1', name: 'Frisch', eintraege: 0,
      gewertet: [], anwaerter: [], aufDemSprung: [], letzte: []
    }]);
    const text = textVon(await zeichne(leer));
    assert.match(text, /Noch keine Runden|No rounds/i);
  });

  test('ein Serverfehler laesst die Seite trotzdem stehen', async () => {
    /* Die Rangliste ist eine Zugabe fuer den, der nur nachsieht - faellt
       sie aus, darf nicht die ganze Seite mitgehen. */
    const seite = new Seite(
      { ...GRUNDANTWORTEN },   // /api/rangliste fehlt absichtlich
      idsAus(HTML)
    );
    await fuehreAus(HTML, seite);
    assert.ok(seite.hole('rangliste'), 'die Seite steht noch');
  });
});

describe('Die Rangliste bleibt frisch', () => {
  test('ein Takt ist eingerichtet', async () => {
    const seite = await zeichne(EINE_LISTE);
    assert.ok(seite.takte.length >= 1, 'kein setInterval - die Seite altert stumm');
    assert.ok(seite.takte.some((t) => t.ms <= 30000),
      'der Takt ist zu lang: ' + seite.takte.map((t) => t.ms).join(', '));
  });

  test('der Takt zeichnet wirklich neu', async () => {
    /* Nicht nur "ein setInterval existiert" - er muss auch etwas tun.
       Nach dem Auslesen wird die Rangliste erneut geholt. */
    const seite = await zeichne(EINE_LISTE);
    const vorher = seite.gerufen.filter((p) => p === '/api/rangliste').length;

    for (const t of seite.takte) t.fn();
    for (let i = 0; i < 12; i++) await Promise.resolve();

    const nachher = seite.gerufen.filter((p) => p === '/api/rangliste').length;
    assert.ok(nachher > vorher,
      'der Takt hat die Rangliste nicht neu geholt (' + vorher + ' -> ' + nachher + ')');
  });

  test('nach dem Neuladen steht wieder alles da', async () => {
    // Ein zweiter Durchgang darf die Liste nicht leeren.
    const seite = await zeichne(EINE_LISTE);
    for (const t of seite.takte) t.fn();
    for (let i = 0; i < 12; i++) await Promise.resolve();

    assert.match(textVon(seite), /Zironic/, 'nach dem Takt ist die Rangliste leer');
  });
});

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  pruefeVerdacht, fruehereAblehnungen, verlaufVon,
  VERDACHT_AB_PUNKTEN, VERDACHT_TAGE
} from '../src/verdacht.js';
import { nameKey } from '../src/namen.js';
import type { OffeneRunde, FreigabeStatus } from '../src/freigabe.js';
import type { RohZeile } from '../src/parse.js';

/* =========================================================================
   Dieselbe Punktzahl schon wieder.

   Der Fall, den weder Bild-Hash noch Partie-Kennung fangen: echte Runden
   mit wechselnden Mitspielern, aber die eigene Zeile immer auf denselben
   Wert gefaelscht.
   ========================================================================= */

const TAG = 24 * 60 * 60 * 1000;
const JETZT = 1787000000000;

let zeilennummer = 0;

function zeile(name: string, punkte: number | null): RohZeile {
  return {
    // Nur zur Anzeige bei Rueckfragen - fuer die Pruefung ohne Bedeutung.
    zeile: ++zeilennummer,
    rohName: name,
    rohPunkte: punkte === null ? '???' : String(punkte),
    punkte: punkte === null ? null : { punkte, unsicher: false }
  };
}

/** Eine abgelegte Runde, wie sie in der Freigabeliste steht. */
function runde(o: {
  wer: string;
  punkte: number;
  vorTagen?: number;
  status?: FreigabeStatus;
  mitspieler?: ReadonlyArray<[string, number]>;
}): OffeneRunde {
  const zeilen = [
    zeile(o.wer, o.punkte),
    ...(o.mitspieler ?? [['Fremd', 111], ['Anderer', 222]] as ReadonlyArray<[string, number]>)
      .map(([n, p]) => zeile(n, p))
  ];
  return {
    id: 'r_' + Math.random().toString(36).slice(2, 8),
    eingegangen: JETZT - (o.vorTagen ?? 1) * TAG,
    quelle: 'zuschauer',
    absender: o.wer,
    bildPfad: '/tmp/x.png',
    bildHash: Math.random().toString(36),
    zeilen,
    beansprucht: [nameKey(o.wer)],
    status: o.status ?? 'freigegeben'
  };
}

/** Was gerade hochgeladen wurde. */
function neu(wer: string, punkte: number, mitspieler?: ReadonlyArray<[string, number]>) {
  return {
    zeilen: [
      zeile(wer, punkte),
      ...(mitspieler ?? [['Neu1', 333], ['Neu2', 444]] as ReadonlyArray<[string, number]>)
        .map(([n, p]) => zeile(n, p))
    ],
    beansprucht: [nameKey(wer)]
  };
}

/* ------------------------------------------------------------ Grundfall */

describe('Verdacht - dieselbe Punktzahl wieder', () => {
  test('laesst eine erste Einreichung durch', () => {
    const v = pruefeVerdacht([], neu('Jones', 11714), JETZT);
    assert.equal(v.geflaggt, false);
    assert.deepEqual(v.gruende, []);
  });

  test('flaggt die zweite mit demselben Wert', () => {
    const v = pruefeVerdacht([runde({ wer: 'Jones', punkte: 11714 })], neu('Jones', 11714), JETZT);
    assert.equal(v.geflaggt, true);
    assert.match(v.gruende[0]!, /2\. Mal/);
    assert.match(v.gruende[0]!, /11714/);
  });

  test('zaehlt weiter hoch', () => {
    const frueher = [
      runde({ wer: 'Jones', punkte: 11714, vorTagen: 9 }),
      runde({ wer: 'Jones', punkte: 11714, vorTagen: 4 })
    ];
    const v = pruefeVerdacht(frueher, neu('Jones', 11714), JETZT);
    assert.match(v.gruende[0]!, /3\. Mal/);
  });

  test('nennt, wann es zuletzt war und wie es damals ausging', () => {
    // Damit man nicht erst die Historie durchsuchen muss.
    const v = pruefeVerdacht(
      [runde({ wer: 'Jones', punkte: 11714, vorTagen: 3, status: 'abgelehnt' })],
      neu('Jones', 11714), JETZT
    );
    assert.match(v.gruende[0]!, /vor 3 Tagen/);
    assert.match(v.gruende[0]!, /damals abgelehnt/);
  });

  test('nimmt den juengsten Treffer fuer den Text', () => {
    const frueher = [
      runde({ wer: 'Jones', punkte: 11714, vorTagen: 20 }),
      runde({ wer: 'Jones', punkte: 11714, vorTagen: 1 })
    ];
    const v = pruefeVerdacht(frueher, neu('Jones', 11714), JETZT);
    assert.match(v.gruende[0]!, /gestern/);
  });

  test('faellt nicht auf wechselnde Mitspieler herein', () => {
    /* Genau der Fall, den die Partie-Kennung nicht faengt: echte Lobbys,
       aber die eigene Zeile immer derselbe erfundene Wert. */
    const frueher = [
      runde({ wer: 'Jones', punkte: 11714, mitspieler: [['A', 800], ['B', 700]] })
    ];
    const v = pruefeVerdacht(frueher, neu('Jones', 11714, [['C', 650], ['D', 500]]), JETZT);
    assert.equal(v.geflaggt, true);
  });
});

/* --------------------------------------------------------- Abgrenzungen */

describe('Verdacht - was NICHT flaggt', () => {
  test('eine andere Punktzahl', () => {
    const v = pruefeVerdacht([runde({ wer: 'Jones', punkte: 11714 })], neu('Jones', 11715), JETZT);
    assert.equal(v.geflaggt, false);
  });

  test('Kleinkram unterhalb der Schwelle', () => {
    // Wer eine Runde frueh verlaesst, hat oft dieselbe kleine Zahl.
    const klein = VERDACHT_AB_PUNKTEN - 1;
    const v = pruefeVerdacht([runde({ wer: 'Jones', punkte: klein })], neu('Jones', klein), JETZT);
    assert.equal(v.geflaggt, false);
  });

  test('genau die Schwelle zaehlt schon', () => {
    const v = pruefeVerdacht(
      [runde({ wer: 'Jones', punkte: VERDACHT_AB_PUNKTEN })],
      neu('Jones', VERDACHT_AB_PUNKTEN), JETZT
    );
    assert.equal(v.geflaggt, true);
  });

  test('etwas, das aus dem Zeitfenster gefallen ist', () => {
    const v = pruefeVerdacht(
      [runde({ wer: 'Jones', punkte: 11714, vorTagen: VERDACHT_TAGE + 2 })],
      neu('Jones', 11714), JETZT
    );
    assert.equal(v.geflaggt, false);
  });

  test('dieselbe Punktzahl bei einer ANDEREN Person', () => {
    // Zwei Leute koennen denselben Wert haben - das ist kein Verdacht.
    const v = pruefeVerdacht([runde({ wer: 'TREV', punkte: 11714 })], neu('Jones', 11714), JETZT);
    assert.equal(v.geflaggt, false);
  });

  test('die Punktzahl eines Mitspielers, die sich wiederholt', () => {
    /* Beansprucht wird nur die eigene Zeile. Fuer fremde Zeilen ist
       dieser Absender nicht verantwortlich - sonst haenge der Verdacht
       an jemandem, der nur zufaellig in derselben Lobby stand. */
    const frueher = [
      runde({ wer: 'TREV', punkte: 5000, mitspieler: [['Jones', 11714]] })
    ];
    const v = pruefeVerdacht(frueher, neu('Jones', 5000, [['TREV', 11714]]), JETZT);
    assert.equal(v.geflaggt, false, 'die 11714 gehoert hier keinem der beiden Absender');
  });

  test('eine nicht lesbare Zeile', () => {
    const v = pruefeVerdacht(
      [runde({ wer: 'Jones', punkte: 11714 })],
      { zeilen: [zeile('Jones', null)], beansprucht: [nameKey('Jones')] },
      JETZT
    );
    assert.equal(v.geflaggt, false);
  });
});

/* ------------------------------------------------------- Namensvarianten */

describe('Verdacht - die Person haengt am Ingame-Namen', () => {
  test('erkennt sie trotz anderer Gross-/Kleinschreibung', () => {
    // nameKey ist zeichengleich zum Turnier-Server: trim + lowercase.
    const v = pruefeVerdacht([runde({ wer: 'JONES', punkte: 11714 })], neu('jones', 11714), JETZT);
    assert.equal(v.geflaggt, true);
  });

  test('greift auch, wenn der Absendername ein anderer ist', () => {
    /* Ein neuer Token oder ein geaenderter Anzeigename darf nicht an der
       Pruefung vorbeifuehren - gewertet wird der Ingame-Name. */
    const alt = runde({ wer: 'Jones', punkte: 11714 });
    const mitAnderemAbsender: OffeneRunde = { ...alt, absender: 'Zweitkonto' };
    const v = pruefeVerdacht([mitAnderemAbsender], neu('Jones', 11714), JETZT);
    assert.equal(v.geflaggt, true);
  });
});

/* --------------------------------------------------------- Vorgeschichte */

describe('Frühere Ablehnungen', () => {
  test('meldet eine einzelne', () => {
    const frueher = [runde({ wer: 'Jones', punkte: 5000, status: 'abgelehnt' })];
    const s = fruehereAblehnungen(frueher, [nameKey('Jones')], JETZT);
    assert.match(String(s), /schon einmal eine Runde abgelehnt/);
  });

  test('zaehlt mehrere', () => {
    const frueher = [
      runde({ wer: 'Jones', punkte: 5000, status: 'abgelehnt' }),
      runde({ wer: 'Jones', punkte: 6000, status: 'abgelehnt', vorTagen: 5 })
    ];
    assert.match(String(fruehereAblehnungen(frueher, [nameKey('Jones')], JETZT)), /schon 2 Runden/);
  });

  test('schweigt bei einer sauberen Historie', () => {
    const frueher = [runde({ wer: 'Jones', punkte: 5000, status: 'freigegeben' })];
    assert.equal(fruehereAblehnungen(frueher, [nameKey('Jones')], JETZT), null);
  });

  test('schweigt bei einer fremden Ablehnung', () => {
    const frueher = [runde({ wer: 'TREV', punkte: 5000, status: 'abgelehnt' })];
    assert.equal(fruehereAblehnungen(frueher, [nameKey('Jones')], JETZT), null);
  });

  test('vergisst alte Ablehnungen', () => {
    // Sonst haenge jemandem ein einzelner Fehlgriff fuer immer an.
    const frueher = [
      runde({ wer: 'Jones', punkte: 5000, status: 'abgelehnt', vorTagen: VERDACHT_TAGE + 5 })
    ];
    assert.equal(fruehereAblehnungen(frueher, [nameKey('Jones')], JETZT), null);
  });

  test('kommt ohne Anspruch zurecht', () => {
    assert.equal(fruehereAblehnungen([], undefined, JETZT), null);
  });
});

/* ------------------------------------------------------------- Verlauf */

describe('Verlauf einer Person', () => {
  test('gibt die eigenen Einreichungen zurueck, neueste zuerst', () => {
    const frueher = [
      runde({ wer: 'Jones', punkte: 400, vorTagen: 5 }),
      runde({ wer: 'Jones', punkte: 900, vorTagen: 1 }),
      runde({ wer: 'Jones', punkte: 700, vorTagen: 3 })
    ];
    const v = verlaufVon(frueher, [nameKey('Jones')]);
    assert.deepEqual(v.map((x) => x.punkte), [900, 700, 400]);
  });

  test('nimmt den Status mit', () => {
    // Beim Entscheiden ist "wurde damals abgelehnt" die halbe Antwort.
    const frueher = [runde({ wer: 'Jones', punkte: 900, status: 'abgelehnt' })];
    assert.equal(verlaufVon(frueher, [nameKey('Jones')])[0]?.status, 'abgelehnt');
  });

  test('laesst fremde Zeilen weg', () => {
    /* In der Runde stehen auch die Mitspieler. Auf der Karte soll aber
       stehen, was DIESE Person zuletzt hatte. */
    const frueher = [
      runde({ wer: 'Jones', punkte: 900, mitspieler: [['TREV', 5000]] })
    ];
    const v = verlaufVon(frueher, [nameKey('Jones')]);
    assert.deepEqual(v.map((x) => x.punkte), [900]);
  });

  test('nimmt auch kleine Punktzahlen mit', () => {
    // Anders als beim Verdacht: hier hilft gerade das Uebliche beim
    // Einschaetzen, ob ein grosser Wert plausibel ist.
    const frueher = [runde({ wer: 'Jones', punkte: 46 })];
    assert.equal(verlaufVon(frueher, [nameKey('Jones')]).length, 1);
  });

  test('begrenzt die Anzahl', () => {
    const frueher = Array.from({ length: 9 }, (_, i) =>
      runde({ wer: 'Jones', punkte: 100 + i, vorTagen: i + 1 }));
    assert.equal(verlaufVon(frueher, [nameKey('Jones')]).length, 5);
    assert.equal(verlaufVon(frueher, [nameKey('Jones')], 2).length, 2);
  });

  test('ist leer, wenn nichts beansprucht wurde', () => {
    assert.deepEqual(verlaufVon([runde({ wer: 'Jones', punkte: 900 })], undefined), []);
  });

  test('ist leer bei einer fremden Person', () => {
    assert.deepEqual(verlaufVon([runde({ wer: 'TREV', punkte: 900 })], [nameKey('Jones')]), []);
  });
});

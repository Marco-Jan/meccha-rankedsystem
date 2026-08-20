/* =========================================================================
   ENTSCHEIDUNG PRO ZEILE

   Hier laeuft zusammen, was parse.ts gelesen und namen.ts zugeordnet hat.
   Das Ergebnis ist pro Zeile entweder "eintragen" oder "rueckfrage".

   Leitsatz: eine Zeile wird nur eingetragen, wenn BEIDES sicher ist - der
   Name und die Punktzahl. Ein sicherer Name mit unsicherer Zahl ist genauso
   unbrauchbar wie das Gegenteil, weil die Punkte gewertet werden.
   ========================================================================= */

import { ordneZu, istSicher, type Spieler, type Zuordnung } from './namen.js';
import type { RohZeile } from './parse.js';
import { MIN_CONFIDENCE } from './config.js';

export type Aktion = 'eintragen' | 'rueckfrage';

export interface Entscheidung {
  readonly zeile: RohZeile;
  readonly zuordnung: Zuordnung;
  readonly aktion: Aktion;
  /** Bei 'rueckfrage': warum. Geht so an Discord, deshalb verstaendlich. */
  readonly grund: string | null;
}

/** Confidence einer Zuordnung, unabhaengig von der Art. */
function confidenceVon(z: Zuordnung): number {
  switch (z.art) {
    case 'exakt': return 1;
    case 'normalisiert': return z.confidence;
    case 'fuzzy': return z.confidence;
    default: return 0;
  }
}

/** Kurze Begruendung, warum ein Name nicht sicher zugeordnet wurde. */
function nameGrund(z: Zuordnung): string {
  switch (z.art) {
    case 'mehrdeutig':
      return 'Name mehrdeutig - infrage kommen: ' +
        z.kandidaten.map((k) => k.name).join(', ');
    case 'unbekannt':
      return 'Name unbekannt';
    default:
      return 'Zuordnung zu unsicher (' + confidenceVon(z).toFixed(2) + ')';
  }
}

/**
 * Bewertet alle Zeilen einer Runde.
 *
 * mindestConfidence ist herausgezogen, damit Tests nicht von der
 * Env-Variablen abhaengen.
 */
export function bewerteRunde(
  zeilen: readonly RohZeile[],
  kartei: readonly Spieler[],
  mindestConfidence = MIN_CONFIDENCE
): Entscheidung[] {
  const vorlaeufig = zeilen.map((zeile) => {
    const zuordnung = ordneZu(zeile.rohName, kartei);
    return { zeile, zuordnung };
  });

  /*
     Zwei Zeilen, die auf dieselbe Person zeigen, koennen nicht beide
     richtig sein - in einer Lobby steht jeder genau einmal. Statt zu raten,
     welche der beiden gilt, gehen beide zur Rueckfrage.

     Das faellt sonst nicht auf: eine falsch zugeordnete Zeile wuerde dem
     Spieler eine fremde Punktzahl in den Schnitt schreiben.
  */
  const zaehler = new Map<string, number>();
  for (const { zuordnung } of vorlaeufig) {
    if (!istSicher(zuordnung)) continue;
    const id = (zuordnung as { person: Spieler }).person.id;
    zaehler.set(id, (zaehler.get(id) ?? 0) + 1);
  }

  return vorlaeufig.map(({ zeile, zuordnung }): Entscheidung => {
    // Reihenfolge der Pruefungen = Reihenfolge der Wichtigkeit in der
    // Rueckfrage. Die Punkte zuerst, weil sie gewertet werden.
    if (zeile.punkte === null) {
      return {
        zeile, zuordnung, aktion: 'rueckfrage',
        grund: 'Punkte nicht lesbar: ' + JSON.stringify(zeile.rohPunkte)
      };
    }
    if (zeile.punkte.unsicher) {
      return {
        zeile, zuordnung, aktion: 'rueckfrage',
        grund: 'Punkte nur mit Zeichenersetzung lesbar: ' +
          JSON.stringify(zeile.rohPunkte) + ' -> ' + zeile.punkte.punkte
      };
    }
    if (!istSicher(zuordnung)) {
      return { zeile, zuordnung, aktion: 'rueckfrage', grund: nameGrund(zuordnung) };
    }
    if (confidenceVon(zuordnung) < mindestConfidence) {
      return { zeile, zuordnung, aktion: 'rueckfrage', grund: nameGrund(zuordnung) };
    }

    const person = (zuordnung as { person: Spieler }).person;
    if ((zaehler.get(person.id) ?? 0) > 1) {
      return {
        zeile, zuordnung, aktion: 'rueckfrage',
        grund: 'Mehrere Zeilen zeigen auf ' + person.name + ' - eine davon ist falsch gelesen'
      };
    }

    return { zeile, zuordnung, aktion: 'eintragen', grund: null };
  });
}

/** Die Person einer Entscheidung, sofern sie eintragbar ist. */
export function personVon(e: Entscheidung): Spieler | null {
  if (!istSicher(e.zuordnung)) return null;
  return (e.zuordnung as { person: Spieler }).person;
}

export interface RundenBericht {
  readonly einzutragen: readonly Entscheidung[];
  readonly rueckfragen: readonly Entscheidung[];
}

export function teileAuf(entscheidungen: readonly Entscheidung[]): RundenBericht {
  return {
    einzutragen: entscheidungen.filter((e) => e.aktion === 'eintragen'),
    rueckfragen: entscheidungen.filter((e) => e.aktion === 'rueckfrage')
  };
}

/* =========================================================================
   EIN DURCHLAUF - aufnehmen, lesen, entscheiden, eintragen.

   Herausgezogen, damit der Hotkey-Waechter (cli/wache.ts) und der
   Einzelaufruf (cli/runde.ts) exakt dasselbe tun. Zwei Kopien wuerden
   frueher oder spaeter auseinanderlaufen, und dann waere unklar, welche
   von beiden die Runden richtig eintraegt.

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import { nimmAuf, type Ausschnitt, type Aufnahme } from './screenshot.js';
import { leseListe } from './leser.js';
import { waehleLeser } from './leser-wahl.js';
import { bewerteRunde, teileAuf, personVon, type RundenBericht } from './runde.js';
import type { Wertungsstand } from './wertung.js';

export interface DurchlaufOptionen {
  readonly stand: Wertungsstand;
  readonly bildschirm: number;
  readonly ausschnitt?: Ausschnitt | undefined;
  /**
   * Wohin die Punkte gehen. Fehlt es, wird nur gelesen und angezeigt -
   * das ist der Probelauf.
   */
  readonly eintragen?: ((kontoId: string, punkte: number) => void) | undefined;
}

export interface DurchlaufErgebnis {
  readonly aufnahme: Aufnahme;
  readonly bericht: RundenBericht;
  readonly sekunden: number;
  /** Wie viele Zeilen tatsaechlich geschrieben wurden. */
  readonly geschrieben: number;
}

export async function fuehreDurch(o: DurchlaufOptionen): Promise<DurchlaufErgebnis> {
  const aufnahme = nimmAuf(o.bildschirm, undefined, o.ausschnitt);

  const start = Date.now();
  const zeilen = await leseListe(aufnahme.bild, 'image/png', waehleLeser());
  const sekunden = (Date.now() - start) / 1000;

  const bericht = teileAuf(bewerteRunde(zeilen, o.stand.spieler));

  let geschrieben = 0;
  if (o.eintragen) {
    for (const e of bericht.einzutragen) {
      // Die Konto-Kennung, nie der Rohname aus dem Bild.
      o.eintragen(personVon(e)!.id, e.zeile.punkte!.punkte);
      geschrieben++;
    }
  }

  return { aufnahme, bericht, sekunden, geschrieben };
}

/** Einheitliche Ausgabe fuer beide Aufrufwege. */
export function zeigeErgebnis(e: DurchlaufErgebnis, eingerueckt = '  '): void {
  const p = eingerueckt;
  console.log(p + 'Gelesen  : ' + (e.bericht.einzutragen.length + e.bericht.rueckfragen.length) +
    ' Zeilen in ' + e.sekunden.toFixed(1) + ' s');
  console.log('');

  console.log(p + 'EINTRAGEN (' + e.bericht.einzutragen.length + ')');
  if (!e.bericht.einzutragen.length) console.log(p + '  (nichts)');
  for (const d of e.bericht.einzutragen) {
    console.log(p + '  ' + d.zeile.rohName.padEnd(24) +
      String(d.zeile.punkte!.punkte).padStart(8) +
      '   -> ' + personVon(d)!.name + ' [' + d.zuordnung.art + ']');
  }

  console.log('');
  console.log(p + 'RUECKFRAGE (' + e.bericht.rueckfragen.length + ')');
  if (!e.bericht.rueckfragen.length) console.log(p + '  (nichts)');
  for (const d of e.bericht.rueckfragen) {
    console.log(p + '  ' + d.zeile.rohName.padEnd(24) +
      d.zeile.rohPunkte.padStart(8) + '   -> ' + d.grund);
  }
}

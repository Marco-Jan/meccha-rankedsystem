/* =========================================================================
   RANGLISTEN - mehrere nebeneinander.

   Bis zum 20.08.2026 gab es genau eine. Das reicht, solange durchgehend
   gespielt wird, aber nicht fuer Saisons: irgendwann soll ein Jahr
   abgeschlossen und ein neues angefangen werden, ohne dass die alten
   Punkte den neuen Schnitt verwaessern.

   -------------------------------------------------------------------------
   MEHRERE KOENNEN GLEICHZEITIG AKTIV SEIN

   Eine freigegebene Runde landet in JEDER aktiven Liste. Damit laesst
   sich eine Jahres- und eine Monatswertung nebeneinander fuehren: ein
   F9, zwei Eintraege.

   Das ist bewusst so und nicht "eine ist aktiv, der Rest ruht". Der
   Preis dafuer steht an zwei Stellen, und beide muss man kennen:

     - Der Zuschauer sieht seine Runde mehrfach. Deshalb nennt der
       Client sie je Liste, statt eine Zahl zu zeigen, die niemand
       zuordnen kann.

     - Wer eine Liste anlegt, verdoppelt ab dann jede Runde. Deshalb
       darf das nur ein Admin, nicht jeder Mod.

   -------------------------------------------------------------------------
   DEAKTIVIEREN HEISST VERSTECKEN, NICHT LOESCHEN

   Eine deaktivierte Liste nimmt nichts Neues mehr auf und verschwindet
   von der oeffentlichen Seite. Ihre Eintraege bleiben - sie ist im
   Dashboard weiter einzusehen und laesst sich jederzeit wieder
   einschalten. Etwas endgueltig wegzuwerfen, das eine Saison Arbeit
   ist, gehoert nicht hinter einen Knopf.
   ========================================================================= */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** Wie die erste Liste heisst, wenn noch keine da ist. */
export const ERSTE_LISTE = 'Meccha 2026';

const NAME_MAX = 40;

export interface Liste {
  readonly id: string;
  name: string;
  readonly angelegt: number;
  /**
   * Nimmt sie neue Eintraege auf und steht sie oeffentlich?
   *
   * Beides haengt zusammen: was nicht mehr mitzaehlt, soll auch nicht
   * mehr im Weg stehen. Wer den alten Endstand sehen will, findet ihn im
   * Dashboard.
   */
  aktiv: boolean;
}

interface ListenDatei {
  readonly version: 1;
  readonly listen: Liste[];
}

export type Ergebnis<T> =
  | { readonly ok: true; readonly wert: T }
  | { readonly ok: false; readonly fehler: string };

/** Vergleichsform fuer Namen - wie ueberall im Projekt. */
function schluessel(name: string): string {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function lesen(datei: string): Liste[] {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return [];
  }
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  try {
    const d = JSON.parse(roh) as ListenDatei;
    return Array.isArray(d.listen) ? d.listen : [];
  } catch (err) {
    /* Zur Seite legen statt ueberschreiben. Ohne diese Datei sind die
       Eintraege in rangliste.json herrenlos - sie haengen an listeId und
       waeren ohne Liste in keiner Wertung mehr. */
    const kaputt = datei.replace(/\.json$/, '') + '.defekt-' + Date.now() + '.json';
    try {
      renameSync(datei, kaputt);
      console.error('[mc-ranked] listen.json ist beschaedigt, liegt jetzt hier: ' + kaputt);
    } catch {
      console.error('[mc-ranked] listen.json ist beschaedigt:', (err as Error).message);
    }
    return [];
  }
}

export class Listen {
  private listen: Liste[];

  constructor(private readonly datei: string) {
    this.listen = lesen(datei);
  }

  speichern(): void {
    mkdirSync(path.dirname(this.datei), { recursive: true });
    const inhalt: ListenDatei = { version: 1, listen: this.listen };
    writeFileSync(this.datei, JSON.stringify(inhalt, null, 2), 'utf8');
  }

  alle(): readonly Liste[] {
    return this.listen;
  }

  /** Wohin neue Eintraege gehen und was oeffentlich steht. */
  aktive(): readonly Liste[] {
    return this.listen.filter((l) => l.aktiv);
  }

  finde(id: string): Liste | null {
    return this.listen.find((l) => l.id === id) ?? null;
  }

  findeNachName(name: string): Liste | null {
    const s = schluessel(name);
    return this.listen.find((l) => schluessel(l.name) === s) ?? null;
  }

  /**
   * Legt eine Liste an. Sie ist sofort aktiv und faengt bei null an.
   *
   * Der Name muss eindeutig sein - und zwar in der Vergleichsform. Zwei
   * Listen "Meccha 2026" und "Meccha 2026 " nebeneinander waeren im
   * Dashboard nicht zu unterscheiden, und die Wertung liefe still
   * auseinander. Genau dieser Fehler ist im Vorgaengerprojekt schon
   * einmal passiert.
   */
  anlegen(name: string, jetzt = Date.now()): Ergebnis<Liste> {
    const sauber = String(name ?? '').trim().slice(0, NAME_MAX);
    if (!sauber) return { ok: false, fehler: 'Bitte einen Namen für die Liste eingeben.' };
    if (this.findeNachName(sauber)) {
      return { ok: false, fehler: 'Eine Liste mit diesem Namen gibt es schon: ' + sauber };
    }

    const liste: Liste = {
      id: 'l_' + randomBytes(6).toString('hex'),
      name: sauber,
      angelegt: jetzt,
      aktiv: true
    };
    this.listen.push(liste);
    this.speichern();
    return { ok: true, wert: liste };
  }

  umbenennen(id: string, name: string): Ergebnis<Liste> {
    const liste = this.finde(id);
    if (!liste) return { ok: false, fehler: 'Liste nicht gefunden.' };

    const sauber = String(name ?? '').trim().slice(0, NAME_MAX);
    if (!sauber) return { ok: false, fehler: 'Bitte einen Namen eingeben.' };

    const belegt = this.findeNachName(sauber);
    if (belegt && belegt.id !== id) {
      return { ok: false, fehler: 'Eine Liste mit diesem Namen gibt es schon: ' + sauber };
    }

    liste.name = sauber;
    this.speichern();
    return { ok: true, wert: liste };
  }

  /**
   * Schaltet eine Liste ein oder aus.
   *
   * Die LETZTE aktive laesst sich nicht abschalten. Sonst gaebe es einen
   * Zustand, in dem freigegebene Runden nirgends landen - lautlos, denn
   * "in null Listen eingetragen" sieht aus wie "eingetragen". Wer
   * wirklich alles stilllegen will, legt vorher eine neue an.
   */
  setzeAktiv(id: string, aktiv: boolean): Ergebnis<Liste> {
    const liste = this.finde(id);
    if (!liste) return { ok: false, fehler: 'Liste nicht gefunden.' };

    if (!aktiv && liste.aktiv && this.aktive().length === 1) {
      return {
        ok: false,
        fehler: 'Das ist die letzte aktive Liste. Ohne sie würden freigegebene ' +
          'Runden nirgends landen. Leg zuerst eine neue an.'
      };
    }

    liste.aktiv = aktiv;
    this.speichern();
    return { ok: true, wert: liste };
  }

  /**
   * Sorgt dafuer, dass es mindestens eine Liste gibt.
   *
   * Gibt die Kennung der Liste zurueck, an die herrenlose Eintraege
   * gehaengt werden sollen - oder null, wenn schon Listen da sind und
   * nichts zu tun ist.
   *
   * Gebraucht beim ersten Start nach dem Umbau: rangliste.json kann
   * Eintraege ohne listeId enthalten, aus der Zeit mit nur einer Liste.
   * Ohne diese Zuordnung waeren sie herrenlos und faenden sich in keiner
   * Wertung wieder - die Saison waere still verschwunden.
   */
  sorgeFuerEine(name = ERSTE_LISTE, jetzt = Date.now()): string | null {
    if (this.listen.length > 0) return null;
    const neu = this.anlegen(name, jetzt);
    return neu.ok ? neu.wert.id : null;
  }
}

export function ladeListen(datei: string): Listen {
  return new Listen(datei);
}

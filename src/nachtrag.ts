/* =========================================================================
   NACHTRAG - Eintraege, die auf den Turnier-Server warten.

   Der zweite Teil der Eigenstaendigkeit. spiegel.ts sorgt dafuer, dass
   ohne turnier weiter GELESEN und ZUGEORDNET werden kann; hier geht es
   darum, dass das Ergebnis nicht verloren geht.

   Vorher: schlug POST /api/action fehl, bekam der Streamer beim Freigeben
   ein 502, die Runde blieb offen - und beim zweiten Versuch waeren die
   schon geschriebenen Zeilen doppelt gelandet. Jetzt wandert alles, was
   nicht durchkommt, hierher und wird spaeter nachgetragen.

   -------------------------------------------------------------------------
   DIE REIHENFOLGE IST DER GANZE WITZ

   turnier wertet den Schnitt der LETZTEN ZEHN Eintraege. Die Reihenfolge
   entscheidet also mit, was in der Wertung steht. Daraus folgen zwei
   Regeln, die zusammengehoeren:

     1. Abgearbeitet wird von vorne, und beim ERSTEN Fehler wird
        abgebrochen. Wuerde weitergelaufen, kaeme Eintrag 3 vor Eintrag 2
        in die Liste.

     2. Ist die Warteschlange nicht leer, geht auch ein FRISCHER Eintrag
        hinten hinein, statt direkt geschrieben zu werden. Sonst
        ueberholt er die Wartenden - dieselbe Vertauschung, nur von der
        anderen Seite.

   -------------------------------------------------------------------------
   WAS DIESE LOESUNG NICHT KANN

   Bricht die Verbindung genau zwischen "turnier hat den Eintrag
   geschrieben" und "wir haben die Antwort gesehen", wissen wir es nicht
   und tragen ihn spaeter ein zweites Mal ein. Das Fenster ist klein -
   turnier schreibt im selben Prozess, eine verlorene Antwort heisst
   praktisch, dass es mitten im Schreiben gestorben ist - aber es ist
   nicht null. Es gibt dagegen kein Mittel, solange liste.entry.add keine
   Kennung des Absenders mitfuehrt.

   Deshalb steht jeder Nachtrag mit Namen und Punktzahl im Dashboard: wenn
   nach einem Ausfall ein Eintrag doppelt in der Liste steht, ist er dort
   zu sehen und im Turnier-Admin in zwei Klicks geloescht.
   ========================================================================= */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import type { Eintrag } from './turnier-client.js';

/** Was aus einem Eintragungsversuch geworden ist. */
export type Eintragsergebnis = 'eingetragen' | 'gemerkt';

export interface Nachtrag {
  readonly id: string;
  readonly gameId: string;
  /** Der Kartei-Name, nie der OCR-Rohname. */
  readonly name: string;
  readonly punkte: number;
  readonly erstellt: number;
  /** Wer die Runde eingeschickt hat - zum Wiedererkennen im Dashboard. */
  readonly absender?: string;
  versuche: number;
  letzterFehler: string | null;
}

interface NachtragDatei {
  readonly version: 1;
  readonly wartend: Nachtrag[];
}

function lesen(datei: string): Nachtrag[] {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return [];
  }
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  try {
    const d = JSON.parse(roh) as NachtragDatei;
    return Array.isArray(d.wartend) ? d.wartend : [];
  } catch (err) {
    /* Zur Seite legen, nicht ueberschreiben: hier stehen Punkte, die noch
       niemand bekommen hat. */
    const kaputt = datei.replace(/\.json$/, '') + '.defekt-' + Date.now() + '.json';
    try {
      renameSync(datei, kaputt);
      console.log('  Nachtragsliste ist beschaedigt, liegt jetzt hier: ' + kaputt);
    } catch {
      console.log('  Nachtragsliste ist beschaedigt: ' + (err as Error).message);
    }
    return [];
  }
}

export interface Abarbeitung {
  readonly erledigt: number;
  readonly offen: number;
  /** Warum abgebrochen wurde. null, wenn alles durchging. */
  readonly fehler: string | null;
}

export class Nachtragliste {
  private wartend: Nachtrag[];

  constructor(
    private readonly datei: string,
    private readonly eintragen: (gameId: string, e: Eintrag) => Promise<void>
  ) {
    this.wartend = lesen(datei);
  }

  alle(): readonly Nachtrag[] {
    return this.wartend;
  }

  anzahl(): number {
    return this.wartend.length;
  }

  /**
   * Traegt ein - oder merkt sich den Eintrag fuer spaeter.
   *
   * Wirft nicht. Das ist der Sinn der Uebung: ein ausgefallener
   * Turnier-Server darf eine freigegebene Runde nicht kippen.
   */
  async trageEinOderMerke(
    gameId: string,
    e: Eintrag,
    absender?: string
  ): Promise<Eintragsergebnis> {

    // Warten schon welche, muss dieser sich hinten anstellen - Regel 2.
    if (this.wartend.length === 0) {
      try {
        await this.eintragen(gameId, e);
        return 'eingetragen';
      } catch (err) {
        this.anhaengen(gameId, e, absender, (err as Error).message);
        return 'gemerkt';
      }
    }

    this.anhaengen(gameId, e, absender, 'wartet hinter ' + this.wartend.length + ' anderen');
    return 'gemerkt';
  }

  private anhaengen(
    gameId: string,
    e: Eintrag,
    absender: string | undefined,
    grund: string
  ): void {
    this.wartend.push({
      id: 'n_' + randomBytes(6).toString('hex'),
      gameId,
      name: e.name,
      punkte: e.punkte,
      erstellt: Date.now(),
      ...(absender === undefined ? {} : { absender }),
      versuche: 1,
      letzterFehler: grund
    });
    this.speichern();
  }

  /**
   * Arbeitet die Warteschlange von vorne ab.
   *
   * Bricht beim ersten Fehler ab - siehe Regel 1 im Kopf. Der Rest bleibt
   * stehen und wird beim naechsten Anlauf erneut versucht.
   */
  async arbeiteAb(): Promise<Abarbeitung> {
    let erledigt = 0;

    while (this.wartend.length > 0) {
      const n = this.wartend[0]!;
      try {
        await this.eintragen(n.gameId, { name: n.name, punkte: n.punkte });
      } catch (err) {
        n.versuche++;
        n.letzterFehler = (err as Error).message;
        this.speichern();
        return { erledigt, offen: this.wartend.length, fehler: n.letzterFehler };
      }

      this.wartend.shift();
      erledigt++;
      this.speichern();
    }

    return { erledigt, offen: 0, fehler: null };
  }

  /** Wirft einen Nachtrag weg - fuer den Fall, dass er doch schon drin ist. */
  loesche(id: string): boolean {
    const vorher = this.wartend.length;
    this.wartend = this.wartend.filter((n) => n.id !== id);
    if (this.wartend.length === vorher) return false;
    this.speichern();
    return true;
  }

  private speichern(): void {
    const inhalt: NachtragDatei = { version: 1, wartend: this.wartend };
    try {
      mkdirSync(path.dirname(this.datei), { recursive: true });
      writeFileSync(this.datei, JSON.stringify(inhalt, null, 2), 'utf8');
    } catch (err) {
      console.log('  Nachtragsliste nicht schreibbar: ' + (err as Error).message);
    }
  }
}

export function ladeNachtrag(
  datei: string,
  eintragen: (gameId: string, e: Eintrag) => Promise<void>
): Nachtragliste {
  return new Nachtragliste(datei, eintragen);
}

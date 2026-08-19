/* =========================================================================
   KARTEI-SPIEGEL - damit mc-ranked ohne den Turnier-Server weiterarbeitet.

   Der Feeder braucht von turnier genau zwei Dinge, und beide stecken in
   GET /api/state:

     die KARTEI    ohne sie kann namen.ts keinen Namen zuordnen
     die gameId    ohne sie weiss niemand, in welche Liste eingetragen wird

   Bisher wurde beides bei JEDER Anfrage frisch geholt. War turnier nicht
   erreichbar, bekam der Zuschauer 502 - und seine Runde landete nicht
   einmal in der Warteschlange. Sie war weg, er musste nochmal F9
   druecken. Auf einem Server, der im Netz steht, waehrend turnier zu
   Hause laeuft, ist das der Normalfall und nicht die Ausnahme.

   Deshalb: jeder erfolgreiche Abruf wird gespiegelt. Faellt turnier aus,
   arbeitet der Server mit dem letzten bekannten Stand weiter.

   -------------------------------------------------------------------------
   ZWEI DINGE, DIE HIER ABSICHTLICH NICHT PASSIEREN:

   1) Nur bei NICHT ERREICHBAR wird gespiegelt gearbeitet.

      Sagt turnier "die Punkteliste gibt es nicht" (TurnierAbgelehnt), ist
      das kein Ausfall, sondern ein Einrichtungsfehler - falscher
      MC_SPIEL, Liste umbenannt, falscher Admin-Key. Den mit einem alten
      Spiegel zu ueberdecken waere das Schlimmste, was wir tun koennten:
      wir wuerden weiter in eine gameId eintragen, die es so nicht mehr
      gibt. Solche Fehler muessen sichtbar bleiben.

   2) Der Spiegel wird nie "aufgefrischt", ohne dass turnier antwortet.

      Er altert, und das ist richtig so. Ein Spieler, der seit dem letzten
      Abruf neu in der Kartei steht, fehlt darin - seine Zeile wird dann
      zur Rueckfrage statt zu einem Phantom-Eintrag. Im Zweifel nachfragen
      ist genau die Richtung, in die dieses Projekt durchgehend faellt.
   ========================================================================= */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import {
  TurnierNichtErreichbar,
  type TurnierZustand,
  type Spiel
} from './turnier-client.js';

export interface Zustand {
  readonly zustand: TurnierZustand;
  readonly spiel: Spiel;
}

/** Woher der Zustand kommt und wie es dem Turnier-Server geht. */
export interface Lage {
  /** Hat der letzte Versuch turnier erreicht? */
  readonly erreichbar: boolean;
  /** Wurde zuletzt aus dem Spiegel geantwortet? */
  readonly ausSpiegel: boolean;
  /** Wann der Spiegel zuletzt aufgefrischt wurde. null = nie. */
  readonly gespiegeltAm: number | null;
  /** Warum turnier nicht erreichbar war. null, wenn alles gut ist. */
  readonly letzterFehler: string | null;
}

interface SpiegelDatei {
  readonly version: 1;
  readonly gespiegeltAm: number;
  readonly zustand: TurnierZustand;
  readonly spiel: Spiel;
}

function lesen(datei: string): SpiegelDatei | null {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return null;
  }
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  try {
    const d = JSON.parse(roh) as SpiegelDatei;
    if (!d || !d.zustand || !d.spiel) return null;
    return d;
  } catch (err) {
    /* Zur Seite legen statt ueberschreiben - wie ueberall in diesem
       Projekt. Hier haengt zwar nichts Unersetzliches dran (der naechste
       erfolgreiche Abruf baut ihn neu), aber eine kaputte Datei will man
       ansehen koennen. */
    const kaputt = datei.replace(/\.json$/, '') + '.defekt-' + Date.now() + '.json';
    try {
      renameSync(datei, kaputt);
      console.log('  Kartei-Spiegel ist beschaedigt, liegt jetzt hier: ' + kaputt);
    } catch {
      console.log('  Kartei-Spiegel ist beschaedigt: ' + (err as Error).message);
    }
    return null;
  }
}

export class Karteispiegel {
  private stand: SpiegelDatei | null;
  private erreichbar = true;
  private ausSpiegel = false;
  private letzterFehler: string | null = null;
  /** Vor diesem Zeitpunkt wird turnier nicht wieder gefragt. */
  private naechsterVersuch = 0;

  constructor(
    private readonly datei: string,
    private readonly frisch: () => Promise<Zustand>,
    /**
     * Wie lange nach einem Fehlversuch Ruhe ist.
     *
     * Ohne diese Pause zahlt JEDER Upload das volle Zeitlimit, bevor er
     * die Antwort bekommt, die der Spiegel ohnehin schon hat. Bei acht
     * Sekunden und einem Zuschauer, der es dreimal probiert, sind das
     * fast anderthalb Minuten Warten fuer nichts.
     */
    private readonly pauseMs = 30000
  ) {
    this.stand = lesen(datei);
  }

  /**
   * Holt den Zustand - frisch, wenn turnier antwortet, sonst gespiegelt.
   *
   * Wirft nur dann, wenn es auch keinen Spiegel gibt. Ein Server, der
   * noch nie mit turnier gesprochen hat, kann nichts zuordnen und soll
   * das auch sagen, statt so zu tun als ginge es.
   */
  async holen(): Promise<Zustand> {
    /* Kurz nach einem Fehlversuch gar nicht erst fragen - siehe pauseMs.
       Nur mit Spiegel: ohne Stand muss jeder Versuch zaehlen, sonst
       bliebe der Server nach einem einzigen Fehlschlag eine halbe Minute
       lang blind. */
    if (this.stand !== null && Date.now() < this.naechsterVersuch) {
      this.ausSpiegel = true;
      return { zustand: this.stand.zustand, spiel: this.stand.spiel };
    }

    try {
      const frisch = await this.frisch();
      this.erreichbar = true;
      this.ausSpiegel = false;
      this.letzterFehler = null;
      this.naechsterVersuch = 0;
      this.merke(frisch);
      return frisch;
    } catch (err) {
      // Einrichtungsfehler nicht verstecken - siehe Kopf, Punkt 1.
      if (!(err instanceof TurnierNichtErreichbar)) {
        this.erreichbar = true;
        this.ausSpiegel = false;
        this.letzterFehler = (err as Error).message;
        throw err;
      }

      this.erreichbar = false;
      this.letzterFehler = (err as Error).message;
      this.naechsterVersuch = Date.now() + this.pauseMs;

      if (this.stand === null) {
        this.ausSpiegel = false;
        throw err;
      }

      this.ausSpiegel = true;
      return { zustand: this.stand.zustand, spiel: this.stand.spiel };
    }
  }

  /** Schreibt den Spiegel - aber nur, wenn sich etwas geaendert hat. */
  private merke(neu: Zustand): void {
    const inhalt: SpiegelDatei = {
      version: 1,
      gespiegeltAm: Date.now(),
      zustand: neu.zustand,
      spiel: neu.spiel
    };

    /* Bei jedem Upload zu schreiben waere Unfug - die Kartei aendert sich
       selten, die Datei aber staendig. Verglichen wird ohne Zeitstempel,
       sonst waere jeder Vergleich verschieden. */
    if (this.stand !== null && gleich(this.stand, inhalt)) {
      this.stand = { ...this.stand, zustand: neu.zustand, spiel: neu.spiel };
      return;
    }

    this.stand = inhalt;
    try {
      mkdirSync(path.dirname(this.datei), { recursive: true });
      writeFileSync(this.datei, JSON.stringify(inhalt, null, 2), 'utf8');
    } catch (err) {
      // Ein nicht schreibbarer Spiegel darf keine Runde kippen.
      console.log('  Kartei-Spiegel nicht schreibbar: ' + (err as Error).message);
    }
  }

  lage(): Lage {
    return {
      erreichbar: this.erreichbar,
      ausSpiegel: this.ausSpiegel,
      gespiegeltAm: this.stand?.gespiegeltAm ?? null,
      letzterFehler: this.letzterFehler
    };
  }

  /** Gibt es ueberhaupt etwas zum Zurueckfallen? */
  hatStand(): boolean {
    return this.stand !== null;
  }
}

function gleich(a: SpiegelDatei, b: SpiegelDatei): boolean {
  return JSON.stringify({ z: a.zustand, s: a.spiel }) ===
         JSON.stringify({ z: b.zustand, s: b.spiel });
}

export function ladeSpiegel(
  datei: string,
  frisch: () => Promise<Zustand>,
  pauseMs?: number
): Karteispiegel {
  return pauseMs === undefined
    ? new Karteispiegel(datei, frisch)
    : new Karteispiegel(datei, frisch, pauseMs);
}

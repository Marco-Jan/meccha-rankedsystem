/* =========================================================================
   TOKENS - wer darf Runden schicken.

   Jeder Zuschauer bekommt einen eigenen Token. Das ist kein Schutz gegen
   Faelschung - ein bearbeiteter Screenshot bleibt ein bearbeiteter
   Screenshot - sondern es beantwortet die Frage WER etwas geschickt hat.
   Ohne das waere eine Ablehnung wirkungslos: derselbe Mensch schickt es
   einfach nochmal, und niemand kann ihn davon abhalten.

   ZWEI Fragen, die frueher faelschlich in einem Schalter steckten:

     vertraut       Wieviel zaehlt? true = die ganze Lobby (eigene
                    Rechner), false = nur die eigene Zeile.

     ohneFreigabe   Wird geprueft? true = geht direkt in die Punkteliste,
                    false = landet in der Freigabeliste.

   Die Kombination "nur eigene Zeile, aber ohne Freigabe" ist der Fall,
   den es vorher nicht gab: ein Zuschauer, dem man vertraut, soll nicht
   die ganze Lobby einreichen duerfen - aber man will auch nicht bei jeder
   seiner Runden klicken muessen.

   Der Token steht im Klartext in der Datei. Das ist bewusst so: er ist
   kein Passwort zu einem Konto, sondern eine Kennung fuer eine
   Einreichung, und du musst ihn Leuten vorlesen oder schicken koennen.
   Wer ihn missbraucht, wird gesperrt - deshalb ist "wer war es"
   wichtiger als "unknackbar".
   ========================================================================= */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

export interface Token {
  readonly token: string;
  /** Wem er gehoert - taucht in der Freigabeliste als Absender auf. */
  readonly name: string;
  /**
   * Wie die Person IM SPIEL heisst. Nur diese eine Zeile aus dem
   * eingeschickten Scoreboard wird gewertet.
   *
   * Ohne das wuerde ein Zuschauer die Punkte aller Mitspieler
   * einreichen - und saessen zwei aus derselben Lobby am Client,
   * bekaeme jeder alles doppelt.
   *
   * Bei vertrauten Tokens (eigene Rechner) leer: dort wird die ganze
   * Lobby erfasst, das ist ja der Sinn des einen Tastendrucks.
   */
  readonly ingameName?: string;
  /**
   * true = die GANZE Lobby wird gewertet. Nur fuer eigene Rechner.
   *
   * Bei false zaehlt ausschliesslich die Zeile mit dem ingameName.
   */
  readonly vertraut: boolean;
  /**
   * true = keine Freigabe noetig, geht direkt in die Punkteliste.
   *
   * Unabhaengig von vertraut: ein Zuschauer kann durchaus ohne Freigabe
   * laufen und trotzdem nur seine eigene Zeile einbringen. Bei vertrauten
   * Tokens ist es implizit immer true - ein eigener Rechner, den man
   * selbst freigeben muesste, waere unsinnig.
   */
  ohneFreigabe?: boolean;
  readonly angelegt: number;
  letzteNutzung?: number;
  /** Gesperrte Tokens werden abgewiesen, bleiben aber als Spur erhalten. */
  gesperrt?: boolean;
  sperrgrund?: string;
}

interface TokenDatei {
  readonly version: 1;
  readonly tokens: Token[];
}

/** Mindestabstand zwischen zwei Einreichungen desselben Tokens. */
export const MINDESTABSTAND_MS = 5000;

function lesen(datei: string): Token[] {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return [];
  }
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  try {
    const daten = JSON.parse(roh) as TokenDatei;
    return Array.isArray(daten.tokens) ? daten.tokens : [];
  } catch (err) {
    // Zur Seite legen statt ueberschreiben - hier haengen Zugaenge dran.
    const kaputt = datei.replace(/\.json$/, '') + '.defekt-' + Date.now() + '.json';
    try {
      renameSync(datei, kaputt);
      console.error('[mc-ranked] tokens.json ist beschaedigt, liegt jetzt hier: ' + kaputt);
    } catch {
      console.error('[mc-ranked] tokens.json ist beschaedigt:', (err as Error).message);
    }
    return [];
  }
}

export type PruefErgebnis =
  | { readonly ok: true; readonly token: Token }
  | { readonly ok: false; readonly grund: string; readonly code: 401 | 429 };

export class Tokenliste {
  private tokens: Token[];
  private gelesenAm = 0;

  constructor(private readonly datei: string) {
    this.tokens = lesen(datei);
    this.gelesenAm = this.dateiZeit();
  }

  private dateiZeit(): number {
    try {
      return statSync(this.datei).mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * Liest die Datei neu ein, wenn sie sich geaendert hat.
   *
   * Noetig, weil Tokens mit  npm run token  in einem ANDEREN Prozess
   * angelegt werden, waehrend der Server laeuft. Ohne das wuerde ein
   * frisch vergebener Token als unbekannt abgewiesen, bis jemand den
   * Server neu startet - und genau das passiert staendig, weil man
   * Zuschauern im laufenden Betrieb Zugaenge gibt.
   */
  private aktualisieren(): void {
    const zeit = this.dateiZeit();
    if (zeit === 0 || zeit === this.gelesenAm) return;
    this.tokens = lesen(this.datei);
    this.gelesenAm = zeit;
  }

  speichern(): void {
    mkdirSync(path.dirname(this.datei), { recursive: true });
    const inhalt: TokenDatei = { version: 1, tokens: this.tokens };
    writeFileSync(this.datei, JSON.stringify(inhalt, null, 2), 'utf8');
    // Eigenen Schreibvorgang vormerken, sonst liest aktualisieren()
    // gleich wieder die Datei und wirft unsere Aenderung im Speicher weg.
    this.gelesenAm = this.dateiZeit();
  }

  alle(): readonly Token[] {
    this.aktualisieren();
    return this.tokens;
  }

  /** Legt einen neuen Token an und gibt ihn zurueck. */
  anlegen(name: string, vertraut = false, ingameName?: string, ohneFreigabe = false): Token {
    const sauber = String(name ?? '').trim();
    if (!sauber) throw new Error('Ein Token braucht einen Namen');

    const ingame = String(ingameName ?? '').trim();
    /*
       Ein Zuschauer-Token OHNE Ingame-Namen waere nutzlos: der Server
       wuesste nicht, welche Zeile er werten soll. Lieber hier scheitern
       als spaeter stillschweigend nichts eintragen.
    */
    if (!vertraut && !ingame) {
      throw new Error('Ein Zuschauer-Token braucht den Ingame-Namen (--ingame)');
    }

    const token: Token = {
      // 24 Byte -> 32 Zeichen base64url. Lang genug, dass Raten sinnlos
      // ist, kurz genug zum Vorlesen.
      token: randomBytes(24).toString('base64url'),
      name: sauber,
      vertraut,
      angelegt: Date.now(),
      ...(ohneFreigabe ? { ohneFreigabe: true } : {}),
      ...(ingame ? { ingameName: ingame } : {})
    };
    this.tokens.push(token);
    this.speichern();
    return token;
  }

  /**
   * Aendert einen bestehenden Token.
   *
   * Gebraucht von der Kontenverwaltung: aendert jemand seinen
   * Ingame-Namen, muss der Token mitziehen - er entscheidet beim Upload,
   * welche Zeile gewertet wird. Der Token selbst bleibt dabei gleich,
   * damit niemand seine client.json neu ausfuellen muss.
   */
  aktualisiere(
    token: string,
    aenderung: { name?: string; ingameName?: string; ohneFreigabe?: boolean }
  ): boolean {
    this.aktualisieren();
    const t = this.tokens.find((x) => x.token === token);
    if (!t) return false;

    // name und ingameName sind readonly - deshalb ueber ein neues Objekt.
    const neu: Token = {
      ...t,
      ...(aenderung.name !== undefined ? { name: aenderung.name } : {}),
      ...(aenderung.ingameName !== undefined ? { ingameName: aenderung.ingameName } : {})
    };
    if (aenderung.ohneFreigabe !== undefined) neu.ohneFreigabe = aenderung.ohneFreigabe;

    this.tokens[this.tokens.indexOf(t)] = neu;
    this.speichern();
    return true;
  }

  /**
   * Hebt eine Sperre wieder auf.
   *
   * Gegenstueck zu sperren(): ein geloeschtes Konto laesst sich
   * wiederherstellen, und dann muss auch sein Zugang zurueckkommen.
   * Ohne das waere jedes Loeschen endgueltig, obwohl es weich sein soll.
   */
  entsperren(token: string): boolean {
    const t = this.tokens.find((x) => x.token === token);
    if (!t) return false;
    delete t.gesperrt;
    delete t.sperrgrund;
    this.speichern();
    return true;
  }

  sperren(token: string, grund: string): boolean {
    const t = this.tokens.find((x) => x.token === token);
    if (!t) return false;
    t.gesperrt = true;
    t.sperrgrund = grund;
    this.speichern();
    return true;
  }

  /**
   * Prueft einen Token und merkt die Nutzung vor.
   *
   * Der Vergleich laeuft ueber timingSafeEqual: ein normaler
   * Zeichenvergleich bricht beim ersten Unterschied ab, und aus den
   * Laufzeitunterschieden liesse sich ein Token Zeichen fuer Zeichen
   * erraten. Unwahrscheinlich hier, aber es kostet nichts.
   */
  /**
   * Sucht einen Token, OHNE etwas zu veraendern.
   *
   * Getrennt von pruefen(), weil das dort den Zeitstempel der letzten
   * Nutzung setzt und den Mindestabstand durchsetzt. Fuer eine reine
   * Auskunft - "wer bin ich?" - waere beides falsch: die Frage wuerde
   * das eigene Zeitfenster verbrauchen.
   */
  finde(eingabe: unknown): Token | null {
    this.aktualisieren();
    if (typeof eingabe !== 'string' || eingabe.length === 0) return null;

    const kandidat = Buffer.from(eingabe);
    return this.tokens.find((t) => {
      const bekannt = Buffer.from(t.token);
      if (bekannt.length !== kandidat.length) return false;
      return timingSafeEqual(bekannt, kandidat);
    }) ?? null;
  }

  pruefen(eingabe: unknown, jetzt = Date.now()): PruefErgebnis {
    if (typeof eingabe !== 'string' || eingabe.length === 0) {
      return { ok: false, grund: 'Kein Token mitgeschickt', code: 401 };
    }

    const treffer = this.finde(eingabe);

    if (!treffer) return { ok: false, grund: 'Token unbekannt', code: 401 };
    if (treffer.gesperrt) {
      return { ok: false, grund: 'Token gesperrt: ' + (treffer.sperrgrund ?? 'ohne Angabe'), code: 401 };
    }

    /*
       Mindestabstand: ohne den koennte jemand hundert Runden pro Sekunde
       schicken und die Freigabeliste unbenutzbar machen. Betrifft
       vertraute Tokens nicht - deine eigenen Rechner sollen nicht
       ausgebremst werden, wenn du zweimal kurz hintereinander drueckst.
    */
    if (!treffer.vertraut && treffer.letzteNutzung !== undefined) {
      const abstand = jetzt - treffer.letzteNutzung;
      if (abstand < MINDESTABSTAND_MS) {
        const rest = Math.ceil((MINDESTABSTAND_MS - abstand) / 1000);
        return { ok: false, grund: 'Zu schnell - bitte ' + rest + ' Sekunden warten', code: 429 };
      }
    }

    treffer.letzteNutzung = jetzt;
    this.speichern();
    return { ok: true, token: treffer };
  }
}

export function ladeTokens(datei: string): Tokenliste {
  return new Tokenliste(datei);
}

/**
 * Braucht dieser Token eine Freigabe?
 *
 * An einer Stelle, damit Server und Anzeige nicht auseinanderlaufen.
 * Ein vertrauter Token (eigener Rechner) nie - sich selbst freizugeben
 * waere sinnlos.
 */
export function brauchtFreigabe(token: Token): boolean {
  if (token.vertraut) return false;
  return token.ohneFreigabe !== true;
}

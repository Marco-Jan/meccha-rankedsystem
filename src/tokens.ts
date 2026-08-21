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
  /**
   * Bis wann dieser Zugang gesperrt ist.
   *
   * Steht hier statt "letzteNutzung plus fester Abstand", weil der
   * Abstand nicht mehr fest ist: er haengt davon ab, was aus der letzten
   * Einreichung wurde. Ihn jedes Mal neu auszurechnen hiesse, sich
   * merken zu muessen, WIE die letzte ausging - der Zeitpunkt selbst ist
   * die einfachere Auskunft.
   */
  sperreBis?: number;
  /** Gesperrte Tokens werden abgewiesen, bleiben aber als Spur erhalten. */
  gesperrt?: boolean;
  sperrgrund?: string;
  /**
   * Welche Fassung des Clients sich zuletzt gemeldet hat.
   *
   * Der Client sagt es bei jeder Anfrage mit. Damit kann die Kontoseite
   * "du hast 0.6.0, aktuell ist 0.7.0" schreiben, statt nur die neueste
   * Nummer hinzustellen und den Vergleich dem Nutzer zu ueberlassen.
   *
   * Fehlt der Wert, ist der Client aelter als 0.7.0 - vorher wurde die
   * Fassung nicht mitgeschickt. Das ist selbst eine Auskunft: dann ist
   * er auf jeden Fall veraltet.
   */
  clientVersion?: string;
  /** Seit wann sich genau diese Fassung meldet. */
  clientSeit?: number;
  /**
   * Die letzte Einreichung laesst sich kurz zurueckholen.
   *
   * Der Absender sieht erst NACH dem Absenden, was der Leser aus seinem
   * Bild gemacht hat. Stimmt es nicht, half bisher nur warten: drei
   * Minuten, und die Lobby ist weiter. Ein kurzes Fenster loest das,
   * ohne die Sperre aufzuweichen - danach gelten die drei Minuten
   * wieder.
   */
  ruecknahme?: {
    /** Die Runde in der Freigabeliste. */
    readonly rundeId: string;
    /** Bis wann. */
    readonly bis: number;
    /** Ranglisten-Eintraege, falls sie direkt gewertet wurde. */
    readonly eintraege: readonly string[];
    /** Kennung der Partie - fuer die Regel "einmal je Partie". */
    readonly kennung?: string;
  };
  /**
   * Partien, die diese Person schon einmal zurueckgeholt hat.
   *
   * DIE Regel gegen den Missbrauch. Ohne sie koennte jemand dieselbe
   * Runde immer wieder einschicken und zurueckholen, bis die
   * Zeichenerkennung ihm einmal eine hoehere Zahl liest - eine
   * Wuerfelbude, bei der nur die guten Wuerfe stehen bleiben.
   *
   * Einmal je Partie ist genug: der ehrliche Fall ist ein Lesefehler,
   * und den sieht man beim ersten Mal.
   *
   * Mit Zeitpunkt, damit auffaellt, wer es HAEUFIG tut. Einmal ist ein
   * Lesefehler, dreimal an einem Tag ist ein Muster.
   */
  zurueckgeholt?: Array<{ readonly kennung: string; readonly ts: number }>;
}

interface TokenDatei {
  readonly version: 1;
  readonly tokens: Token[];
}

/* =========================================================================
   ABSTAND ZWISCHEN ZWEI EINREICHUNGEN

   Zwei Werte, nicht einer - und der Unterschied ist Absicht.

   Nach einer ANGENOMMENEN Runde gibt es nichts mehr einzureichen: die
   Runde laeuft, das Ergebnis steht, und die naechste Partie dauert
   ohnehin laenger als drei Minuten. Ein ehrlicher Spieler merkt diese
   Sperre nie.

   Ein FEHLSCHLAG ist dagegen meistens nicht die Schuld des Absenders:
   die Rangliste war nicht ganz im Bild, der Untergrund war zu bunt, der
   Moment war schlecht erwischt. Wer dafuer drei Minuten wartet, verliert
   seine Runde - bis er wieder darf, ist die Lobby weiter. Deshalb hier
   nur dreissig Sekunden: neu einblenden, nochmal druecken, passt.
   ========================================================================= */

/** Nach einer angenommenen Runde. */
export const ABSTAND_ANGENOMMEN_MS = Number(process.env.MC_ABSTAND_ANGENOMMEN || 3 * 60 * 1000);

/** Nach allem anderen - unlesbares Bild, zu kleine Lobby, Dublette. */
export const ABSTAND_FEHLSCHLAG_MS = Number(process.env.MC_ABSTAND_FEHLSCHLAG || 30 * 1000);

/**
 * Wie lange sich eine Einreichung zurueckholen laesst.
 *
 * Kurz genug, dass niemand in Ruhe ueberlegt, ob ihm das Ergebnis
 * gefaellt - lang genug, um die gelesene Zeile anzusehen und zu
 * erkennen, dass da Unsinn steht. Die Frist laeuft ab der ANTWORT, nicht
 * ab dem Tastendruck.
 */
export const RUECKNAHME_MS = Number(process.env.MC_RUECKNAHME || 15 * 1000);

/**
 * Ab so vielen Ruecknahmen im Rueckschaufenster wird es auffaellig.
 *
 * Einmal ist ein Lesefehler - die passieren, dafuer gibt es die
 * Ruecknahme ueberhaupt. Dreimal an einem Tag ist etwas anderes: dann
 * sucht jemand nach dem Ergebnis, das ihm passt.
 */
export const RUECKNAHME_HAEUFIG = Number(process.env.MC_RUECKNAHME_HAEUFIG || 3);

/** Wie weit dabei zurueckgeschaut wird. */
export const RUECKNAHME_FENSTER_MS =
  Number(process.env.MC_RUECKNAHME_FENSTER || 24 * 60 * 60 * 1000);

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
   * Noetig, weil Tokens aus einem ANDEREN Prozess
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

  /**
   * Prueft einen Token und setzt sofort den KURZEN Abstand.
   *
   * Warum sofort und nicht erst am Ende: das Lesen eines Bildes dauert
   * ein paar Sekunden. Wuerde erst danach gestempelt, staende in dieser
   * Zeit gar keine Sperre - wer zehn Uploads gleichzeitig abschickt,
   * kaeme mit allen zehn durch die Pruefung, bevor der erste fertig ist.
   *
   * Kommt die Runde durch, hebt angenommen() den Abstand anschliessend
   * auf den langen Wert. Kommt sie nicht durch, bleibt es bei dreissig
   * Sekunden - genau richtig, denn dann soll es der Absender gleich
   * nochmal versuchen duerfen.
   *
   * ohneAbstand befreit von der Sperre. Gedacht fuer Admins, die beim
   * Einrichten und Pruefen nicht auf sich selbst warten sollen - die
   * Entscheidung, WER das ist, faellt beim Aufrufer: Tokens kennen keine
   * Rollen.
   */
  pruefen(eingabe: unknown, jetzt = Date.now(), ohneAbstand = false): PruefErgebnis {
    if (typeof eingabe !== 'string' || eingabe.length === 0) {
      return { ok: false, grund: 'Kein Token mitgeschickt', code: 401 };
    }

    const treffer = this.finde(eingabe);

    if (!treffer) return { ok: false, grund: 'Token unbekannt', code: 401 };
    if (treffer.gesperrt) {
      return { ok: false, grund: 'Token gesperrt: ' + (treffer.sperrgrund ?? 'ohne Angabe'), code: 401 };
    }

    if (!ohneAbstand && treffer.sperreBis !== undefined && jetzt < treffer.sperreBis) {
      const rest = Math.ceil((treffer.sperreBis - jetzt) / 1000);
      return {
        ok: false,
        grund: rest > 60
          ? 'Zu schnell - noch ' + Math.ceil(rest / 60) + ' Minute(n) warten'
          : 'Zu schnell - noch ' + rest + ' Sekunden warten',
        code: 429
      };
    }

    treffer.letzteNutzung = jetzt;
    treffer.sperreBis = jetzt + ABSTAND_FEHLSCHLAG_MS;
    this.speichern();
    return { ok: true, token: treffer };
  }

  /**
   * Die Runde kam durch - jetzt gilt der lange Abstand.
   *
   * Absichtlich getrennt von pruefen(): zum Pruefzeitpunkt weiss noch
   * niemand, ob das Bild etwas taugt.
   *
   * "Durchgekommen" heisst hier: in der Freigabeliste gelandet oder
   * direkt gewertet - NICHT "von dir freigegeben". Deine Entscheidung
   * faellt Minuten spaeter; bis dahin kann kein Abstand warten.
   */
  angenommen(token: string, jetzt = Date.now()): void {
    const treffer = this.finde(token);
    if (!treffer) return;
    treffer.sperreBis = jetzt + ABSTAND_ANGENOMMEN_MS;
    this.speichern();
  }

  /**
   * Merkt sich, was gerade zurueckgeholt werden koennte.
   *
   * Die Frist beginnt JETZT, also wenn der Absender die Antwort
   * bekommt - nicht, als er gedrueckt hat. Das Lesen dauert ein paar
   * Sekunden, und die sollen ihm nicht von seiner Bedenkzeit abgehen.
   */
  merkeRuecknahme(
    token: string,
    rundeId: string,
    eintraege: readonly string[],
    kennung: string | undefined,
    jetzt = Date.now()
  ): void {
    const treffer = this.finde(token);
    if (!treffer) return;

    // Schon einmal zurueckgeholt: kein zweites Mal fuer dieselbe Partie.
    if (kennung && (treffer.zurueckgeholt ?? []).some((z) => z.kennung === kennung)) {
      delete treffer.ruecknahme;
      this.speichern();
      return;
    }

    treffer.ruecknahme = {
      rundeId,
      bis: jetzt + RUECKNAHME_MS,
      eintraege: [...eintraege],
      ...(kennung ? { kennung } : {})
    };
    this.speichern();
  }

  /**
   * Darf jetzt zurueckgeholt werden? Gibt zurueck, WAS - oder warum nicht.
   *
   * Die Pruefung und das Aufraeumen stecken zusammen hier, damit es
   * keinen Zustand gibt, in dem etwas geprueft, aber nicht verbraucht
   * wurde. Ein zweiter Klick soll ins Leere gehen, nicht ein zweites Mal
   * wirken.
   */
  holeZurueck(token: string, jetzt = Date.now()):
    | { ok: true; rundeId: string; eintraege: readonly string[] }
    | { ok: false; grund: 'nichts' | 'zu-spaet' } {
    const treffer = this.finde(token);
    const r = treffer?.ruecknahme;
    if (!treffer || !r) return { ok: false, grund: 'nichts' };

    if (jetzt > r.bis) {
      delete treffer.ruecknahme;
      this.speichern();
      return { ok: false, grund: 'zu-spaet' };
    }

    if (r.kennung) {
      treffer.zurueckgeholt =
        [...(treffer.zurueckgeholt ?? []), { kennung: r.kennung, ts: jetzt }].slice(-50);
    }
    delete treffer.ruecknahme;

    /* Sofort wieder frei: der Zweck der Ruecknahme ist der zweite
       Versuch, und der ist nach drei Minuten sinnlos. */
    treffer.sperreBis = jetzt;
    this.speichern();

    return { ok: true, rundeId: r.rundeId, eintraege: r.eintraege };
  }

  /**
   * Wie oft hat diese Person zuletzt zurueckgeholt?
   *
   * Der Server haengt das Ergebnis als Auffaelligkeit an die naechste
   * Runde. Nicht als Sperre: wer haeufig zurueckholt, kann auch nur
   * einen schlechten Bildschirm haben. Aber dann sieht ein Mensch drauf
   * und das Bild bleibt liegen, statt dass es lautlos durchgeht.
   */
  ruecknahmenZuletzt(token: string, jetzt = Date.now()): number {
    const treffer = this.finde(token);
    if (!treffer) return 0;
    const grenze = jetzt - RUECKNAHME_FENSTER_MS;
    return (treffer.zurueckgeholt ?? []).filter((z) => z.ts > grenze).length;
  }

  /**
   * Haelt fest, mit welcher Client-Fassung dieser Token gerade kommt.
   *
   * Wird bei jeder Anfrage aufgerufen und schreibt deshalb nur, wenn
   * sich wirklich etwas geaendert hat - sonst stuende die Datei bei
   * einem laufenden Client alle paar Sekunden neu auf der Platte.
   */
  merkeClient(token: string, version: unknown, jetzt = Date.now()): void {
    if (typeof version !== 'string') return;
    const sauber = version.trim().slice(0, 20);
    if (!/^\d+\.\d+\.\d+$/.test(sauber)) return;

    const treffer = this.finde(token);
    if (!treffer || treffer.clientVersion === sauber) return;

    treffer.clientVersion = sauber;
    treffer.clientSeit = jetzt;
    this.speichern();
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

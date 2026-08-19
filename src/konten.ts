/* =========================================================================
   KONTEN - Zuschauer melden sich selbst an.

   Vorher musste der Streamer jeden Zugang von Hand anlegen. Bei ein paar
   Leuten geht das, bei vielen nicht mehr.

   Angemeldet wird ueber STEAM. Kein Passwort, keine Mailadresse, kein
   Bestaetigungsversand.

   Der Grund ist einfach: Meccha Chameleon laeuft ueber Steam, jeder
   Mitspieler hat also zwangslaeufig ein Konto. Und Steams OpenID braucht
   weder Registrierung noch Schluessel - siehe steam.ts. Damit entfaellt
   der ganze Mailversand samt externem Dienst, DNS-Eintraegen und
   Spam-Sorgen.

   Nebeneffekt: eine SteamID pro Konto heisst, dass Doppelanmeldungen
   praktisch ausgeschlossen sind.

   -------------------------------------------------------------------------
   ZWEI NAMEN, die man nicht verwechseln darf:

     benutzername   frei aenderbar. Nur Anzeige - steht im Dashboard als
                    Absender einer Runde.

     ingameName     entscheidet, WELCHE ZEILE aus dem Scoreboard gewertet
                    wird. Deshalb streng geschuetzt:

                      - eindeutig ueber alle Konten. Wer sich zuerst
                        anmeldet, dem gehoert der Name. Das ist die
                        eigentliche Sperre gegen "ich nehme den Namen des
                        Erstplatzierten".

                      - nur alle 30 Tage aenderbar, damit niemand den
                        Namen je nach Punktestand wechselt.

                      - jede Aenderung durch den Nutzer setzt den Zugang
                        zurueck auf "braucht Freigabe". Beim naechsten
                        Upload sieht der Streamer Bild und beanspruchte
                        Zeile nebeneinander, und ein fremder Name faellt
                        auf.

                      - der Streamer selbst ist an keine Frist gebunden.
                        Aendert sich ein Name wirklich zweimal kurz
                        hintereinander, macht er es von Hand.
   ========================================================================= */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

import { Tokenliste, type Token } from './tokens.js';

/** Wie lange eine Sitzung ohne Nutzung gilt. */
export const SITZUNG_GUELTIG_MS = 30 * 24 * 60 * 60 * 1000;

/** Wie lange ein Nutzer nach einer Namensaenderung warten muss. */
export const NAMENSSPERRE_TAGE = Number(process.env.MC_NAMENSSPERRE_TAGE || 30);

/**
 * Muss ein NEUES Konto erst freigegeben werden?
 *
 * Frueher ja, ausnahmslos - damals war dein Klick der einzige Schutz.
 * Inzwischen haelt der Server jede Runde von sich aus an, die auffaellt
 * (verdacht.ts, bildpruefung.ts, inhaltsgleiche Zeilen). Jede erste
 * Runde eines jeden Zuschauers von Hand durchzuwinken hiesse, bei
 * fuenfzig Leuten fuenfzig Mal zu klicken, ohne dass dabei mehr
 * herauskaeme als bei den drei Pruefungen.
 *
 * Wer es streng will, setzt MC_NEUE_BRAUCHEN_FREIGABE=1 - dann ist es
 * wie vorher.
 *
 * Unberuehrt davon bleibt die Rueckstufung: aendert jemand SPAETER
 * seinen Ingame-Namen, braucht er wieder eine Freigabe. Das ist der
 * Moment, in dem eine fremde Zeile beansprucht werden koennte.
 */
export const NEUE_BRAUCHEN_FREIGABE = process.env.MC_NEUE_BRAUCHEN_FREIGABE === '1';

export interface Konto {
  readonly id: string;
  /** SteamID64 - 17 Ziffern, eindeutig und unveraenderlich. */
  readonly steamId: string;
  benutzername: string;
  ingameName: string;
  readonly angelegt: number;
  /** Der Upload-Token. Liegt in der Tokenliste, hier nur die Kennung. */
  token: string;
  letzteNamensaenderung?: number;
  letzteAnmeldung?: number;
  /**
   * Wann das Konto geloescht wurde. Fehlt es, ist das Konto aktiv.
   *
   * WEICH geloescht, nie entfernt: an einem Konto haengt die Historie
   * der Einreichungen, und die soll man in einem halben Jahr noch
   * nachvollziehen koennen ("wer hat das damals eingeschickt?").
   * Ausserdem bleibt der Ingame-Name belegt - sonst koennte ihn jemand
   * uebernehmen und die alten Runden waeren ploetzlich seine.
   */
  geloescht?: number;
}

/**
 * Eine offene Sitzung.
 *
 * Steam beweist einmalig, wer jemand ist. Damit der Nutzer nicht bei
 * jedem Klick neu zu Steam geschickt wird, merken wir uns das hier und
 * geben ihm die Kennung als Cookie mit.
 */
interface Sitzung {
  readonly code: string;
  readonly kontoId: string;
  readonly erstellt: number;
  letzteNutzung: number;
}

interface KontenDatei {
  readonly version: 1;
  readonly konten: Konto[];
  readonly sitzungen: Sitzung[];
}

/* ------------------------------------------------------------------ Namen */

/** Ist das eine plausible SteamID64? */
export function istSteamId(id: string): boolean {
  return /^\d{17}$/.test(String(id ?? '').trim());
}

/** Vergleichsform eines Ingame-Namens - wie nameKey in namen.ts. */
export function ingameSchluessel(name: string): string {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------------ Laden */

function lesen(datei: string): { konten: Konto[]; sitzungen: Sitzung[] } {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return { konten: [], sitzungen: [] };
  }
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  try {
    const d = JSON.parse(roh) as KontenDatei;
    return {
      konten: Array.isArray(d.konten) ? d.konten : [],
      sitzungen: Array.isArray(d.sitzungen) ? d.sitzungen : []
    };
  } catch (err) {
    // Zur Seite legen statt ueberschreiben - hier haengen Zugaenge dran.
    const kaputt = datei.replace(/\.json$/, '') + '.defekt-' + Date.now() + '.json';
    try {
      renameSync(datei, kaputt);
      console.error('[mc-ranked] konten.json ist beschaedigt, liegt jetzt hier: ' + kaputt);
    } catch {
      console.error('[mc-ranked] konten.json ist beschaedigt:', (err as Error).message);
    }
    return { konten: [], sitzungen: [] };
  }
}

export type Ergebnis<T> =
  | { readonly ok: true; readonly wert: T }
  | { readonly ok: false; readonly fehler: string };

/* ------------------------------------------------------------- Verwaltung */

export class Kontenliste {
  private konten: Konto[];
  private sitzungen: Sitzung[];
  private gelesenAm = 0;

  constructor(
    private readonly datei: string,
    private readonly tokens: Tokenliste
  ) {
    const d = lesen(datei);
    this.konten = d.konten;
    this.sitzungen = d.sitzungen;
    this.gelesenAm = this.dateiZeit();
  }

  private dateiZeit(): number {
    try { return statSync(this.datei).mtimeMs; } catch { return 0; }
  }

  /**
   * Neu einlesen, wenn die Datei sich geaendert hat.
   *
   * Noetig aus demselben Grund wie bei den Tokens: Aenderungen koennen
   * aus einem anderen Prozess kommen, waehrend der Server laeuft.
   */
  private aktualisieren(): void {
    const zeit = this.dateiZeit();
    if (zeit === 0 || zeit === this.gelesenAm) return;
    const d = lesen(this.datei);
    this.konten = d.konten;
    this.sitzungen = d.sitzungen;
    this.gelesenAm = zeit;
  }

  speichern(): void {
    mkdirSync(path.dirname(this.datei), { recursive: true });
    const inhalt: KontenDatei = {
      version: 1, konten: this.konten, sitzungen: this.sitzungen
    };
    writeFileSync(this.datei, JSON.stringify(inhalt, null, 2), 'utf8');
    this.gelesenAm = this.dateiZeit();
  }

  alle(): readonly Konto[] {
    this.aktualisieren();
    return this.konten;
  }

  /** Nur die nicht geloeschten. */
  aktive(): readonly Konto[] {
    this.aktualisieren();
    return this.konten.filter((k) => k.geloescht === undefined);
  }

  /* ---------------------------------------------------------- Loeschen

     Loeschen raeumt auf, Sperren haelt draussen - zwei verschiedene
     Dinge, die man nicht verwechseln sollte:

       loeschen()  das Konto verschwindet aus der Liste, der Zugang gilt
                   nicht mehr. Meldet sich die Person erneut ueber Steam
                   an, ist sie wieder da. Fuer Karteileichen.

       sperren()   der Zugang bleibt gesperrt, auch nach erneuter
                   Anmeldung. Fuer Leute, die betrogen haben.
  */

  loeschen(id: string, jetzt = Date.now()): Ergebnis<Konto> {
    const konto = this.findeNachId(id);
    if (!konto) return { ok: false, fehler: 'Konto nicht gefunden.' };

    konto.geloescht = jetzt;

    /* Der Zugang muss mit - sonst laedt der Client munter weiter hoch.

       Eine SCHON bestehende Sperre bleibt aber unangetastet: wuerde hier
       "Konto geloescht" darueber geschrieben, saehe das Zurueckholen
       spaeter eine gewoehnliche Loeschsperre und liesse jemanden frei,
       der wegen bearbeiteter Screenshots draussen war. */
    if (konto.token) {
      const t = this.tokens.alle().find((x) => x.token === konto.token);
      if (t && t.gesperrt !== true) this.tokens.sperren(konto.token, 'Konto geloescht');
    }

    // Offene Sitzungen beenden, damit die Kontoseite nicht weiterlaeuft.
    this.sitzungen = this.sitzungen.filter((s) => s.kontoId !== konto.id);
    this.speichern();
    return { ok: true, wert: konto };
  }

  wiederherstellen(id: string): Ergebnis<Konto> {
    const konto = this.findeNachId(id);
    if (!konto) return { ok: false, fehler: 'Konto nicht gefunden.' };

    delete konto.geloescht;
    /* Den Zugang nur zurueckholen, wenn er WEGEN DES LOESCHENS gesperrt
       war. Wer wegen bearbeiteter Screenshots gesperrt wurde, bleibt es
       auch nach einer Wiederherstellung. */
    if (konto.token) {
      const t = this.tokens.alle().find((x) => x.token === konto.token);
      if (t && t.sperrgrund === 'Konto geloescht') this.tokens.entsperren(konto.token);
    }
    this.speichern();
    return { ok: true, wert: konto };
  }

  findeNachSteamId(steamId: string): Konto | null {
    this.aktualisieren();
    const s = String(steamId ?? '').trim();
    return this.konten.find((k) => k.steamId === s) ?? null;
  }

  findeNachId(id: string): Konto | null {
    this.aktualisieren();
    return this.konten.find((k) => k.id === id) ?? null;
  }

  /** Wem gehoert dieser Ingame-Name? */
  findeNachIngame(name: string): Konto | null {
    this.aktualisieren();
    const s = ingameSchluessel(name);
    if (!s) return null;
    return this.konten.find((k) => ingameSchluessel(k.ingameName) === s) ?? null;
  }

  /* --------------------------------------------------------- Anmelden */

  /**
   * Meldet jemanden nach einer bestaetigten Steam-Rueckkehr an.
   *
   * Legt beim ersten Mal das Konto an. Der Ingame-Name fehlt dann noch -
   * den traegt der Nutzer danach selbst ein.
   *
   * WICHTIG: Diese Methode vertraut der SteamID. Sie darf erst aufgerufen
   * werden, NACHDEM steam.ts die Rueckkehr bei Steam nachgeprueft hat -
   * die Rueckleitung allein beweist nichts, die koennte sich jeder
   * basteln.
   */
  anmelden(
    steamId: string,
    steamName?: string,
    jetzt = Date.now()
  ): Ergebnis<{ konto: Konto; sitzung: string }> {

    this.aktualisieren();
    const id = String(steamId ?? '').trim();
    if (!istSteamId(id)) return { ok: false, fehler: 'Ungueltige Steam-Kennung.' };

    let konto = this.konten.find((k) => k.steamId === id) ?? null;
    if (konto === null) {
      konto = {
        id: 'k_' + randomBytes(8).toString('hex'),
        steamId: id,
        // Steam-Anzeigename als Startwert - aendern kann man ihn jederzeit.
        benutzername: (steamName ?? '').trim().slice(0, 40) || ('Spieler' + id.slice(-4)),
        ingameName: '',
        angelegt: jetzt,
        token: ''
      };
      this.konten.push(konto);
    }

    /* Wer sich erneut anmeldet, ist wieder da. Das Loeschen raeumt
       Karteileichen weg, es ist keine Sperre - dafuer gibt es die
       Tokensperre, und die ueberlebt das hier. */
    if (konto.geloescht !== undefined) {
      delete konto.geloescht;
      const t = konto.token
        ? this.tokens.alle().find((x) => x.token === konto.token) : undefined;
      if (t && t.sperrgrund === 'Konto geloescht') this.tokens.entsperren(konto.token);
    }

    konto.letzteAnmeldung = jetzt;

    const code = randomBytes(24).toString('base64url');
    this.sitzungen.push({ code, kontoId: konto.id, erstellt: jetzt, letzteNutzung: jetzt });

    // Alte Sitzungen wegwerfen, damit die Datei nicht endlos waechst.
    this.sitzungen = this.sitzungen.filter(
      (x) => jetzt - x.letzteNutzung < SITZUNG_GUELTIG_MS
    );

    this.speichern();
    return { ok: true, wert: { konto, sitzung: code } };
  }

  /** Wer steckt hinter dieser Sitzung? Verlaengert sie zugleich. */
  ausSitzung(code: string, jetzt = Date.now()): Konto | null {
    this.aktualisieren();
    const s = this.sitzungen.find((x) => x.code === code);
    if (!s) return null;
    if (jetzt - s.letzteNutzung > SITZUNG_GUELTIG_MS) return null;

    s.letzteNutzung = jetzt;
    const konto = this.konten.find((k) => k.id === s.kontoId) ?? null;
    // Ein geloeschtes Konto gilt als abgemeldet.
    return konto && konto.geloescht === undefined ? konto : null;
  }

  abmelden(code: string): void {
    this.aktualisieren();
    this.sitzungen = this.sitzungen.filter((x) => x.code !== code);
    this.speichern();
  }

  /* ----------------------------------------------------- Benutzername */

  aendereBenutzername(id: string, name: string): Ergebnis<Konto> {
    const konto = this.findeNachId(id);
    if (!konto) return { ok: false, fehler: 'Konto nicht gefunden.' };

    const sauber = String(name ?? '').trim().slice(0, 40);
    if (!sauber) return { ok: false, fehler: 'Der Name darf nicht leer sein.' };

    konto.benutzername = sauber;
    // Der Token traegt den Namen als Absender - der soll mitziehen.
    if (konto.token) this.tokens.aktualisiere(konto.token, { name: sauber });
    this.speichern();
    return { ok: true, wert: konto };
  }

  /* ------------------------------------------------------ Ingame-Name */

  /**
   * Wann darf dieses Konto den Ingame-Namen wieder aendern?
   * Gibt 0 zurueck, wenn sofort.
   */
  sperreBis(konto: Konto): number {
    if (konto.letzteNamensaenderung === undefined) return 0;
    return konto.letzteNamensaenderung + NAMENSSPERRE_TAGE * 24 * 60 * 60 * 1000;
  }

  /**
   * Setzt den Ingame-Namen.
   *
   * vomStreamer umgeht die Sperrfrist - er soll nicht warten muessen,
   * wenn jemand wirklich zweimal kurz hintereinander umbenennt. Und die
   * Rueckstufung auf "braucht Freigabe" entfaellt dann, weil er die
   * Aenderung ja selbst vorgenommen hat.
   */
  setzeIngameName(
    id: string,
    name: string,
    vomStreamer = false,
    jetzt = Date.now()
  ): Ergebnis<Konto> {

    const konto = this.findeNachId(id);
    if (!konto) return { ok: false, fehler: 'Konto nicht gefunden.' };

    const sauber = String(name ?? '').trim().slice(0, 40);
    if (!sauber) return { ok: false, fehler: 'Der Ingame-Name darf nicht leer sein.' };

    // Derselbe Name wie bisher: nichts tun, aber auch nicht meckern.
    if (ingameSchluessel(sauber) === ingameSchluessel(konto.ingameName)) {
      return { ok: true, wert: konto };
    }

    /*
       Eindeutigkeit ist die eigentliche Sperre gegen "ich nehme den
       Namen des Erstplatzierten". Wer zuerst da ist, dem gehoert der
       Name. Sie gilt auch fuer den Streamer - sonst koennte er
       versehentlich zwei Konten denselben Namen geben, und beide wuerden
       dieselbe Zeile beanspruchen.
    */
    const belegt = this.findeNachIngame(sauber);
    if (belegt && belegt.id !== konto.id) {
      return {
        ok: false,
        fehler: 'Dieser Ingame-Name gehoert schon einem anderen Konto. ' +
          'Wenn das deiner ist, melde dich im Discord bei einem Admin oder Mod.'
      };
    }

    if (!vomStreamer) {
      const frei = this.sperreBis(konto);
      if (frei > jetzt) {
        const tage = Math.ceil((frei - jetzt) / (24 * 60 * 60 * 1000));
        return {
          ok: false,
          fehler: 'Der Ingame-Name laesst sich nur alle ' + NAMENSSPERRE_TAGE +
            ' Tage aendern. Noch ' + tage + ' Tag(e). Beim Streamer geht es sofort.'
        };
      }
    }

    const vorher = konto.ingameName;
    konto.ingameName = sauber;
    if (!vomStreamer) konto.letzteNamensaenderung = jetzt;

    /*
       Der Token muss mitziehen - er traegt den Ingame-Namen, und er
       entscheidet beim Upload, welche Zeile gewertet wird.

       Aendert der NUTZER den Namen, faellt der Zugang zurueck auf
       "braucht Freigabe". Beim ersten Setzen (vorher leer) nicht - da
       gab es noch kein Vertrauen zu verlieren.
    */
    this.tokenAngleichen(konto, !vomStreamer && vorher !== '');
    this.speichern();
    return { ok: true, wert: konto };
  }

  /* ------------------------------------------------------------ Token */

  /** Legt den Upload-Token an oder bringt ihn auf Stand. */
  tokenAngleichen(konto: Konto, zurueckAufFreigabe = false): Token | null {
    if (!konto.ingameName) return null;

    const vorhanden = konto.token
      ? this.tokens.alle().find((t) => t.token === konto.token) ?? null
      : null;

    if (!vorhanden) {
      const neu = this.tokens.anlegen(
        konto.benutzername, false, konto.ingameName, !NEUE_BRAUCHEN_FREIGABE);
      konto.token = neu.token;
      this.speichern();
      return neu;
    }

    this.tokens.aktualisiere(konto.token, {
      name: konto.benutzername,
      ingameName: konto.ingameName,
      ...(zurueckAufFreigabe ? { ohneFreigabe: false } : {})
    });
    return this.tokens.alle().find((t) => t.token === konto.token) ?? null;
  }

  /** Erzeugt den Token neu - falls jemand seinen verloren hat. */
  tokenNeu(id: string): Ergebnis<string> {
    const konto = this.findeNachId(id);
    if (!konto) return { ok: false, fehler: 'Konto nicht gefunden.' };
    if (!konto.ingameName) {
      return { ok: false, fehler: 'Trag zuerst deinen Ingame-Namen ein.' };
    }

    if (konto.token) this.tokens.sperren(konto.token, 'durch neuen Token ersetzt');
    konto.token = '';
    const neu = this.tokenAngleichen(konto);
    this.speichern();

    return neu
      ? { ok: true, wert: neu.token }
      : { ok: false, fehler: 'Token konnte nicht angelegt werden.' };
  }
}

export function ladeKonten(datei: string, tokens: Tokenliste): Kontenliste {
  return new Kontenliste(datei, tokens);
}

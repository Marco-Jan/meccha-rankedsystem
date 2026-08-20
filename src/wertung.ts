/* =========================================================================
   WERTUNG - die Klammer zwischen Konten und Rangliste.

   Zwei Dinge gehoeren zusammen, wohnen aber getrennt:

     konten.ts     wer mitspielt (Steam-Anmeldung, Ingame-Name)
     rangliste.ts  was er erreicht hat (Punkte, Schnitt, Platz)

   Beide wissen nichts voneinander, und das ist Absicht: die Rangliste
   soll ohne Kontenliste testbar sein, und die Kontenliste hat mit
   Punkten nichts zu tun. Hier werden sie zusammengefuehrt.

   -------------------------------------------------------------------------
   FRUEHER STAND HIER EIN FREMDER SERVER

   Bis zum 20.08.2026 holte mc-ranked beides aus dem Nachbarprojekt
   turnier: die Namensliste per GET /api/state, das Eintragen per
   POST /api/action. Damit haengt jetzt nichts mehr zusammen - und mit
   der Anbindung sind zwei ganze Module weggefallen, die es nur wegen
   ihr gab:

     spiegel.ts   hielt die letzte bekannte Namensliste vor, falls der
                  fremde Server nicht antwortete
     nachtrag.ts  merkte sich Eintraege, die dort nicht ankamen, und
                  schob sie spaeter nach - in der richtigen Reihenfolge,
                  weil eine Vertauschung in die Wertung durchschlaegt

   Beides ist bei einer Datei auf derselben Platte gegenstandslos. Es
   gibt kein "nicht erreichbar" mehr, also auch nichts nachzutragen.
   ========================================================================= */

import path from 'node:path';

import { Rangliste, ladeRangliste, FENSTER, VOLL, type Ranglistenzeile } from './rangliste.js';
import { Kontenliste, ladeKonten, ingameSchluessel, type Konto } from './konten.js';
import { Tokenliste, ladeTokens } from './tokens.js';
import type { Spieler } from './namen.js';

export interface LetzterEintrag {
  readonly id: string;
  readonly kontoId: string;
  readonly name: string;
  readonly punkte: number;
  readonly ts: number;
}

/**
 * Alles, was eine Anfrage ueber den Stand der Wertung wissen muss.
 *
 * Wird je Anfrage frisch gebaut. Das kostet nichts - es sind ein paar
 * hundert Eintraege im Speicher - und erspart die Frage, wann ein
 * zwischenzeitlich angelegtes Konto sichtbar wird. Antwort: sofort.
 */
export interface Wertungsstand {
  /** Wer zugeordnet werden kann - angemeldet, mit Ingame-Namen. */
  readonly spieler: readonly Spieler[];
  /** Groesse des Wertungsfensters. */
  readonly fenster: number;
  /** Ab so vielen Eintraegen steht man in der Wertung. */
  readonly voll: number;
  /** Wie viele Eintraege die Rangliste insgesamt hat. */
  readonly eintraege: number;
  readonly gewertet: readonly Ranglistenzeile[];
  readonly anwaerter: readonly Ranglistenzeile[];
  /** Die juengsten Eintraege, neueste zuerst - Gegenprobe im Dashboard. */
  readonly letzte: readonly LetzterEintrag[];
}

export class Wertung {
  constructor(
    private readonly rangliste: Rangliste,
    private readonly konten: Kontenliste
  ) {}

  /**
   * Der Anzeigename zu einem Konto: der INGAME-Name.
   *
   * Nicht der Benutzername. In der Rangliste soll stehen, was im Spiel
   * ueber dem Kopf steht - sonst sucht sich jeder selbst und findet
   * einen Fremden.
   *
   * Ein geloeschtes Konto gibt null zurueck und faellt damit aus der
   * Wertung. Die Eintraege bleiben in der Datei: wird das Konto
   * wiederhergestellt, ist auch die Historie wieder da.
   */
  nameVon = (kontoId: string): string | null => {
    const konto = this.konten.findeNachId(kontoId);
    if (!konto || konto.geloescht !== undefined) return null;
    return konto.ingameName || null;
  };

  /**
   * Wer kommt fuer eine Zuordnung in Frage.
   *
   * Nur aktive Konten MIT Ingame-Namen. Ein Konto ohne Namen ist frisch
   * angemeldet und hat noch nicht gesagt, wie es im Spiel heisst - es
   * mit leerem Namen mitzuschicken waere gefaehrlich, weil ein leerer
   * Schluessel auf alles Moegliche passen koennte.
   */
  spieler(): Spieler[] {
    return this.konten
      .aktive()
      .filter((k) => k.ingameName.trim().length > 0)
      .map((k) => ({ id: k.id, name: k.ingameName }));
  }

  /** Zu welchem Konto gehoert dieser Ingame-Name? */
  kontoZuIngame(name: string): Konto | null {
    const gesucht = ingameSchluessel(name);
    if (!gesucht) return null;
    return this.konten.findeNachIngame(gesucht);
  }

  stand(): Wertungsstand {
    const t = this.rangliste.tabelle(this.nameVon);
    return {
      spieler: this.spieler(),
      fenster: FENSTER,
      voll: VOLL,
      eintraege: this.rangliste.alle().length,
      gewertet: t.gewertet,
      anwaerter: t.anwaerter,
      letzte: this.rangliste.letzte(this.nameVon)
    };
  }

  /**
   * Traegt eine Punktzahl ein.
   *
   * Erwartet die KONTO-KENNUNG, nicht den gelesenen Namen. Die Zuordnung
   * hat namen.ts vorher gemacht; hier noch einmal nach einem Namen zu
   * suchen wuerde die Pruefung umgehen, die genau davor sitzt.
   */
  eintragen(kontoId: string, punkte: number): void {
    this.rangliste.eintragen(kontoId, punkte);
  }

  /** Was jemand fuer seine eigene Kontoseite sehen will. */
  meinStand(kontoId: string): {
    eintraege: number; fehlt: number; schnitt: number | null; platz: number | null;
  } {
    const meine = this.rangliste.eintraegeVon(kontoId);
    const t = this.rangliste.tabelle(this.nameVon);
    const zeile = [...t.gewertet, ...t.anwaerter].find((z) => z.kontoId === kontoId);

    return {
      eintraege: meine.length,
      fehlt: this.rangliste.fehlendeRunden(kontoId),
      schnitt: zeile ? zeile.schnitt : null,
      platz: zeile?.platz ?? null
    };
  }
}

export function ladeWertung(rangliste: Rangliste, konten: Kontenliste): Wertung {
  return new Wertung(rangliste, konten);
}

/**
 * Die uebliche Verdrahtung aus einem Datenordner.
 *
 * Rangliste, Konten und Tokens haengen zusammen und liegen immer im
 * selben Ordner. Ohne diesen Helfer stuende dieselbe Reihenfolge in
 * jedem CLI noch einmal - und beim naechsten Zusatz in einem davon
 * nicht mehr.
 */
export function ladeWertungAusOrdner(datenDir: string): {
  wertung: Wertung; rangliste: Rangliste; konten: Kontenliste; tokens: Tokenliste;
} {
  const tokens = ladeTokens(path.join(datenDir, 'tokens.json'));
  const konten = ladeKonten(path.join(datenDir, 'konten.json'), tokens);
  const rangliste = ladeRangliste(path.join(datenDir, 'rangliste.json'));
  return { wertung: new Wertung(rangliste, konten), rangliste, konten, tokens };
}

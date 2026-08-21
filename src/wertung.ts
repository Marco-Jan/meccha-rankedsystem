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
import { Listen, ladeListen, type Liste } from './listen.js';
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
/** Eine Rangliste samt ihrem Stand. */
export interface Listenstand {
  readonly id: string;
  readonly name: string;
  readonly aktiv: boolean;
  /** Wie viele Eintraege diese Liste hat. */
  readonly eintraege: number;
  readonly gewertet: readonly Ranglistenzeile[];
  readonly anwaerter: readonly Ranglistenzeile[];
  /**
   * Anwaerter, die es unter die ersten drei schaffen wuerden.
   *
   * Auswahl aus anwaerter, keine dritte Gruppe - siehe rangliste.ts.
   * Steht als eigenes Feld, damit die Anzeige sie oben hervorheben kann,
   * ohne die Regel doppelt zu kennen.
   */
  readonly aufDemSprung: readonly Ranglistenzeile[];
  /** Die juengsten Eintraege dieser Liste, neueste zuerst. */
  readonly letzte: readonly LetzterEintrag[];
}

export interface Wertungsstand {
  /** Wer zugeordnet werden kann - angemeldet, mit Ingame-Namen. */
  readonly spieler: readonly Spieler[];
  /** Groesse des Wertungsfensters. */
  readonly fenster: number;
  /** Ab so vielen Eintraegen steht man in der Wertung. */
  readonly voll: number;
  /** Wie viele Eintraege ueber ALLE Listen. */
  readonly eintraege: number;
  /**
   * Die Listen, jede mit ihrem eigenen Stand.
   *
   * Aktive zuerst. Wer nur die oeffentliche Seite fuellt, nimmt die
   * aktiven; das Dashboard zeigt alle.
   */
  readonly listen: readonly Listenstand[];
}

export class Wertung {
  constructor(
    private readonly rangliste: Rangliste,
    private readonly konten: Kontenliste,
    private readonly listen: Listen
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

  /** Der Stand EINER Liste. */
  listenstand(liste: Liste): Listenstand {
    const t = this.rangliste.tabelle(liste.id, this.nameVon);
    return {
      id: liste.id,
      name: liste.name,
      aktiv: liste.aktiv,
      eintraege: this.rangliste.anzahlIn(liste.id),
      gewertet: t.gewertet,
      anwaerter: t.anwaerter,
      aufDemSprung: t.aufDemSprung,
      letzte: this.rangliste.letzte(liste.id, this.nameVon)
    };
  }

  stand(): Wertungsstand {
    /* Aktive zuerst, danach nach Anlagedatum - die neueste Saison oben.
       Wer die Seite aufruft, sucht den laufenden Stand, nicht den von
       vorletztem Jahr. */
    const sortiert = [...this.listen.alle()].sort((a, b) =>
      Number(b.aktiv) - Number(a.aktiv) || b.angelegt - a.angelegt);

    return {
      spieler: this.spieler(),
      fenster: FENSTER,
      voll: VOLL,
      eintraege: this.rangliste.alle().length,
      listen: sortiert.map((l) => this.listenstand(l))
    };
  }

  /**
   * Traegt eine Punktzahl in JEDE AKTIVE Liste ein.
   *
   * Erwartet die KONTO-KENNUNG, nicht den gelesenen Namen. Die Zuordnung
   * hat namen.ts vorher gemacht; hier noch einmal nach einem Namen zu
   * suchen wuerde die Pruefung umgehen, die genau davor sitzt.
   *
   * Gibt zurueck, in wie viele Listen geschrieben wurde. Der Aufrufer
   * meldet das weiter - "eingetragen" ohne Zahl waere bei mehreren
   * Listen eine Untertreibung, und bei null eine Luege.
   *
   * NULL aktive Listen kann es nicht geben: setzeAktiv() laesst die
   * letzte nicht abschalten, und sorgeFuerEine() legt beim Start eine an,
   * falls gar keine da ist.
   */
  eintragen(kontoId: string, punkte: number): number {
    return this.eintragenMitKennungen(kontoId, punkte).length;
  }

  /**
   * Wie eintragen, gibt aber die Kennungen der angelegten Eintraege
   * zurueck.
   *
   * Gebraucht fuer die Ruecknahme: eine Runde wird in JEDE aktive Liste
   * geschrieben, also entstehen mehrere Eintraege. Wer sie
   * zurueckholen will, muss wissen welche - sie hinterher am Zeitpunkt
   * zu suchen waere geraten, und bei zwei Leuten in derselben Sekunde
   * falsch geraten.
   */
  eintragenMitKennungen(kontoId: string, punkte: number): string[] {
    return this.listen.aktive()
      .map((l) => this.rangliste.eintragen(l.id, kontoId, punkte).id);
  }

  /** Nimmt Eintraege zurueck. Gibt zurueck, wie viele es wirklich gab. */
  entfernen(ids: readonly string[]): number {
    let weg = 0;
    for (const id of ids) if (this.rangliste.entfernen(id)) weg++;
    return weg;
  }

  /**
   * Was jemand fuer seine eigene Kontoseite sehen will - JE LISTE.
   *
   * Eine Zahl ueber alle Listen waere nichtssagend: bei zwei aktiven
   * haette jeder doppelt so viele Eintraege, ohne oefter gespielt zu
   * haben. Der Client nennt sie deshalb einzeln.
   */
  meinStand(kontoId: string): Array<{
    listeId: string; name: string; aktiv: boolean;
    eintraege: number; fehlt: number; schnitt: number | null; platz: number | null;
  }> {
    return this.listen.aktive().map((l) => {
      const t = this.rangliste.tabelle(l.id, this.nameVon);
      const zeile = [...t.gewertet, ...t.anwaerter].find((z) => z.kontoId === kontoId);

      return {
        listeId: l.id,
        name: l.name,
        aktiv: l.aktiv,
        eintraege: this.rangliste.eintraegeVon(l.id, kontoId).length,
        fehlt: this.rangliste.fehlendeRunden(l.id, kontoId),
        schnitt: zeile ? zeile.schnitt : null,
        platz: zeile?.platz ?? null
      };
    });
  }
}

export function ladeWertung(
  rangliste: Rangliste,
  konten: Kontenliste,
  listen: Listen
): Wertung {
  /*
     Erster Start nach dem 20.08.2026: es gibt noch keine Liste, und
     rangliste.json kann Eintraege ohne Kennung enthalten. Beides wird
     hier zusammengefuehrt - danach haengt jeder Eintrag an einer Liste.

     Die Reihenfolge ist wichtig: erst die Liste anlegen, dann zuordnen.
     Umgekehrt gaebe es einen Moment, in dem Eintraege auf eine Kennung
     zeigen, die es nicht gibt.
  */
  const ersteId = listen.sorgeFuerEine();
  if (ersteId) {
    const umgehaengt = rangliste.zuordnenOhneListe(ersteId);
    if (umgehaengt > 0) {
      console.log('[mc-ranked] ' + umgehaengt +
        ' Eintraege ohne Liste der ersten Rangliste zugeordnet.');
    }
  }
  return new Wertung(rangliste, konten, listen);
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
  wertung: Wertung; rangliste: Rangliste; konten: Kontenliste;
  tokens: Tokenliste; listen: Listen;
} {
  const tokens = ladeTokens(path.join(datenDir, 'tokens.json'));
  const konten = ladeKonten(path.join(datenDir, 'konten.json'), tokens);
  const rangliste = ladeRangliste(path.join(datenDir, 'rangliste.json'));
  const listen = ladeListen(path.join(datenDir, 'listen.json'));
  return { wertung: ladeWertung(rangliste, konten, listen), rangliste, konten, tokens, listen };
}

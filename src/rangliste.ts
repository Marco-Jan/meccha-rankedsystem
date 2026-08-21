/* =========================================================================
   DIE RANGLISTE - hier entsteht der Rang.

   Bis zum 20.08.2026 lag diese Rechnung im Nachbarprojekt turnier
   (listen.js) und mc-ranked war nur ein Zubringer. Das war ein
   Missverstaendnis: mc-ranked ist ein eigenstaendiges Programm. Man meldet
   sich mit Steam an, schickt seine Punkte ueber den Client ein, daraus
   entsteht der Rang. Ein Nachbarprojekt ist dafuer nicht noetig.

   Die Rechnung selbst ist uebernommen wie sie war, absichtlich Zeile fuer
   Zeile: sie war richtig, sie war erprobt, und ein "waehrend wir schon
   dabei sind" haette hier den groessten Schaden angerichtet - eine falsche
   Wertung faellt erst auf, wenn eine Saison gelaufen ist.

   -------------------------------------------------------------------------
   DIE REGEL

     Gewertet wird der SCHNITT DER LETZTEN 10 Eintraege.

     Wer 10 Eintraege hat, steht IN DER WERTUNG - jeder wird ueber exakt
     dieselbe Zahl von Ergebnissen verglichen. Damit bleibt kein Rest an
     Unfairness, den man wegerklaeren muesste.

     Wer 1 bis 9 hat, steht als ANWAERTER daneben: sichtbar mit Schnitt
     und Zaehler, aber ausserhalb der Rangfolge.

   Es gibt keine Runden und kein Ende. Wer aufhoert, bleibt mit dem stehen,
   was er hat.

   -------------------------------------------------------------------------
   WORAN EIN EINTRAG HAENGT

   Am kontoId, nicht am Ingame-Namen. Der Name laesst sich alle 30 Tage
   aendern (konten.ts) - haenge die Historie daran, waere sie nach einer
   Umbenennung verwaist, und der Betreffende faenge bei null an. Der Name
   wird erst beim Anzeigen nachgeschlagen.
   ========================================================================= */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** So viele Eintraege zaehlen fuer den Schnitt. */
export const FENSTER = 10;

/** Ab so vielen Eintraegen steht man in der Wertung statt bei den Anwaertern. */
export const VOLL = 10;

/* -------------------------------------------------------- Auf dem Sprung

   Wer noch Anwaerter ist, steht ganz unten - hinter allen Gewerteten,
   auch wenn er besser spielt als sie alle. Das ist fuer die Wertung
   richtig (verglichen wird nur ueber zehn Runden), fuer die Motivation
   aber genau verkehrt: der Beste der Neuen sieht sich am Ende einer
   Liste, in der er eigentlich vorne stuende.

   Deshalb bekommen die Aussichtsreichen einen eigenen Block ganz oben.
   Zwei Bedingungen, beide noetig:

     - mindestens SPRUNG_AB Eintraege. Aus zwei Runden laesst sich
       nichts ablesen; ein einzelner Glueckstreffer wuerde jemanden ganz
       nach oben spuelen und beim naechsten Eintrag wieder hinunter.

     - der Schnitt muesste fuer die ersten SPRUNG_PLATZ reichen. Nicht
       "irgendwo in der Wertung" - dann staende dort die halbe Liste und
       es waere kein Ansporn mehr, sondern Rauschen.
*/

/** Ab so vielen Eintraegen kann jemand "auf dem Sprung" sein. */
export const SPRUNG_AB = 5;

/** So weit vorne muesste sein Schnitt ihn bringen. */
export const SPRUNG_PLATZ = 3;

/* ------------------------------------------------------------- Tendenz

   Geht es gerade aufwaerts oder abwaerts?

   Was NICHT geht: den Platz von vorgestern mit dem von heute
   vergleichen. Den kennt niemand - es gibt keine Momentaufnahmen der
   Liste, und sie rueckwirkend zu rechnen hiesse, jede Aenderung jedes
   anderen Spielers nachzuvollziehen.

   Was geht, und was fuer den Spieler dasselbe beantwortet: die letzten
   drei Runden mit dem eigenen Schnitt vergleichen. Der Platz haengt am
   Schnitt, und der Schnitt bewegt sich genau dann, wenn das Neue besser
   oder schlechter ist als das, was bisher drin war. Liegen die letzten
   drei darueber, steigt er - und der Spieler mit ihm.

   Das ist keine Vorhersage, sondern eine Feststellung ueber das, was
   gerade hineinlaeuft. Genau deshalb ist es ehrlich.
*/
export const TENDENZ_LETZTE = 3;

/**
 * Ab so vielen Eintraegen wird eine Tendenz gezeigt.
 *
 * Bei genau drei waeren "die letzten drei" und "der Schnitt" dasselbe,
 * das Ergebnis immer null. Erst wenn etwas AUSSERHALB der letzten drei
 * liegt, gibt es ueberhaupt etwas zu vergleichen - und aus einem
 * einzigen Vergleichswert liesse sich noch nichts ablesen.
 */
export const TENDENZ_AB = 5;

/**
 * Wie deutlich der Unterschied sein muss, damit ein Pfeil erscheint.
 *
 * Anteilig, nicht in Punkten: bei 200 Punkten Schnitt bedeuten 20 Punkte
 * etwas, bei 3000 sind sie Rauschen. Fuenf Prozent ist die Grenze, unter
 * der ein Pfeil mehr behaupten wuerde, als dasteht.
 */
export const TENDENZ_SCHWELLE = 0.05;

/** Wohin es gerade geht. */
export type Tendenz = 'auf' | 'ab' | 'gleich' | 'unklar';

/**
 * Vergleicht die letzten Runden mit dem Schnitt, aus dem der Platz kommt.
 *
 * fenster ist, was in den Schnitt eingeht - hoechstens die letzten
 * FENSTER Eintraege, aeltester zuerst.
 */
export function tendenzVon(
  fenster: readonly { punkte: number }[]
): { tendenz: Tendenz; abweichung: number } {
  if (fenster.length < TENDENZ_AB) return { tendenz: 'unklar', abweichung: 0 };

  const schnitt = fenster.reduce((s, e) => s + e.punkte, 0) / fenster.length;
  const letzte = fenster.slice(-TENDENZ_LETZTE);
  const schnittLetzte = letzte.reduce((s, e) => s + e.punkte, 0) / letzte.length;

  // Ein Schnitt von null kaeme nur bei lauter Nullrunden vor - dann gibt
  // es nichts ins Verhaeltnis zu setzen.
  if (schnitt <= 0) return { tendenz: 'gleich', abweichung: 0 };

  const abweichung = (schnittLetzte - schnitt) / schnitt;
  if (abweichung > TENDENZ_SCHWELLE) return { tendenz: 'auf', abweichung };
  if (abweichung < -TENDENZ_SCHWELLE) return { tendenz: 'ab', abweichung };
  return { tendenz: 'gleich', abweichung };
}

export interface Ranglisteneintrag {
  readonly id: string;
  /**
   * In welcher Rangliste dieser Eintrag zaehlt (listen.ts).
   *
   * Eine freigegebene Runde erzeugt einen Eintrag JE AKTIVER LISTE -
   * dieselbe Punktzahl, dieselbe Person, verschiedene listeId. So laufen
   * Jahres- und Monatswertung nebeneinander, ohne sich zu beeinflussen.
   *
   * Fehlt das Feld, stammt der Eintrag aus der Zeit vor dem 20.08.2026,
   * als es nur eine Liste gab. Beim Laden wird er der ersten Liste
   * zugeordnet - siehe zuordnenOhneListe().
   */
  readonly listeId: string;
  /** Das Konto, dem die Punkte gehoeren - nie der Ingame-Name. */
  readonly kontoId: string;
  readonly punkte: number;
  readonly ts: number;
  /**
   * Laufende Nummer.
   *
   * Zwei Eintraege in derselben Millisekunde haetten sonst keine feste
   * Reihenfolge - dann waere unklar, welcher aus dem Fenster faellt, und
   * die Wertung koennte sich zwischen zwei Neustarts aendern, ohne dass
   * jemand etwas eingetragen haette.
   */
  readonly seq: number;
}

export interface Ranglistenzeile {
  readonly listeId: string;
  readonly kontoId: string;
  readonly name: string;
  readonly schnitt: number;
  /** Wie viele Eintraege in den Schnitt eingegangen sind (hoechstens FENSTER). */
  readonly imFenster: number;
  /** Wie viele Eintraege die Person insgesamt hat. */
  readonly gesamt: number;
  readonly letzter: number;
  /** Woraus der Schnitt entsteht, aeltester zuerst - fuers Aufklappen. */
  readonly werte: ReadonlyArray<{ id: string; punkte: number; ts: number }>;
  /**
   * Wohin es gerade geht - die letzten Runden gegen den eigenen Schnitt.
   * "unklar", solange es zu wenige Eintraege sind. Siehe tendenzVon.
   */
  readonly tendenz: Tendenz;
  /** Um wie viel, anteilig. Negativ heisst abwaerts. */
  readonly abweichung: number;
  /** Platz in der Wertung. Bei Anwaertern nicht gesetzt. */
  platz?: number;
}

export interface Tabelle {
  /** In der Wertung - mindestens VOLL Eintraege, mit Platz. */
  readonly gewertet: readonly Ranglistenzeile[];
  /** Noch nicht genug Eintraege. */
  readonly anwaerter: readonly Ranglistenzeile[];
  /**
   * Anwaerter, deren Schnitt fuer die ersten SPRUNG_PLATZ reichen wuerde.
   *
   * Eine AUSWAHL aus anwaerter, keine dritte Gruppe: dieselben Zeilen
   * stehen dort weiterhin. Die Anzeige hebt sie oben hervor und laesst
   * sie unten in der Liste - wer sie herausrechnete, riesse ein Loch in
   * die Anwaerterliste, das niemand erklaeren koennte.
   */
  readonly aufDemSprung: readonly Ranglistenzeile[];
}

interface RanglisteDatei {
  readonly version: 1;
  readonly eintraege: Ranglisteneintrag[];
}

/**
 * Schlaegt den Anzeigenamen zu einem Konto nach.
 *
 * Als Funktion herausgezogen, damit dieses Modul nichts von konten.ts
 * wissen muss - und damit die Tests ohne Kontenliste auskommen.
 * Gibt null zurueck, wenn es das Konto nicht mehr gibt; solche Eintraege
 * fallen aus der Tabelle, statt als "?" darin zu stehen.
 */
export type NameVon = (kontoId: string) => string | null;

/* ------------------------------------------------------------------ Laden */

function lesen(datei: string): Ranglisteneintrag[] {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return [];
  }

  // BOM abschneiden - dieselbe Vorsicht wie in freigabe.ts und konten.ts
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  try {
    const d = JSON.parse(roh) as RanglisteDatei;
    return Array.isArray(d.eintraege) ? d.eintraege : [];
  } catch (err) {
    /*
       Kaputte Datei zur Seite legen statt beim naechsten Speichern
       ueberschreiben. Hier steckt die gesamte Wertung drin - das ist die
       Datei, deren Verlust am meisten weh taete.
    */
    const kaputt = datei.replace(/\.json$/, '') + '.defekt-' + Date.now() + '.json';
    try {
      renameSync(datei, kaputt);
      console.error('[mc-ranked] rangliste.json ist beschaedigt, liegt jetzt hier: ' + kaputt);
    } catch {
      console.error('[mc-ranked] rangliste.json ist beschaedigt:', (err as Error).message);
    }
    return [];
  }
}

/* ------------------------------------------------------------- Verwaltung */

export class Rangliste {
  private eintraege: Ranglisteneintrag[];
  private naechsteSeq = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly datei: string) {
    /* listeId darf hier noch fehlen - zuordnenOhneListe() haengt solche
       Eintraege gleich nach dem Laden an die erste Liste. Punkte muessen
       dagegen stimmen: ein NaN in der Wertung faellt sonst nie auf. */
    this.eintraege = lesen(datei).filter((e) => Number.isFinite(e.punkte));

    // seq nachziehen, falls eine aeltere Datei sie noch nicht hatte.
    for (const e of this.eintraege) {
      const s = typeof e.seq === 'number' ? e.seq : this.naechsteSeq;
      (e as { seq: number }).seq = s;
      this.naechsteSeq = Math.max(this.naechsteSeq, s) + 1;
    }
  }

  /** Entprellt schreiben, wie makeSaver in turnier/jsonstore.js. */
  private speichern(verzoegerung = 250): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        this.jetztSpeichern();
      } catch (err) {
        console.error('[mc-ranked] Rangliste speichern fehlgeschlagen:', (err as Error).message);
      }
    }, verzoegerung);
  }

  /** Sofort schreiben - fuer Tests und zum sauberen Beenden. */
  jetztSpeichern(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    mkdirSync(path.dirname(this.datei), { recursive: true });
    const inhalt: RanglisteDatei = { version: 1, eintraege: this.eintraege };
    writeFileSync(this.datei, JSON.stringify(inhalt, null, 2), 'utf8');
  }

  /* ------------------------------------------------------------ Eintragen */

  /**
   * Traegt eine Punktzahl ein.
   *
   * Es gibt bewusst keine Pruefung auf "hat dieses Konto schon einen
   * Eintrag mit dieser Punktzahl": dieselbe Zahl zweimal ehrlich zu
   * spielen ist moeglich, und das Abfangen von Wiederholungen ist Sache
   * von verdacht.ts - VOR der Freigabe, mit Bild daneben. Hier ist es
   * dafuer zu spaet.
   */
  eintragen(
    listeId: string,
    kontoId: string,
    punkte: number,
    jetzt = Date.now()
  ): Ranglisteneintrag {
    if (!Number.isFinite(punkte)) {
      throw new Error('Punktzahl ist keine Zahl: ' + String(punkte));
    }
    if (!listeId) throw new Error('Ohne Liste laesst sich nichts eintragen.');

    const eintrag: Ranglisteneintrag = {
      id: 'e_' + Math.random().toString(36).slice(2, 10),
      listeId,
      kontoId,
      punkte,
      ts: jetzt,
      seq: this.naechsteSeq++
    };
    this.eintraege.push(eintrag);
    this.speichern();
    return eintrag;
  }

  /** Nimmt einen Eintrag zurueck - falls doch etwas Falsches durchkam. */
  entfernen(id: string): boolean {
    const vorher = this.eintraege.length;
    this.eintraege = this.eintraege.filter((e) => e.id !== id);
    if (this.eintraege.length === vorher) return false;
    this.speichern();
    return true;
  }

  /** Korrigiert eine Punktzahl, ohne die Reihenfolge zu veraendern. */
  aendern(id: string, punkte: number): boolean {
    if (!Number.isFinite(punkte)) return false;
    const e = this.eintraege.find((x) => x.id === id);
    if (!e) return false;
    (e as { punkte: number }).punkte = punkte;
    this.speichern();
    return true;
  }

  alle(): readonly Ranglisteneintrag[] {
    return this.eintraege;
  }

  /* --------------------------------------------------------------- Lesen */

  /** Alle Eintraege einer Person in EINER Liste, aeltester zuerst. */
  eintraegeVon(listeId: string, kontoId: string): Ranglisteneintrag[] {
    return this.eintraege
      .filter((e) => e.listeId === listeId && e.kontoId === kontoId)
      .sort(chronologisch);
  }

  /** Wie viele Eintraege eine Liste insgesamt hat. */
  anzahlIn(listeId: string): number {
    return this.eintraege.filter((e) => e.listeId === listeId).length;
  }

  /**
   * Haengt Eintraege ohne Liste an eine bestimmte.
   *
   * Genau ein Fall: der erste Start nach dem 20.08.2026. Vorher gab es
   * nur eine Rangliste, und die Eintraege trugen keine Kennung. Ohne
   * diese Zuordnung waeren sie herrenlos - in keiner Tabelle, in keinem
   * Export, nirgends. Eine Saison waere lautlos verschwunden.
   *
   * Gibt zurueck, wie viele umgehaengt wurden.
   */
  zuordnenOhneListe(listeId: string): number {
    let n = 0;
    for (const e of this.eintraege) {
      if (!e.listeId) {
        (e as { listeId: string }).listeId = listeId;
        n++;
      }
    }
    if (n > 0) this.jetztSpeichern();
    return n;
  }

  /**
   * Die Tabelle, getrennt in Wertung und Anwaerter.
   *
   * Uebernommen aus turnier/listen.js:168 - siehe Kopf dieser Datei.
   */
  tabelle(listeId: string, nameVon: NameVon): Tabelle {
    const proPerson = new Map<string, Ranglisteneintrag[]>();
    for (const e of this.eintraege) {
      if (e.listeId !== listeId) continue;
      const gesammelt = proPerson.get(e.kontoId);
      if (gesammelt) gesammelt.push(e);
      else proPerson.set(e.kontoId, [e]);
    }

    const zeilen: Ranglistenzeile[] = [];
    for (const [kontoId, alle] of proPerson) {
      const name = nameVon(kontoId);
      // Kein Konto mehr - der Eintrag hat keinen Traeger und faellt weg,
      // statt als "?" in der Wertung zu stehen.
      if (name === null) continue;

      alle.sort(chronologisch);
      const fenster = alle.slice(-FENSTER);
      const summe = fenster.reduce((s, e) => s + e.punkte, 0);

      zeilen.push({
        listeId,
        kontoId,
        name,
        schnitt: summe / fenster.length,
        imFenster: fenster.length,
        gesamt: alle.length,
        letzter: alle[alle.length - 1]!.ts,
        werte: fenster.map((e) => ({ id: e.id, punkte: e.punkte, ts: e.ts })),
        ...tendenzVon(fenster)
      });
    }

    /*
       Gleicher Schnitt: wer mehr Eintraege hat, steht vorne - er hat es
       oefter gezeigt. Danach alphabetisch, damit die Reihenfolge stabil
       bleibt und die Liste nicht bei jedem Abruf springt.
    */
    const sortieren = (a: Ranglistenzeile, b: Ranglistenzeile): number =>
      b.schnitt - a.schnitt || b.gesamt - a.gesamt || a.name.localeCompare(b.name);

    const gewertet = zeilen.filter((z) => z.imFenster >= VOLL).sort(sortieren);
    const anwaerter = zeilen.filter((z) => z.imFenster < VOLL).sort(sortieren);

    /*
       Gleicher Schnitt heisst gleicher Platz, und der naechste Platz
       ueberspringt entsprechend (1, 2, 2, 4). Alles andere waere
       willkuerlich: bei identischem Schnitt gibt es keinen Grund, warum
       einer vor dem anderen stehen sollte.
    */
    let platz = 0;
    let letzterSchnitt: number | null = null;
    gewertet.forEach((z, i) => {
      if (z.schnitt !== letzterSchnitt) {
        platz = i + 1;
        letzterSchnitt = z.schnitt;
      }
      z.platz = platz;
    });

    /*
       Wer wuerde unter die ersten SPRUNG_PLATZ kommen?

       Die Schwelle ist der Schnitt des derzeit Dritten. Gibt es noch
       keine drei Gewerteten, ist sie unendlich niedrig - dann reicht
       jeder Schnitt, und das ist richtig so: in eine Wertung mit zwei
       Leuten kommt man auch mit wenig unter die ersten drei.

       Verglichen wird mit > und nicht mit >=: bei exakter Gleichheit
       stuende er hinter dem Dritten, also auf vier.
    */
    const schwelle = gewertet.length >= SPRUNG_PLATZ
      ? gewertet[SPRUNG_PLATZ - 1]!.schnitt
      : Number.NEGATIVE_INFINITY;

    const aufDemSprung = anwaerter.filter(
      (z) => z.imFenster >= SPRUNG_AB && z.schnitt > schwelle
    );

    return { gewertet, anwaerter, aufDemSprung };
  }

  /** Die juengsten Eintraege, neueste zuerst - fuer die Gegenprobe im Dashboard. */
  letzte(listeId: string, nameVon: NameVon, grenze = 30): Array<{
    id: string; kontoId: string; name: string; punkte: number; ts: number;
  }> {
    return this.eintraege
      .filter((e) => e.listeId === listeId)
      .slice()
      .sort((a, b) => b.ts - a.ts || b.seq - a.seq)
      .slice(0, grenze)
      .map((e) => ({
        id: e.id,
        kontoId: e.kontoId,
        name: nameVon(e.kontoId) ?? '?',
        punkte: e.punkte,
        ts: e.ts
      }));
  }

  /**
   * Wie weit ist jemand von der Wertung entfernt?
   *
   * Fuer die Kontoseite: "noch 3 Runden bis zur Wertung" ist die Frage,
   * die jeder Neue als erstes stellt.
   */
  fehlendeRunden(listeId: string, kontoId: string): number {
    return Math.max(0, VOLL - this.eintraegeVon(listeId, kontoId).length);
  }
}

function chronologisch(a: Ranglisteneintrag, b: Ranglisteneintrag): number {
  return a.ts - b.ts || a.seq - b.seq;
}

export function ladeRangliste(datei: string): Rangliste {
  return new Rangliste(datei);
}

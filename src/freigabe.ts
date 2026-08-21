/* =========================================================================
   FREIGABELISTE - Runden, die auf deinen Klick warten.

   Eigene Runden (F9 am Spiel-PC) gehen direkt in die Punkteliste. Runden,
   die ein Zuschauer hochlaedt, landen HIER und werden erst gewertet, wenn
   du oder ein Mod sie freigibst.

   Der Grund steht im Auftrag selbst: "Zuschauer duerfen niemals eine
   Punktzahl selbst eingeben." Sobald der Zuschauer das Bild liefert,
   bestimmt sein Bild die Punkte - und OCR kann einen echten Screenshot
   nicht von einem in Paint bearbeiteten unterscheiden. Die Freigabe ist
   das, was diese Regel trotzdem einhaelt.

   Deshalb gilt hier durchgehend: NICHTS wird automatisch gewertet, und
   der Screenshot wird aufgehoben. Ohne Bild koenntest du eine Faelschung
   gar nicht erkennen.

   Gespeichert wird wie im Turnier-Projekt: eine JSON-Datei, entprellt
   geschrieben, kaputte Datei zur Seite gelegt statt ueberschrieben.
   ========================================================================= */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

import type { RohZeile } from './parse.js';

/**
 * Wie lange das Bild einer GEFLAGGTEN Runde aufgehoben wird.
 *
 * 30 Tage, passend zum Rueckschaufenster in verdacht.ts: was dort noch
 * mitzaehlt, soll auch noch anzusehen sein.
 */
export const VERDACHT_BILD_STUNDEN = Number(process.env.MC_VERDACHT_BILD_STUNDEN || 30 * 24);

export type FreigabeStatus = 'offen' | 'freigegeben' | 'abgelehnt';
export type Quelle = 'selbst' | 'zuschauer';

export interface OffeneRunde {
  readonly id: string;
  /** Wann sie eingegangen ist. */
  readonly eingegangen: number;
  readonly quelle: Quelle;
  /** Wer sie geschickt hat - bei 'zuschauer' der Name zum Token. */
  readonly absender: string;
  /** Pfad zum aufgehobenen Screenshot. Ohne ihn ist keine Pruefung moeglich. */
  readonly bildPfad: string;
  /**
   * SHA-256 des Bildes. Damit faellt auf, wenn derselbe Screenshot ein
   * zweites Mal geschickt wird - der billigste Trick, um Punkte zu
   * verdoppeln.
   */
  readonly bildHash: string;
  /** Was der Leser erkannt hat, unveraendert. */
  readonly zeilen: readonly RohZeile[];
  /**
   * Ergebnis der Bildpruefung - sieht das nach einer frischen Aufnahme
   * aus? Kein Beweis, nur ein Hinweis fuer die Freigabeseite. Siehe
   * bildpruefung.ts.
   */
  readonly bildAuffaellig?: readonly string[];
  /**
   * Warum diese Runde zur Pruefung kam - aus verdacht.ts.
   *
   * Steht sie hier, ist die Runde GEFLAGGT. Das hat zwei Folgen: sie
   * laeuft nicht direkt durch, auch wenn der Zugang auf "zaehlt sofort"
   * steht, und ihr Bild wird nicht nach der ueblichen Frist geloescht -
   * sonst waere der Beleg weg, bevor jemand hinsieht.
   */
  readonly verdacht?: readonly string[];
  /** true, sobald das Bild nach Ablauf der Frist geloescht wurde. */
  bildGeloescht?: boolean;
  /**
   * Der ausgeschnittene Ranglisten-Block, ~55 KB statt ~2 MB.
   *
   * Bleibt DAUERHAFT liegen, auch wenn das Original laengst geloescht
   * ist. Er ist der eigentliche Beleg: dort steht alles, was zaehlt -
   * Raenge, Namen, Punkte, in voller Aufloesung. Der Rest des
   * Bildschirms war ohnehin nur Spielgrafik, und mit ihm verschwinden
   * nebenbei fremde Discord-Fenster und Browsertabs.
   *
   * Fehlt das Feld, ist der Zuschnitt nicht gelaufen - etwa weil Python
   * nicht eingerichtet war. Dann bleibt es beim Original, solange es
   * lebt.
   */
  readonly ausschnittPfad?: string;
  /**
   * Kennung der PARTIE, abgeleitet aus den Punktzahlen. Siehe
   * rundenKennung() - damit faellt auf, wenn zwei Leute aus derselben
   * Lobby dasselbe Scoreboard einschicken.
   */
  readonly kennung?: string;
  /**
   * Welche Spieler aus dieser Partie hier gewertet werden - als
   * normalisierte Namen (siehe namen.ts).
   *
   * Bei einem Zuschauer ist das genau EINER: sein eigener. Bei einer
   * eigenen Aufnahme sind es alle erkannten. Zusammen mit der Kennung
   * ergibt das die Regel "ein Spieler aus einer Partie zaehlt einmal".
   */
  readonly beansprucht?: readonly string[];
  status: FreigabeStatus;
  bearbeitetVon?: string;
  bearbeitetAm?: number;
  /** Bei Ablehnung: warum. Geht an den Absender zurueck. */
  grund?: string;
}

export interface FreigabeDatei {
  readonly version: 1;
  readonly runden: OffeneRunde[];
}

/* ------------------------------------------------------------------ Laden */

function leseJson(datei: string): FreigabeDatei {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    return { version: 1, runden: [] };
  }

  // BOM abschneiden - dieselbe Vorsicht wie in turnier/jsonstore.js
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  try {
    const daten = JSON.parse(roh) as FreigabeDatei;
    return { version: 1, runden: Array.isArray(daten.runden) ? daten.runden : [] };
  } catch (err) {
    /*
       Kaputte Datei zur Seite legen statt beim naechsten Speichern
       ueberschreiben - genau wie turnier/jsonstore.js. Hier stecken
       Runden drin, die noch niemand gesehen hat.
    */
    const kaputt = datei.replace(/\.json$/, '') + '.defekt-' + Date.now() + '.json';
    try {
      renameSync(datei, kaputt);
      console.error('[mc-ranked] ' + path.basename(datei) + ' ist beschaedigt (' +
        (err as Error).message + ').');
      console.error('[mc-ranked] Die Datei liegt jetzt hier: ' + kaputt);
    } catch {
      console.error('[mc-ranked] ' + path.basename(datei) + ' ist beschaedigt:',
        (err as Error).message);
    }
    return { version: 1, runden: [] };
  }
}

/* --------------------------------------------------------------- Verwaltung */

export class Freigabeliste {
  private runden: OffeneRunde[];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly datei: string) {
    this.runden = leseJson(datei).runden;
  }

  /** Entprellt schreiben, wie makeSaver in turnier/jsonstore.js. */
  private speichern(verzoegerung = 250): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      try {
        mkdirSync(path.dirname(this.datei), { recursive: true });
        const inhalt: FreigabeDatei = { version: 1, runden: this.runden };
        writeFileSync(this.datei, JSON.stringify(inhalt, null, 2), 'utf8');
      } catch (err) {
        console.error('[mc-ranked] Speichern fehlgeschlagen:', (err as Error).message);
      }
    }, verzoegerung);
  }

  /** Sofort schreiben - fuer Tests und zum sauberen Beenden. */
  jetztSpeichern(): void {
    if (this.timer) clearTimeout(this.timer);
    mkdirSync(path.dirname(this.datei), { recursive: true });
    writeFileSync(this.datei, JSON.stringify({ version: 1, runden: this.runden }, null, 2), 'utf8');
  }

  static hashVon(bild: Buffer): string {
    return createHash('sha256').update(bild).digest('hex');
  }

  /**
   * Welche der beanspruchten Spieler sind aus DIESER Partie schon
   * anderswo gewertet?
   *
   * Die Regel ist "ein Spieler aus einer Partie zaehlt einmal", nicht
   * "eine Partie zaehlt einmal". Der Unterschied ist wichtig: sitzen
   * drei Zuschauer in derselben Lobby und schickt jeder sein eigenes
   * Ergebnis, muessen alle drei durchkommen. Nur wer zweimal fuer
   * DENSELBEN Spieler eingeht, wird abgewiesen.
   *
   * Abgelehnte Runden zaehlen nicht: war die erste Einsendung eine
   * Faelschung, muss eine echte danach noch durchkommen - sonst
   * koennte jemand eine Partie blockieren, indem er sie zuerst
   * gefaelscht einschickt.
   */
  schonGewertet(kennung: string, namen: readonly string[]):
    Array<{ name: string; runde: OffeneRunde }> {

    if (!kennung || namen.length === 0) return [];

    const treffer: Array<{ name: string; runde: OffeneRunde }> = [];
    for (const r of this.runden) {
      if (r.kennung !== kennung) continue;
      if (r.status === 'abgelehnt') continue;
      for (const name of namen) {
        if ((r.beansprucht ?? []).includes(name)) treffer.push({ name, runde: r });
      }
    }
    return treffer;
  }

  /**
   * Legt eine Runde zur Freigabe ab.
   *
   * Gibt die vorhandene Runde zurueck, wenn derselbe Screenshot schon da
   * ist - dann ist nichts Neues passiert. Das ist die Idempotenz-Sperre:
   * ein doppelt geschickter Upload darf nicht zweimal zaehlen.
   */
  hinzufuegen(neu: Omit<OffeneRunde, 'id' | 'status'>): { runde: OffeneRunde; neuAngelegt: boolean } {
    const schon = this.runden.find((r) => r.bildHash === neu.bildHash);
    if (schon) return { runde: schon, neuAngelegt: false };

    const runde: OffeneRunde = {
      ...neu,
      id: 'r_' + Math.random().toString(36).slice(2, 10),
      status: 'offen'
    };
    this.runden.push(runde);
    this.speichern();
    return { runde, neuAngelegt: true };
  }

  /**
   * Die letzten Runden EINER Person - fuer ihre eigene Rueckmeldung.
   *
   * Bisher erfuhr ein Zuschauer nie, was aus seiner Einreichung geworden
   * ist: er bekam "zur Freigabe eingereicht" und danach nichts mehr.
   * Wurde abgelehnt, schickte er dasselbe nochmal, weil er den Grund
   * nicht kannte.
   *
   * Zugeordnet wird ueber den beanspruchten INGAME-NAMEN, nicht ueber den
   * Absendernamen: wer sich einen neuen Token holt oder seinen
   * Anzeigenamen aendert, soll seine eigene Historie behalten. Der
   * Absendername zaehlt nur als Rueckfallebene fuer alte Eintraege ohne
   * beansprucht.
   */
  vonPerson(ingameKey: string, absender: string, grenze = 10): OffeneRunde[] {
    const key = String(ingameKey ?? '').trim().toLowerCase();

    return this.runden
      .filter((r) => {
        const beansprucht = r.beansprucht ?? [];
        if (key.length > 0 && beansprucht.includes(key)) return true;
        return beansprucht.length === 0 && r.absender === absender;
      })
      .slice()
      /*
         Nach dem EINGANG sortieren - wann die Runde eingeschickt wurde.

         Hier stand vorher "nach der zuletzt geschehenen Sache", damit
         der Sortierschluessel dieselbe Zahl ist wie die angezeigte Zeit.
         Das war formal richtig und im Gebrauch falsch: eine Runde von
         20:00, die um 21:00 abgelehnt wird, springt damit ueber eine von
         20:30. Fuer den Absender sah es aus, als wuerden Ablehnungen
         nach oben sortiert - und genau so hat er es auch gemeldet.

         Der Eingang ist die einzige Zeit, die sich NIE mehr aendert.
         Damit ist die Liste ein Verlauf der eigenen Einreichungen: sie
         ordnet sich nicht neu, nur weil der Streamer etwas entscheidet.
         Der Status wechselt an Ort und Stelle.

         Der Client zeigt in der Zeitspalte deshalb ebenfalls den Eingang
         (Fenster.cs); wann entschieden wurde, steht beim Aufklappen.
         Sortierschluessel und angezeigte Zeit muessen dieselben bleiben,
         sonst wirkt die Liste unsortiert - dieser Teil der alten
         Begruendung gilt weiter.
      */
      .sort((a, b) => b.eingegangen - a.eingegangen)
      .slice(0, grenze);
  }

  offene(): OffeneRunde[] {
    return this.runden.filter((r) => r.status === 'offen');
  }

  alle(): readonly OffeneRunde[] {
    return this.runden;
  }

  finde(id: string): OffeneRunde | null {
    return this.runden.find((r) => r.id === id) ?? null;
  }

  /**
   * Setzt den Status.
   *
   * Eine bereits bearbeitete Runde wird NICHT noch einmal geaendert -
   * sonst koennte ein zweiter Klick eine abgelehnte Runde nachtraeglich
   * freigeben, oder eine freigegebene doppelt eintragen.
   */
  entscheiden(id: string, status: 'freigegeben' | 'abgelehnt', von: string, grund?: string):
    { ok: true; runde: OffeneRunde } | { ok: false; fehler: string } {

    const runde = this.finde(id);
    if (!runde) return { ok: false, fehler: 'Runde nicht gefunden' };
    if (runde.status !== 'offen') {
      return { ok: false, fehler: 'Runde ist schon ' + runde.status + ' (durch ' +
        (runde.bearbeitetVon ?? 'unbekannt') + ')' };
    }

    runde.status = status;
    runde.bearbeitetVon = von;
    runde.bearbeitetAm = Date.now();
    if (grund !== undefined) runde.grund = grund;
    this.speichern();
    return { ok: true, runde };
  }

  /**
   * Sucht Runden mit demselben Inhalt wie die uebergebene.
   *
   * Ein bearbeiteter Screenshot hat einen anderen Hash, kann aber
   * dieselben Zeilen enthalten - etwa wenn jemand dasselbe Bild neu
   * abspeichert. Diese Warnung ersetzt keine Pruefung, sie macht nur
   * sichtbar, wo man genauer hinsehen sollte.
   */
  aehnliche(runde: OffeneRunde): OffeneRunde[] {
    return this.inhaltsgleiche(runde.zeilen).filter((r) => r.id !== runde.id);
  }

  /**
   * Runden mit exakt denselben gelesenen Zeilen.
   *
   * Wird auch VOR dem Ablegen gebraucht: bei einem Zugang, der sonst
   * direkt durchlaeuft, entscheidet das mit darueber, ob die Runde
   * angehalten wird. Deshalb nimmt es die Zeilen und nicht eine schon
   * abgelegte Runde entgegen.
   */
  inhaltsgleiche(zeilen: readonly RohZeile[]): OffeneRunde[] {
    const kennung = (zs: readonly RohZeile[]) =>
      zs.map((z) => z.rohName + '=' + z.rohPunkte).sort().join('|');
    const meins = kennung(zeilen);
    if (meins.length === 0) return [];
    return this.runden.filter((r) => kennung(r.zeilen) === meins);
  }

  /**
   * Loescht Bilder, die aelter sind als die Frist.
   *
   * Die Eintraege selbst bleiben - man soll spaeter noch sehen koennen,
   * WAS eingereicht und wie entschieden wurde. Nur das Bild geht weg,
   * weil es der einzige Teil ist, der wirklich Platz braucht und
   * personenbezogen sein kann (es zeigt fremde Spielernamen).
   *
   * Offene Runden werden verschont: ohne Bild waere die Freigabe nicht
   * mehr pruefbar, und dann muesste man sie blind entscheiden.
   */
  bilderAufraeumen(stunden = 24, jetzt = Date.now(), verdachtStunden = VERDACHT_BILD_STUNDEN): number {
    const grenze = jetzt - stunden * 60 * 60 * 1000;
    const verdachtGrenze = jetzt - verdachtStunden * 60 * 60 * 1000;
    let weg = 0;
    for (const r of this.runden) {
      if (r.bildGeloescht) continue;
      if (r.status === 'offen') continue;
      /* Geflaggte Runden behalten ihr Bild deutlich laenger. Es ist der
         einzige Beleg dafuer, was jemand eingeschickt hat - und wenn ein
         Muster erst nach Wochen auffaellt, will man die alten Bilder
         nebeneinanderlegen koennen. */
      if ((r.verdacht?.length ?? 0) > 0 ? r.eingegangen > verdachtGrenze : r.eingegangen > grenze) continue;
      try {
        /* NUR das Original. Der Ausschnitt bleibt - er ist der Grund,
           warum das Original ueberhaupt gehen darf. */
        if (existsSync(r.bildPfad)) unlinkSync(r.bildPfad);
        r.bildGeloescht = true;
        weg++;
      } catch (err) {
        console.error('[mc-ranked] Bild nicht loeschbar: ' + r.bildPfad + ' - ' + (err as Error).message);
      }
    }
    if (weg > 0) this.speichern();
    return weg;
  }

  /** Aufraeumen: bearbeitete Runden, die aelter sind als N Tage. */
  aufraeumen(tage = 30): number {
    const grenze = Date.now() - tage * 24 * 60 * 60 * 1000;
    const vorher = this.runden.length;
    this.runden = this.runden.filter(
      (r) => r.status === 'offen' || (r.bearbeitetAm ?? r.eingegangen) > grenze
    );
    const weg = vorher - this.runden.length;
    if (weg > 0) this.speichern();
    return weg;
  }
}

/**
 * Kennung einer Partie aus ihren Punktzahlen.
 *
 * Warum die Punkte und nicht die Namen: die Rangliste zeigt einen
 * FESTEN Endstand, zwei Screenshots derselben Lobby haben also
 * dieselben Zahlen. Die Namen dagegen schwanken beim Lesen
 * ("A.i.R.0" gegen "A.i.R.o", "Iucas" gegen "lucas") - darauf waere
 * kein Verlass.
 *
 * Sortiert, weil die Zeilenreihenfolge nicht garantiert ist. Nicht
 * lesbare Zeilen fliegen raus, sonst haenge die Kennung an einem
 * Lesefehler.
 *
 * Zwei verschiedene Partien mit identischer Punktemenge sind bei
 * Werten wie 2771/2590/1165/922 praktisch ausgeschlossen.
 */
export function rundenKennung(zeilen: readonly RohZeile[]): string {
  const punkte = zeilen
    .map((z) => z.punkte?.punkte)
    .filter((p): p is number => typeof p === 'number')
    .sort((a, b) => a - b);

  // Unter drei lesbaren Zeilen ist die Kennung nicht aussagekraeftig -
  // dann lieber keine, als versehentlich fremde Partien zu verschmelzen.
  if (punkte.length < 3) return '';
  return punkte.join('-');
}

export function ladeFreigabeliste(datei: string): Freigabeliste {
  if (!existsSync(path.dirname(datei))) mkdirSync(path.dirname(datei), { recursive: true });
  return new Freigabeliste(datei);
}

/* =========================================================================
   LESEN DER RANGLISTE MIT EINEM VISION-MODELL

   Tesseract scheitert an diesem Screen: die Liste liegt transparent ueber
   der 3D-Welt, roter Text steht auf rotem Grund, und Namen wie
   "Albert Wesker's Balls" enthalten Leerzeichen und Apostroph. Ein
   Vision-Modell liest das, ein Threshold-Filter nicht.

   Dieses Modul macht ZWEI Dinge und sonst nichts:

     1. die Frage ans Modell zusammenbauen
     2. die Antwort STRENG pruefen

   Punkt 2 ist der eigentliche Zweck. Ein Modell kann alles zurueckgeben -
   Prosa, halbes JSON, erfundene Zeilen. Was hier nicht durch die Pruefung
   kommt, wird zur Rueckfrage, nicht zur Punktzahl. Die Modellantwort ist
   Eingabe, nicht Wahrheit.

   Die eigentliche Wertung passiert danach unveraendert in parse.ts und
   runde.ts, damit Trennzeichen und Verwechslungen genau wie beim Tippen
   von Hand behandelt werden.
   ========================================================================= */

import { parsePunkte, type RohZeile } from './parse.js';

/** Was das Modell pro Zeile liefern soll. */
export interface GeleseneZeile {
  readonly name: string;
  /**
   * Die Punktzahl so, wie sie auf dem Bild steht - als Text, mit
   * Trennzeichen. Also "11 714", nicht 11714.
   *
   * Absichtlich Text: parsePunkte() soll die Trennzeichen entfernen, nicht
   * das Modell. Sonst wandert diese Logik an zwei Stellen und driftet.
   */
  readonly rohPunkte: string | null;
}

/**
 * Ruft das Modell und gibt seine Rohantwort als Text zurueck.
 *
 * Herausgezogen, damit die Pruefung ohne API-Key und ohne Netz getestet
 * werden kann - die Tests schieben hier eine feste Antwort hinein.
 */
export type ModellFrage = (bild: Buffer, medienTyp: string) => Promise<string>;

export class ModellAntwortUnbrauchbar extends Error {
  constructor(grund: string, public readonly rohAntwort: string) {
    super('Antwort des Modells unbrauchbar: ' + grund);
    this.name = 'ModellAntwortUnbrauchbar';
  }
}

/* ------------------------------------------------------------------ Prompt */

export const ANWEISUNG = `Auf dem Bild ist die Rangliste des Spiels MECCHA CHAMELEON.
Sie liegt halbtransparent ueber der Spielwelt, meist unten links, und hat eine
Kopfzeile wie "Rangliste der uebersehenen Dinge".

Lies AUSSCHLIESSLICH diese Rangliste. Jede Zeile besteht aus einer Platznummer
(#1, #2, ...), einem Spielernamen und einer Punktzahl.

Regeln:
- Gib die Punktzahl GENAU so zurueck, wie sie dasteht, als Text mit
  Trennzeichen. Also "11 714", nicht 11714 und nicht 11.714.
- Namen koennen Leerzeichen und Apostrophe enthalten, zum Beispiel
  "Albert Wesker's Balls". Gib den vollen Namen zurueck.
- Wenn eine Zeile von anderem Text ueberlagert ist oder du die Punktzahl
  nicht sicher lesen kannst, setze rohPunkte auf null. Rate NICHT.
- Wenn du einen Namen nicht sicher lesen kannst, gib ihn trotzdem so gut wie
  moeglich zurueck - der Abgleich passiert spaeter.
- Erfinde NIEMALS Namen oder Zahlen. Gib nur zurueck, was wirklich dasteht.
- Ist auf dem Bild GAR KEINE Rangliste zu sehen, gib eine leere Liste
  zurueck: {"zeilen": []}. Das ist eine richtige Antwort, kein Fehler.
- Eine Lobby hat hoechstens 10 Spieler. Mehr als 10 Zeilen kann es nicht
  geben. Wiederhole keine Zeile.
- Zaehle die Namensschilder der Spieler in der 3D-Welt NICHT mit. Nur die
  Rangliste.

Antworte mit reinem JSON, ohne Markdown-Zaun und ohne Erklaerung. Eine
Liste unter dem Schluessel "zeilen", eine Zeile pro Ranglisteneintrag:

{"zeilen": [{"name": "...", "rohPunkte": "..."}, {"name": "...", "rohPunkte": "..."}]}

Gib ALLE Zeilen der Rangliste zurueck, nicht nur die erste.`;

/* ------------------------------------------------------------------ Pruefung */

/*
   Eine Meccha-Lobby hat laut Spiel hoechstens 10 Spieler. Etwas Luft fuer
   eine Kopfzeile, die faelschlich als Zeile durchgeht - alles darueber ist
   keine Rangliste mehr.

   Der Grund ist ein echter Vorfall: auf einem Bildschirm ohne Rangliste hat
   das Modell eine erfunden (Resident-Evil-Figuren) und sich dann in einer
   Zeile festgefahren, die es elfmal wiederholt hat. Ohne diese Sperre
   haengt die Erkennung solcher Ausfaelle allein daran, dass die erfundenen
   Namen zufaellig nicht in der Kartei stehen. Das ist zu wenig.
*/
export const MAX_ZEILEN = 12;

/** Ab so vielen gleichen Zeilen gilt die Antwort als entgleist. */
export const MAX_WIEDERHOLUNG = 3;

/**
 * Schneidet einen ```json-Zaun weg, falls das Modell doch einen setzt.
 *
 * Nicht schoen, aber die Alternative waere, an einem Formatierungsdetail
 * eine ganze Runde zu verlieren.
 */
function schaeleJson(text: string): string {
  const zaun = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (zaun?.[1] ?? text).trim();
}

/**
 * Prueft die Modellantwort und gibt saubere Zeilen zurueck.
 *
 * Wirft ModellAntwortUnbrauchbar, wenn die Struktur nicht stimmt. Einzelne
 * kaputte Zeilen werden dagegen NICHT weggeworfen, sondern mit
 * rohPunkte: null durchgelassen - so landen sie als Rueckfrage beim
 * Menschen statt still zu verschwinden.
 */
export function pruefeAntwort(roh: string): GeleseneZeile[] {
  let daten: unknown;
  try {
    daten = JSON.parse(schaeleJson(roh));
  } catch (err) {
    throw new ModellAntwortUnbrauchbar('kein gueltiges JSON (' + (err as Error).message + ')', roh);
  }

  /*
     Zwei Formen werden akzeptiert: die blanke Liste und ein Objekt mit
     dem Schluessel "zeilen". Ollamas JSON-Modus neigt dazu, ein Objekt zu
     bauen statt einer Liste - daran soll keine Runde scheitern.
  */
  if (!Array.isArray(daten) && typeof daten === 'object' && daten !== null) {
    const huelle = (daten as { zeilen?: unknown }).zeilen;
    if (Array.isArray(huelle)) daten = huelle;
  }

  if (!Array.isArray(daten)) {
    throw new ModellAntwortUnbrauchbar('erwartet wurde eine Liste', roh);
  }

  const zeilen: GeleseneZeile[] = [];

  for (const eintrag of daten) {
    if (typeof eintrag !== 'object' || eintrag === null) {
      throw new ModellAntwortUnbrauchbar('ein Listeneintrag ist kein Objekt', roh);
    }
    const e = eintrag as { name?: unknown; rohPunkte?: unknown };

    if (typeof e.name !== 'string' || e.name.trim().length === 0) {
      throw new ModellAntwortUnbrauchbar('ein Eintrag hat keinen brauchbaren Namen', roh);
    }

    /*
       Zahlen akzeptieren wir, obwohl wir Text angefordert haben - manche
       Antworten kommen so, und daran eine Runde scheitern zu lassen waere
       kleinlich. String() bringt es zurueck in die Form, die parsePunkte
       erwartet.
    */
    let rohPunkte: string | null;
    if (e.rohPunkte === null || e.rohPunkte === undefined) {
      rohPunkte = null;
    } else if (typeof e.rohPunkte === 'string') {
      rohPunkte = e.rohPunkte;
    } else if (typeof e.rohPunkte === 'number' && Number.isFinite(e.rohPunkte)) {
      rohPunkte = String(e.rohPunkte);
    } else {
      // Weder Text noch Zahl noch null: die Zeile ist unbrauchbar, aber sie
      // soll als Rueckfrage sichtbar bleiben.
      rohPunkte = null;
    }

    zeilen.push({ name: e.name.trim(), rohPunkte });
  }

  /*
     Zu viele Zeilen: das kann keine Lobby sein. Die ganze Antwort
     verwerfen statt die ersten zehn zu nehmen - wenn das Modell hier
     danebenliegt, ist auch der Rest nicht vertrauenswuerdig.
  */
  if (zeilen.length > MAX_ZEILEN) {
    throw new ModellAntwortUnbrauchbar(
      zeilen.length + ' Zeilen - eine Lobby hat hoechstens 10. Vermutlich war keine Rangliste im Bild.', roh);
  }

  /*
     Dieselbe Zeile immer wieder: das typische Festfahren eines
     Sprachmodells. Auch das verwirft die ganze Antwort.
  */
  const haeufigkeit = new Map<string, number>();
  for (const z of zeilen) {
    const schluessel = z.name + '|' + (z.rohPunkte ?? '');
    const n = (haeufigkeit.get(schluessel) ?? 0) + 1;
    if (n >= MAX_WIEDERHOLUNG) {
      throw new ModellAntwortUnbrauchbar(
        'Zeile "' + z.name + '" kommt ' + n + ' mal identisch vor - das Modell hat sich festgefahren',
        roh);
    }
    haeufigkeit.set(schluessel, n);
  }

  return zeilen;
}

/* ------------------------------------------------------- Uebergang zu parse.ts */

/**
 * Macht aus den gelesenen Zeilen die RohZeile-Form, mit der runde.ts
 * arbeitet.
 *
 * Der Umweg ueber parsePunkte() ist Absicht: Trennzeichen und
 * Zeichenverwechslungen werden damit genauso behandelt wie bei jeder
 * anderen Quelle, inklusive der Dezimalfalle aus turnier/listen.js:108.
 */
export function alsRohZeilen(gelesen: readonly GeleseneZeile[]): RohZeile[] {
  return gelesen.map((g, i) => ({
    zeile: i + 1,
    rohName: g.name,
    rohPunkte: g.rohPunkte ?? '',
    punkte: g.rohPunkte === null ? null : parsePunkte(g.rohPunkte)
  }));
}

/** Bild lesen und in RohZeilen umwandeln - der uebliche Weg. */
export async function leseListe(
  bild: Buffer,
  medienTyp: string,
  frage: ModellFrage
): Promise<RohZeile[]> {
  const antwort = await frage(bild, medienTyp);
  return alsRohZeilen(pruefeAntwort(antwort));
}

/* =========================================================================
   PARSEN DER OCR-AUSGABE

   Eingang sind zwei Textbloecke: die Namensspalte und die Punktespalte,
   getrennt erkannt (die Punktespalte mit Ziffern-Whitelist, siehe ocr.ts).
   Ausgang sind Zeilen aus Name und Punktzahl.

   Weil die PUNKTE gewertet werden, ist eine falsch gelesene Zahl der
   schlimmste Fehler, den dieses Modul machen kann. Deshalb gilt hier
   durchgehend: im Zweifel null zurueckgeben und die Zeile zur Rueckfrage
   schicken, nie eine plausibel aussehende Zahl erfinden.

   -------------------------------------------------------------------------
   FALLE im Turnier-Server, die hier abgefangen wird:

   listen.js:108 parsePoints() macht  replace(',', '.')  und dann Number().
   Ein Tausenderpunkt oder -komma wuerde dort also zur Dezimalzahl:
   "10,579" -> 10.579 statt 10579, "10.579" -> 10.579. Aus 10579 Punkten
   wuerden zehn.

   Deshalb geht an den Server ausschliesslich eine saubere Ganzzahl. Die
   Trennzeichen werden HIER entfernt, nicht dort.
   ========================================================================= */

export interface ParsePunkte {
  readonly punkte: number;
  /**
   * true, wenn nur mit Zeichenersetzung eine Zahl herauskam (O statt 0
   * und dergleichen). Solche Zeilen gehen in die Rueckfrage, auch wenn der
   * Name sicher zugeordnet wurde.
   */
  readonly unsicher: boolean;
}

/*
   Verwechslungen, die Tesseract bei Ziffern typischerweise macht. Wird nur
   angewandt, wenn ohne Ersetzung gar keine Zahl herauskommt - und das
   Ergebnis gilt danach als unsicher. Blind zu ersetzen waere schlimmer als
   nachzufragen: aus einem Namen, der versehentlich in der Punktespalte
   landet, wuerde sonst eine Punktzahl.
*/
const VERWECHSLUNGEN: ReadonlyMap<string, string> = new Map([
  ['o', '0'], ['O', '0'], ['Q', '0'], ['D', '0'],
  ['l', '1'], ['I', '1'], ['|', '1'], ['i', '1'],
  ['z', '2'], ['Z', '2'],
  ['s', '5'], ['S', '5'],
  ['b', '6'], ['G', '6'],
  ['t', '7'], ['T', '7'],
  ['B', '8'],
  ['g', '9'], ['q', '9']
]);

/** Alles, was ein Tausendertrennzeichen sein kann. */
const TRENNER = /[.,  \s'`´]/g;

/**
 * Liest eine Punktzahl aus einem OCR-Schnipsel.
 *
 * Gibt null zurueck, wenn nichts Verlaessliches herauskommt.
 */
export function parsePunkte(roh: string): ParsePunkte | null {
  if (typeof roh !== 'string') return null;

  // Trennzeichen weg, bevor irgendetwas anderes passiert - siehe Kopf.
  const ohneTrenner = roh.replace(TRENNER, '');
  if (ohneTrenner.length === 0) return null;

  // Ein Minus vorne kaeme nur aus einem Lesefehler: Meccha vergibt keine
  // negativen Punkte. Also nicht "korrigieren", sondern ablehnen.
  if (/^[-+]/.test(ohneTrenner)) return null;

  if (/^\d+$/.test(ohneTrenner)) {
    return macheErgebnis(ohneTrenner, false);
  }

  // Zweiter Versuch mit Zeichenersetzung.
  let ersetzt = '';
  for (const zeichen of ohneTrenner) {
    const ziffer = VERWECHSLUNGEN.get(zeichen);
    if (ziffer !== undefined) {
      ersetzt += ziffer;
    } else if (/\d/.test(zeichen)) {
      ersetzt += zeichen;
    } else {
      // Ein Zeichen, das nicht einmal als Verwechslung durchgeht: dann ist
      // das kein Zahlenfeld, sondern etwas anderes.
      return null;
    }
  }

  if (ersetzt.length === 0) return null;
  return macheErgebnis(ersetzt, true);
}

function macheErgebnis(ziffern: string, unsicher: boolean): ParsePunkte | null {
  // Fuehrende Nullen sind bei Punktzahlen ein Lesefehler, nicht ein Wert.
  const n = Number(ziffern);
  if (!Number.isSafeInteger(n)) return null;
  return { punkte: n, unsicher: unsicher || /^0\d/.test(ziffern) };
}

/* -------------------------------------------------------------------- Zeilen */

export interface RohZeile {
  /** Zeilennummer im Scoreboard, ab 1 - nur zur Anzeige bei Rueckfragen. */
  readonly zeile: number;
  readonly rohName: string;
  readonly rohPunkte: string;
  /** null, wenn die Punkte nicht lesbar waren. */
  readonly punkte: ParsePunkte | null;
}

export class SpaltenPassenNicht extends Error {
  constructor(
    public readonly namenZeilen: number,
    public readonly punkteZeilen: number
  ) {
    super(
      'Namensspalte hat ' + namenZeilen + ' Zeilen, Punktespalte ' + punkteZeilen +
      ' - die Zuordnung Name zu Punkten waere geraten.'
    );
    this.name = 'SpaltenPassenNicht';
  }
}

/** Leere Zeilen und Rauschen wegwerfen, Rest getrimmt zurueckgeben. */
function zeilen(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter((z) => z.length > 0);
}

/**
 * Fuegt Namens- und Punktespalte zu Zeilen zusammen.
 *
 * Wirft SpaltenPassenNicht, wenn die Zeilenzahlen auseinandergehen. Das ist
 * Absicht und der wichtigste Schutz dieses Moduls: waeren es 9 Namen und
 * 10 Punktzahlen, wuerde ab der Fehlstelle JEDER Name die Punkte seines
 * Nachbarn bekommen. Solche Runden gehoeren komplett in die Rueckfrage,
 * nicht teilweise in die Liste.
 */
export function parseZeilen(namenText: string, punkteText: string): RohZeile[] {
  const namen = zeilen(namenText);
  const punkte = zeilen(punkteText);

  if (namen.length !== punkte.length) {
    throw new SpaltenPassenNicht(namen.length, punkte.length);
  }

  return namen.map((rohName, i) => {
    const rohPunkte = punkte[i]!;
    return {
      zeile: i + 1,
      rohName,
      rohPunkte,
      punkte: parsePunkte(rohPunkte)
    };
  });
}

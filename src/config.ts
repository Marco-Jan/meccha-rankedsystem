/* =========================================================================
   KONFIGURATION

   Zwei Sorten Einstellungen, absichtlich getrennt:

   - Umgebung (wo liegen die Daten, welcher Port, welcher Schluessel)
     kommt aus Env-Variablen, gesetzt in EINSTELLUNGEN.bat. Bewusst ohne
     dotenv - eine Abhaengigkeit weniger, und die .bat sieht man an.

   - Crop-Koordinaten kommen aus einer JSON-Datei, die das Kalibrier-CLI
     schreibt. Die aendern sich beim Einrichten dauernd und gehoeren
     deshalb nicht in eine .bat, die man von Hand editiert.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HIER = path.dirname(fileURLToPath(import.meta.url));
export const PROJEKT_DIR = path.join(HIER, '..');
export const CROP_DATEI = path.join(PROJEKT_DIR, 'config', 'crop.json');

/**
 * Was in der ausgelieferten .exe steckt: Adresse und Fassung.
 *
 * Dieselbe Datei, aus der BAUEN.bat den Client baut - damit meldet der
 * Server genau die Fassung, die er auch zum Herunterladen anbietet.
 * Faellt sie weg, ist das kein Fehler: dann gibt es eben keinen
 * Versionshinweis.
 */
export function verteilung(): { server: string; clientVersion: string; discord: string } {
  try {
    const roh = readFileSync(path.join(PROJEKT_DIR, 'config', 'verteilung.json'), 'utf8');
    const d = JSON.parse(roh.charCodeAt(0) === 0xfeff ? roh.slice(1) : roh) as {
      server?: string; clientVersion?: string; discord?: string;
    };
    return {
      server: String(d.server ?? ''),
      clientVersion: String(d.clientVersion ?? ''),
      discord: String(d.discord ?? '')
    };
  } catch {
    return { server: '', clientVersion: '', discord: '' };
  }
}
export const WARTESCHLANGE_DIR = path.join(PROJEKT_DIR, 'warteschlange');

/* ------------------------------------------------------------------- Daten */

/**
 * Wo die Laufzeitdaten liegen: Rangliste, Konten, Tokens, Freigabeliste
 * und die hochgeladenen Bilder.
 *
 * Hier stand frueher stattdessen die Adresse des Turnier-Servers, aus
 * dem die Namensliste kam und in den die Punkte gingen. Seit dem
 * 20.08.2026 ist mc-ranked eigenstaendig - es gibt nichts mehr
 * anzuschliessen, nur noch einen Ordner. Siehe UMBAU.md.
 */
export const DATEN_DIR = process.env.MC_DATEN || path.join(PROJEKT_DIR, 'daten');

/* ------------------------------------------------------------------ Schwellen */

/**
 * Ab dieser Zuversicht wird automatisch eingetragen, darunter gibt es eine
 * Rueckfrage. Siehe namen.ts fuer die Werte je Zuordnungsart.
 */
export const MIN_CONFIDENCE = Number(process.env.MC_MIN_CONFIDENCE || 0.7);

/* -------------------------------------------------------------------- Crop */

export interface CropBereich {
  /** Pixel von links. */
  readonly x: number;
  /** Pixel von oben. */
  readonly y: number;
  readonly breite: number;
  readonly hoehe: number;
}

export interface CropConfig {
  /**
   * Aufloesung, fuer die die Koordinaten kalibriert wurden. Weicht ein
   * Screenshot davon ab, sind die Koordinaten falsch - dann lieber
   * abbrechen als blind schneiden.
   */
  readonly referenz: { readonly breite: number; readonly hoehe: number };
  /** Der ganze Scoreboard-Block. */
  readonly scoreboard: CropBereich;
  /** Namensspalte, relativ zum Scoreboard-Block. */
  readonly namenSpalte: CropBereich;
  /** Punktespalte, relativ zum Scoreboard-Block. */
  readonly punkteSpalte: CropBereich;
  /** Hoehe einer Zeile in Pixeln, zum Aufteilen der Spalten. */
  readonly zeilenHoehe: number;
}

/**
 * Liest die kalibrierten Koordinaten.
 *
 * Bewusst ohne Standardwerte: geratene Crop-Koordinaten wuerden Muell
 * liefern, der aussieht wie ein Ergebnis. Ohne Kalibrierung soll der
 * Feeder klar sagen, dass er nicht einsatzbereit ist.
 */
export function ladeCropConfig(datei = CROP_DATEI): CropConfig {
  let roh: string;
  try {
    roh = readFileSync(datei, 'utf8');
  } catch {
    throw new Error(
      'Keine Crop-Konfiguration gefunden (' + datei + '). ' +
      'Das Kalibrier-Werkzeug fehlt noch - es braucht echte Screenshots. ' +
      'Bis dahin geht das ganze Bild an das Modell, was ohne Crop ebenfalls ' +
      'funktioniert, nur teurer und ungenauer ist.'
    );
  }

  // BOM abschneiden - dieselbe Vorsicht wie in turnier/jsonstore.js
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);

  const daten = JSON.parse(roh) as CropConfig;
  pruefeCropConfig(daten);
  return daten;
}

function pruefeCropConfig(c: CropConfig): void {
  const bereiche: ReadonlyArray<[string, CropBereich]> = [
    ['scoreboard', c.scoreboard],
    ['namenSpalte', c.namenSpalte],
    ['punkteSpalte', c.punkteSpalte]
  ];

  for (const [name, b] of bereiche) {
    if (!b || !Number.isFinite(b.breite) || !Number.isFinite(b.hoehe) || b.breite <= 0 || b.hoehe <= 0) {
      throw new Error('Crop-Konfiguration: Bereich "' + name + '" fehlt oder ist leer.');
    }
  }
  if (!c.referenz || !(c.referenz.breite > 0) || !(c.referenz.hoehe > 0)) {
    throw new Error('Crop-Konfiguration: Referenzauflaesung fehlt.');
  }
  if (!(c.zeilenHoehe > 0)) {
    throw new Error('Crop-Konfiguration: zeilenHoehe fehlt oder ist 0.');
  }
}

/* =========================================================================
   AUSSCHNITT - der Ranglisten-Block als kleines Bild.

   Ein hochgeladener Screenshot ist rund 2 MB gross. Alle aufzuheben
   hiesse bei zwei Streams die Woche etwa 16 GB im Jahr, auf einer Platte
   mit 24 GB, auf der schon andere Dienste liegen. Deshalb werden
   Originale nach ein paar Tagen geloescht.

   Damit waere aber auch der Beleg weg - und genau den will man beim
   Nachsehen haben. Also wird beim Hochladen der Ranglisten-Block
   ausgeschnitten und dauerhaft aufgehoben: ~55 KB statt ~2 MB, in voller
   Aufloesung. Achtzigmal kleiner, und jede Ziffer bleibt scharf.

   Gerechnet auf ein Jahr: 8 000 Ausschnitte sind rund 450 MB. Das laesst
   sich liegen lassen, ohne je hinzusehen.

   -------------------------------------------------------------------------
   WARUM EIN EIGENES SKRIPT UND NICHT DER LESER

   lies_rangliste.py hat das Bild ohnehin offen, es waere also nichts
   gespart. Aber es laedt dabei die OCR-Modelle - ein paar hundert
   Megabyte -, und der Ausschnitt braucht davon nichts. schneide_aus.py
   importiert nur Pillow und startet in Bruchteilen einer Sekunde.

   Wichtiger noch: es ist damit UNABHAENGIG. Schlaegt der Zuschnitt fehl,
   ist die Runde trotzdem gelesen und eingereicht. Umgekehrt genauso.
   Zwei Dinge, die nichts miteinander zu tun haben, sollen sich nicht
   gegenseitig mitreissen.
   ========================================================================= */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PYTHON, GEOMETRIE } from './rapidocr.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJEKT = path.join(HIER, '..');

export const SCHNEIDE_SKRIPT = path.join(PROJEKT, 'python', 'schneide_aus.py');

/**
 * Schneidet den Ranglisten-Block aus und legt ihn als JPEG ab.
 *
 * Gibt den Zielpfad zurueck, wenn es geklappt hat, sonst null.
 *
 * WIRFT NIE. Der Ausschnitt ist eine Zugabe: er macht das Nachsehen
 * spaeter bequem, aber ohne ihn ist keine Runde verloren. Eine fehlende
 * Python-Umgebung oder ein Bild in einem Format, das Pillow nicht mag,
 * darf einen Upload nicht kippen - der Zuschauer haette davon nur einen
 * Fehler, den er nicht versteht und nicht beheben kann.
 */
export function schneideAus(
  bildPfad: string,
  zielPfad: string,
  python = PYTHON,
  skript = SCHNEIDE_SKRIPT
): string | null {
  try {
    if (!existsSync(python) || !existsSync(skript) || !existsSync(bildPfad)) return null;

    mkdirSync(path.dirname(zielPfad), { recursive: true });

    const argumente = [skript, bildPfad, zielPfad];
    if (existsSync(GEOMETRIE)) argumente.push('--geometrie', GEOMETRIE);

    execFileSync(python, argumente, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      // Sonst schreibt Python auf einer deutschen Konsole in cp1252.
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      // Das Skript importiert lies_rangliste fuer die Geometrie - beide
      // liegen im selben Ordner, also von dort aus starten.
      cwd: path.dirname(skript)
    });

    // Nur melden, was auch wirklich da ist. Ein leeres Ergebnis waere
    // schlimmer als keins: es saehe nach einem Beleg aus.
    return existsSync(zielPfad) && statSync(zielPfad).size > 0 ? zielPfad : null;
  } catch {
    return null;
  }
}

/** Der uebliche Zielpfad zu einem Bild: derselbe Name, .jpg, im Unterordner. */
export function ausschnittPfadZu(bildPfad: string, ordner?: string): string {
  const name = path.basename(bildPfad).replace(/\.[^.]+$/, '') + '.jpg';
  return path.join(ordner ?? path.join(path.dirname(bildPfad), 'ausschnitte'), name);
}

/* =========================================================================
   RAPIDOCR - Lesen ohne KI und ohne Grafikkarte.

   Ruft python/lies_rangliste.py auf. Das Skript nutzt drei Eigenschaften
   des Spiels, die der Nutzer bestaetigt hat: die Schrift ist immer weiss
   oder rot, die Spalten stehen fest, die Zeilen stehen fest. Damit
   braucht es kein Sprachmodell.

   Gemessen am echten Screenshot, beide am selben Bild:

     RapidOCR   10 von 10 Punktzahlen richtig,  3,1 s,  keine GPU
     qwen2.5vl  10 von 10 Punktzahlen richtig, 94,0 s,  12 GB VRAM

   Deshalb ist das hier der Standardweg und das Modell die Ausweichloesung.

   Dieses Modul erfuellt dieselbe ModellFrage-Schnittstelle wie ollama.ts.
   Die strenge Pruefung der Antwort in leser.ts gilt unveraendert - sie
   interessiert sich nicht dafuer, wer geantwortet hat.
   ========================================================================= */

import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ModellFrage } from './leser.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJEKT = path.join(HIER, '..');

export const SKRIPT = path.join(PROJEKT, 'python', 'lies_rangliste.py');

/**
 * Wo liegt das Python mit rapidocr?
 *
 * Standard ist die venv im Projekt (siehe python/README.md). Wer ein
 * anderes Python nutzen will, setzt MC_PYTHON.
 */
export const PYTHON = process.env.MC_PYTHON ||
  path.join(PROJEKT, '.venv', 'Scripts', 'python.exe');

/** Optionale, selbst ausgemessene Geometrie statt der eingebauten. */
export const GEOMETRIE = process.env.MC_GEOMETRIE ||
  path.join(PROJEKT, 'config', 'geometrie.json');

export class RapidOcrFehlt extends Error {
  constructor(grund: string) {
    super(
      'RapidOCR nicht einsatzbereit: ' + grund + '. ' +
      'Einrichten: siehe python/README.md, oder MC_PYTHON auf ein Python ' +
      'mit rapidocr-onnxruntime setzen.'
    );
    this.name = 'RapidOcrFehlt';
  }
}

/**
 * Gibt eine ModellFrage zurueck, die ueber Python liest.
 *
 * Der Bildpuffer wird in eine temporaere Datei geschrieben, weil das
 * Python-Skript einen Dateipfad erwartet - ueber stdin waere es eine
 * Base64-Runde mehr ohne Gewinn.
 */
export function rapidocrFrage(python = PYTHON, skript = SKRIPT): ModellFrage {
  return async (bild: Buffer, medienTyp: string): Promise<string> => {
    if (!existsSync(python)) throw new RapidOcrFehlt('Python nicht gefunden unter ' + python);
    if (!existsSync(skript)) throw new RapidOcrFehlt('Skript nicht gefunden unter ' + skript);

    const endung = medienTyp.includes('jpeg') ? '.jpg' : '.png';
    const dir = path.join(tmpdir(), 'mc-ranked-ocr');
    mkdirSync(dir, { recursive: true });
    const datei = path.join(dir, 'lesen-' + process.pid + '-' + Date.now() + endung);

    writeFileSync(datei, bild);
    try {
      const argumente = [skript, datei];
      if (existsSync(GEOMETRIE)) argumente.push('--geometrie', GEOMETRIE);

      const ausgabe = execFileSync(python, argumente, {
        encoding: 'utf8',
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
        // Ohne das schreibt Python auf einer deutschen Windows-Konsole in
        // cp1252 und stolpert ueber jeden Namen mit Sonderzeichen.
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
      });

      /*
         RapidOCR schreibt beim ersten Aufruf Hinweise nach stdout, die kein
         JSON sind. Deshalb ab der ersten geschweiften Klammer schneiden
         statt die ganze Ausgabe zu parsen.
      */
      const start = ausgabe.indexOf('{');
      if (start < 0) throw new RapidOcrFehlt('keine JSON-Ausgabe: ' + ausgabe.slice(0, 300));
      return ausgabe.slice(start);
    } catch (err) {
      if (err instanceof RapidOcrFehlt) throw err;
      throw new RapidOcrFehlt((err as Error).message.slice(0, 300));
    } finally {
      // Aufraeumen, aber ein Fehler dabei darf die Runde nicht kippen.
      try { unlinkSync(datei); } catch { /* egal */ }
    }
  };
}

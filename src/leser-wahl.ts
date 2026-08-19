/* =========================================================================
   WELCHER LESER?

   Es gibt zwei, beide erfuellen dieselbe ModellFrage-Schnittstelle:

     rapidocr  - Python, CPU, keine Grafikkarte, rund 3 Sekunden
     ollama    - Vision-Modell, braucht ~12 GB VRAM, rund 5 Sekunden warm

   Standard ist rapidocr. Am selben Screenshot lasen beide 10 von 10
   Punktzahlen richtig; die Version ohne Grafikkarte ist damit die
   vernuenftige Vorgabe, weil sie auf jedem Rechner laeuft.

   Ollama bleibt als Ausweichloesung, falls RapidOCR an einem Bild
   scheitert - etwa wenn das Spiel sein Layout aendert und die
   ausgemessene Geometrie nicht mehr passt. Das Modell braucht keine
   Geometrie, es sieht einfach hin.
   ========================================================================= */

import type { ModellFrage } from './leser.js';
import { rapidocrFrage } from './rapidocr.js';
import { ollamaFrage, OLLAMA_MODELL } from './ollama.js';

export type LeserName = 'rapidocr' | 'ollama';

export const LESER: LeserName =
  (process.env.MC_LESER || '').toLowerCase() === 'ollama' ? 'ollama' : 'rapidocr';

export function waehleLeser(name: LeserName = LESER): ModellFrage {
  return name === 'ollama' ? ollamaFrage() : rapidocrFrage();
}

/** Fuer die Anzeige in den CLIs. */
export function leserBeschreibung(name: LeserName = LESER): string {
  return name === 'ollama'
    ? 'ollama / ' + OLLAMA_MODELL + ' (braucht Grafikkarte)'
    : 'rapidocr (Python, CPU)';
}

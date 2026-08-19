/* =========================================================================
   OLLAMA - das Vision-Modell laeuft lokal.

   Kein API-Key, keine laufenden Kosten, kein Internet noetig. Ollama liegt
   ohnehin schon auf der Kiste (Port 11434), und zwei Vision-Modelle sind
   installiert.

   Dieses Modul ist bewusst duenn: es erfuellt nur die ModellFrage-
   Schnittstelle aus leser.ts. Die gesamte Pruefung der Antwort passiert
   dort und ist unabhaengig davon, WER geantwortet hat. Ein Modellwechsel
   - oder spaeter doch ein Cloud-Dienst - ist damit ein Einzeiler.
   ========================================================================= */

import { ANWEISUNG, type ModellFrage } from './leser.js';

export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

/*
   qwen2.5vl ist unter den lokal verfuegbaren Modellen das staerkste beim
   Lesen von Text aus Bildern - genau der Fall hier. llama3.2-vision ist
   die Alternative, falls es hakt.
*/
export const OLLAMA_MODELL = process.env.OLLAMA_MODELL || 'qwen2.5vl:7b';

/*
   Wie lange Ollama das Modell nach der letzten Frage geladen laesst.

   Der Standard sind 5 Minuten. Zwischen zwei Runden liegt im Stream oft
   mehr, und dann kostet das Nachladen des 12-GB-Modells rund 30 Sekunden -
   gemessen: geladen 2 s pro Runde, nachgeladen 30 bis 50 s.

   Eine Stunde deckt eine Streamsession ab. Der Preis ist belegter
   Grafikspeicher; wer den fuer das Spiel braucht, setzt OLLAMA_KEEPALIVE
   kleiner oder auf '5m' fuer das alte Verhalten.
*/
export const OLLAMA_KEEPALIVE = process.env.OLLAMA_KEEPALIVE || '60m';

/*
   Ein echtes JSON-Schema statt nur format:'json'. Ohne das liefert Ollama
   gern ein einzelnes Objekt mit der ERSTEN Zeile, statt aller Zeilen -
   genau das ist beim ersten Versuch passiert.
*/
const SCHEMA = {
  type: 'object',
  properties: {
    zeilen: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rohPunkte: { type: ['string', 'null'] }
        },
        required: ['name', 'rohPunkte']
      }
    }
  },
  required: ['zeilen']
} as const;

export class OllamaNichtErreichbar extends Error {
  constructor(url: string, grund: string) {
    super(
      'Ollama nicht erreichbar (' + url + '): ' + grund +
      '. Laeuft der Dienst? Pruefen mit:  ollama list'
    );
    this.name = 'OllamaNichtErreichbar';
  }
}

/**
 * Fragt das lokale Vision-Modell.
 *
 * temperature 0: bei OCR wollen wir dieselbe Antwort fuer dasselbe Bild.
 * Kreativitaet waere hier ein Fehler, kein Merkmal.
 *
 * format 'json' zwingt Ollama zu wohlgeformtem JSON. Die Pruefung in
 * leser.ts bleibt trotzdem streng - das Format sagt nichts darueber, ob
 * der INHALT stimmt.
 */
export function ollamaFrage(
  modell = OLLAMA_MODELL,
  url = OLLAMA_URL
): ModellFrage {
  return async (bild: Buffer, _medienTyp: string): Promise<string> => {
    let res: Response;
    try {
      res = await fetch(url + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modell,
          keep_alive: OLLAMA_KEEPALIVE,
          stream: false,
          format: SCHEMA,
          options: { temperature: 0 },
          messages: [{
            role: 'user',
            content: ANWEISUNG,
            images: [bild.toString('base64')]
          }]
        })
      });
    } catch (err) {
      throw new OllamaNichtErreichbar(url, (err as Error).message);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OllamaNichtErreichbar(url, 'HTTP ' + res.status + ' ' + text.slice(0, 200));
    }

    const daten = (await res.json()) as { message?: { content?: string } };
    const inhalt = daten.message?.content;
    if (typeof inhalt !== 'string' || inhalt.length === 0) {
      throw new OllamaNichtErreichbar(url, 'Antwort ohne Inhalt');
    }
    return inhalt;
  };
}

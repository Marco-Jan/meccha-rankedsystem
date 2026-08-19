/* =========================================================================
   LIES - ein Bild durch das Vision-Modell schicken und anzeigen, was
   herauskommt. Ohne Turnier-Server, ohne Eintragen.

   Zum Ausprobieren und zum Vergleichen von Modellen:
     npm run lies -- bild.png
     npm run lies -- bild.png --modell llama3.2-vision:latest

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { pruefeAntwort, alsRohZeilen } from '../leser.js';
import { ollamaFrage } from '../ollama.js';
import { waehleLeser, leserBeschreibung, LESER, type LeserName } from '../leser-wahl.js';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const datei = argv.find((a) => !a.startsWith('--'));
  const mi = argv.indexOf('--modell');
  const modell = mi >= 0 ? argv[mi + 1] : undefined;
  // --modell impliziert ollama - sonst waere die Angabe wirkungslos.
  const li = argv.indexOf('--leser');
  const leser: LeserName = modell ? 'ollama'
    : ((argv[li + 1] as LeserName) ?? LESER);

  if (!datei) {
    console.log('  Aufruf: npm run lies -- <bild> [--modell <name>]');
    process.exitCode = 1;
    return;
  }

  const bild = readFileSync(datei);
  console.log('');
  console.log('  Bild   : ' + datei + ' (' + (bild.length / 1024).toFixed(0) + ' KB)');
  console.log('  Leser  : ' + (modell ? 'ollama / ' + modell : leserBeschreibung(leser)));
  console.log('  ... laeuft');

  const start = Date.now();
  const frage = modell ? ollamaFrage(modell) : waehleLeser(leser);
  const roh = await frage(bild, 'image/jpeg');
  const dauer = ((Date.now() - start) / 1000).toFixed(1);

  console.log('');
  console.log('  Rohantwort nach ' + dauer + ' s:');
  console.log('  ' + roh.slice(0, 800).replace(/\n/g, '\n  '));
  console.log('');

  try {
    const zeilen = alsRohZeilen(pruefeAntwort(roh));
    console.log('  GEPARST (' + zeilen.length + ' Zeilen):');
    for (const z of zeilen) {
      const p = z.punkte ? String(z.punkte.punkte) + (z.punkte.unsicher ? ' (unsicher)' : '') : 'NICHT LESBAR';
      console.log('    ' + String(z.zeile).padStart(2) + '. ' + z.rohName.padEnd(24) + z.rohPunkte.padStart(9) + '  -> ' + p);
    }
  } catch (err) {
    console.log('  PRUEFUNG FEHLGESCHLAGEN: ' + (err as Error).message);
  }
  console.log('');
}

main().catch((err: unknown) => {
  console.error('  FEHLER: ' + (err as Error).message);
  process.exitCode = 1;
});

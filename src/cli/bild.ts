/* =========================================================================
   BILD - nur einen Screenshot machen, sonst nichts.

   Braucht KEINEN Turnier-Server und KEIN Modell. Gedacht zum Kalibrieren
   und zum Schicken von Beispielbildern.

     npm run bild                     nach 5 Sekunden, primaerer Bildschirm
     npm run bild -- --warte 10       laenger Zeit zum Zurueckwechseln
     npm run bild -- --bildschirm 2   anderer Monitor
     npm run bild -- --bildschirme    welche Monitore gibt es?

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import path from 'node:path';
import { nimmAuf, listeBildschirme } from '../screenshot.js';

function zahl(argv: readonly string[], flagge: string, standard: number): number {
  const i = argv.indexOf(flagge);
  if (i < 0) return standard;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : standard;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv.includes('--bildschirme')) {
    console.log('');
    for (const b of listeBildschirme()) {
      console.log('  --bildschirm ' + b.nummer + '   ' + b.breite + 'x' + b.hoehe +
        '  ' + b.name + (b.primaer ? '  (primaer)' : ''));
    }
    console.log('');
    return;
  }

  const bildschirm = zahl(argv, '--bildschirm', 0);
  const warte = zahl(argv, '--warte', 5);

  console.log('');
  console.log('  Wechsle jetzt ins Spiel. Die Rangliste muss zu sehen sein.');
  console.log('');

  for (let i = warte; i > 0; i--) {
    process.stdout.write('\r  Aufnahme in ' + i + ' s ...  ');
    await new Promise((f) => setTimeout(f, 1000));
  }
  process.stdout.write('\r                          \r');

  const auf = nimmAuf(bildschirm);

  console.log('  Fertig: ' + auf.breite + 'x' + auf.hoehe);
  console.log('  ' + auf.datei);
  console.log('');
  console.log('  Ordner oeffnen:  explorer ' + path.dirname(auf.datei));
  console.log('');
}

main().catch((err: unknown) => {
  console.error('  FEHLER: ' + (err as Error).message);
  process.exitCode = 1;
});

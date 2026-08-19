/* =========================================================================
   PRUEFE - sieht dieses Bild nach einer frischen Aufnahme aus?

   Zum Ausprobieren: nimm einen echten Screenshot, bearbeite ihn, und lass
   beide hier durchlaufen. Der Unterschied sollte sofort sichtbar sein.

     npm run pruefe -- bild.png
     npm run pruefe -- echt.png gefaelscht.png     mehrere auf einmal

   Was das NICHT ist: ein Echtheitsbeweis. Der Client laeuft auf dem
   Rechner des Zuschauers, wer will umgeht ihn und schickt mit curl
   irgendein Bild. Was hier geprueft wird, ist nur: wurde das Bild neu
   kodiert? Das faellt bei jeder Bearbeitung an.

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { pruefeBild, pngBloecke } from '../bildpruefung.js';

function zusammenfassen(bloecke: readonly { typ: string; laenge: number }[]): string {
  /* IDAT-Bloecke zusammenfassen - davon gibt es bei einem grossen Bild
     dutzende, und interessant ist nur ihre Groesse. */
  const teile: string[] = [];
  let idatZahl = 0;
  let idatGroessen = new Set<number>();

  for (const b of bloecke) {
    if (b.typ === 'IDAT') {
      idatZahl++;
      idatGroessen.add(b.laenge);
      continue;
    }
    if (idatZahl > 0) {
      teile.push('IDAT x' + idatZahl + ' [' + [...idatGroessen].sort((a, z) => z - a).slice(0, 2).join(', ') + ']');
      idatZahl = 0;
      idatGroessen = new Set();
    }
    teile.push(b.typ);
  }
  if (idatZahl > 0) {
    teile.push('IDAT x' + idatZahl + ' [' + [...idatGroessen].sort((a, z) => z - a).slice(0, 2).join(', ') + ']');
  }
  return teile.join('  ');
}

function main(): void {
  const dateien = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  if (dateien.length === 0) {
    console.log('');
    console.log('  Aufruf: npm run pruefe -- <bild.png> [weitere.png ...]');
    console.log('');
    process.exitCode = 1;
    return;
  }

  for (const datei of dateien) {
    console.log('');
    if (!existsSync(datei)) {
      console.log('  ' + datei);
      console.log('    NICHT GEFUNDEN');
      continue;
    }

    const bild = readFileSync(datei);
    const typ = path.extname(datei).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
    const befund = pruefeBild(bild, typ);

    console.log('  ' + path.basename(datei) +
      '   ' + (statSync(datei).size / 1024).toFixed(0) + ' KB');
    console.log('    Struktur : ' + (zusammenfassen(pngBloecke(bild)) || '(kein PNG)'));
    console.log('    Urteil   : ' + (befund.wirktEcht
      ? 'sieht nach frischer Aufnahme aus'
      : 'AUFFAELLIG'));
    for (const a of befund.auffaelligkeiten) {
      console.log('               - ' + a);
    }
  }
  console.log('');
}

main();

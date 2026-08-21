/* =========================================================================
   RUNDE - der echte Ablauf im Spiel.

   Nimmt den Bildschirm auf, liest die Rangliste, gleicht die Namen ab und
   zeigt, was eingetragen wuerde. Mit --eintragen wird es echt.

   Gedacht fuer den Moment, in dem die Rangliste im Spiel sichtbar ist:
   Alt-Tab raus, Befehl ausloesen, Alt-Tab rein. Im Alltag macht das die
   Wache per F9 - dieser Befehl ist zum Nachsehen und Nachstellen.

     npm run runde                    zeigt nur an, schreibt nichts
     npm run runde -- --eintragen     traegt die sicheren Zeilen ein
     npm run runde -- --bildschirm 2  anderer Monitor
     npm run runde -- --warte 5       5 Sekunden warten vor der Aufnahme
     npm run runde -- --ausschnitt 0,430,520,400
                                      nur diesen Bereich aufnehmen (optional)
     npm run runde -- --bildschirme   welche Monitore gibt es?

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import { nimmAuf, listeBildschirme, BILDER_DIR, type Ausschnitt } from '../screenshot.js';
import { leserBeschreibung } from '../leser-wahl.js';
import { fuehreDurch, zeigeErgebnis } from '../durchlauf.js';
import { ladeWertungAusOrdner } from '../wertung.js';
import { DATEN_DIR } from '../config.js';

const NL = String.fromCharCode(10);

function zahl(argv: readonly string[], flagge: string, standard: number): number {
  const i = argv.indexOf(flagge);
  if (i < 0) return standard;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) ? n : standard;
}

async function schlafe(sekunden: number): Promise<void> {
  if (sekunden <= 0) return;
  for (let i = sekunden; i > 0; i--) {
    process.stdout.write('\r  Aufnahme in ' + i + ' s ... ');
    await new Promise((f) => setTimeout(f, 1000));
  }
  process.stdout.write('\r                          \r');
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

  const eintragen = argv.includes('--eintragen');
  const bildschirm = zahl(argv, '--bildschirm', 0);
  const warte = zahl(argv, '--warte', 0);

  /*
     --ausschnitt x,y,breite,hoehe schneidet direkt bei der Aufnahme zu.

     NICHT noetig fuer die Geschwindigkeit: ein volles 1920x1080-Bild
     braucht rund 3 bis 6 Sekunden. Die 235 Sekunden aus einem frueheren
     Test waren Ladezeit des Modells, nicht Rechenzeit - dagegen hilft
     keep_alive in ollama.ts.

     Sinnvoll ist der Ausschnitt trotzdem: weniger fremder Text im Bild
     heisst weniger Gelegenheit, etwas anderes fuer die Rangliste zu
     halten. Verkleinern waere dagegen ein Fehler - bei 60 Prozent kippen
     die Zahlen leise (2 614 wurde zu 2 514), und ein falscher Wert mit
     richtigem Namen faellt durch jede Pruefung.
  */
  let ausschnitt: Ausschnitt | undefined;
  const ai = argv.indexOf('--ausschnitt');
  if (ai >= 0) {
    const t = (argv[ai + 1] ?? '').split(',').map(Number);
    if (t.length !== 4 || t.some((n) => !Number.isFinite(n))) {
      console.error('  FEHLER: --ausschnitt braucht vier Zahlen: x,y,breite,hoehe');
      process.exitCode = 1;
      return;
    }
    ausschnitt = { x: t[0]!, y: t[1]!, breite: t[2]!, hoehe: t[3]! };
  }

  /* Die Wertung ZUERST oeffnen. Steht dort niemand mit Ingame-Namen,
     soll das auffallen, bevor eine Aufnahme gemacht und der Leser
     bemueht wird - sonst landet alles in der Rueckfrage und man sucht
     den Fehler beim Bild. */
  const { wertung } = ladeWertungAusOrdner(DATEN_DIR);
  const stand = wertung.stand();

  console.log('');
  const aktive = stand.listen.filter((l) => l.aktiv);
  const gewertet = aktive.reduce((n, l) => n + l.gewertet.length, 0);
  console.log('  Listen   : ' + aktive.map((l) => l.name).join(', '));
  console.log('  Rangliste: ' + stand.eintraege + ' Eintraege, ' +
    gewertet + ' in der Wertung');
  console.log('  Spieler  : ' + stand.spieler.length + ' mit Ingame-Namen' +
    (stand.spieler.length === 0 ? '  <- niemand zuzuordnen!' : ''));
  console.log('  Leser    : ' + leserBeschreibung());
  console.log('');

  await schlafe(warte);

  // Derselbe Durchlauf wie bei der Wache - siehe durchlauf.ts. Zwei
  // Kopien wuerden auseinanderlaufen, und dann waere unklar, welche von
  // beiden die Runden richtig eintraegt.
  const e = await fuehreDurch({
    stand,
    bildschirm,
    ausschnitt,
    eintragen: eintragen
      ? (kontoId, punkte) => { wertung.eintragen(kontoId, punkte); }
      : undefined
  });

  console.log('  Aufnahme : ' + e.aufnahme.breite + 'x' + e.aufnahme.hoehe +
    (ausschnitt ? '  (Ausschnitt)' : '  (ganzer Bildschirm)') +
    NL + '             ' + e.aufnahme.datei);
  zeigeErgebnis(e);
  console.log('');

  if (!eintragen) {
    console.log('  Nichts geschrieben. Mit --eintragen wird es echt.');
    console.log('  Bild bleibt liegen in: ' + BILDER_DIR);
    console.log('');
    return;
  }

  console.log('  ' + e.geschrieben + ' Eintraege geschrieben.');
  if (e.bericht.rueckfragen.length) {
    console.log('  ' + e.bericht.rueckfragen.length + ' Zeilen NICHT eingetragen - siehe oben.');
  }
  console.log('');
}

main().catch((err: unknown) => {
  console.error('  FEHLER: ' + (err as Error).message);
  process.exitCode = 1;
});

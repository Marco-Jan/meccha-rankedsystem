/* =========================================================================
   WACHE - laeuft neben dem Spiel und wartet auf deinen Tastendruck.

   Einmal starten, dann den ganzen Stream liegen lassen. Bei jedem Druck
   auf die gewaehlte Taste wird aufgenommen, gelesen und eingetragen -
   ohne dass du aus dem Spiel wechseln musst.

     npm run wache                     nur ansehen, traegt nichts ein
     npm run wache -- --eintragen      traegt ein
     npm run wache -- --taste F8       andere Taste (Standard F9)
     npm run wache -- --bildschirm 2   anderer Monitor

   Beenden mit STRG+C.

   Nebeneffekt, der gewollt ist: weil der Prozess durchlaeuft, bleibt das
   Modell in Ollama geladen. Damit kostet jede Runde ein paar Sekunden
   statt der halben Minute, die ein Nachladen braucht.

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import { ueberwache, codeFuer, tastenListe } from '../tasten.js';
import { fuehreDurch, zeigeErgebnis } from '../durchlauf.js';
import { ladeZustand, findeSpiel } from '../turnier-client.js';
import { TURNIER_URL, SPIEL_NAME } from '../config.js';
import { leserBeschreibung } from '../leser-wahl.js';
import { listeBildschirme, type Ausschnitt } from '../screenshot.js';

function wert(argv: readonly string[], flagge: string): string | null {
  const i = argv.indexOf(flagge);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const eintragen = argv.includes('--eintragen');
  const bildschirm = Number(wert(argv, '--bildschirm') ?? 0) || 0;
  const tasteName = (wert(argv, '--taste') ?? 'F9').toUpperCase();

  const code = codeFuer(tasteName);
  if (code === null) {
    console.error('  Unbekannte Taste: ' + tasteName);
    console.error('  Moeglich: ' + tastenListe().join(', '));
    process.exitCode = 1;
    return;
  }

  let ausschnitt: Ausschnitt | undefined;
  const a = wert(argv, '--ausschnitt');
  if (a) {
    const t = a.split(',').map(Number);
    if (t.length !== 4 || t.some((n) => !Number.isFinite(n))) {
      console.error('  FEHLER: --ausschnitt braucht vier Zahlen: x,y,breite,hoehe');
      process.exitCode = 1;
      return;
    }
    ausschnitt = { x: t[0]!, y: t[1]!, breite: t[2]!, hoehe: t[3]! };
  }

  // Zuerst den Server fragen. Fehlt er, soll das jetzt auffallen und nicht
  // erst beim ersten Tastendruck mitten im Spiel.
  const zustand = await ladeZustand();
  const spiel = findeSpiel(zustand);

  const monitore = listeBildschirme();
  const m = bildschirm > 0 ? monitore[bildschirm - 1] : monitore.find((x) => x.primaer);

  console.log('');
  console.log('  ############################################');
  console.log('  #   M E C C H A   -   W A C H E            #');
  console.log('  ############################################');
  console.log('');
  console.log('  Turnier    : ' + TURNIER_URL);
  console.log('  Liste      : ' + SPIEL_NAME + ' (' + spiel.eintraege + ' Eintraege)');
  console.log('  Kartei     : ' + zustand.kartei.length + ' Personen');
  console.log('  Leser      : ' + leserBeschreibung());
  console.log('  Bildschirm : ' + (m ? m.breite + 'x' + m.hoehe + ' ' + m.name : 'primaer'));
  console.log('  Ausschnitt : ' + (ausschnitt
    ? ausschnitt.x + ',' + ausschnitt.y + ',' + ausschnitt.breite + ',' + ausschnitt.hoehe
    : 'ganzer Bildschirm'));
  console.log('');
  console.log('  Modus      : ' + (eintragen
    ? 'ES WIRD EINGETRAGEN'
    : 'nur ansehen (mit --eintragen wird es echt)'));
  console.log('');
  console.log('  >>> Taste ' + tasteName + ' druecken, wenn die Rangliste zu sehen ist.');
  console.log('      Das geht auch, waehrend das Spiel im Vordergrund ist.');
  console.log('');
  console.log('  Beenden mit STRG+C');
  console.log('');

  let nummer = 0;

  const waechter = ueberwache(code, async () => {
    nummer++;
    const zeit = new Date().toLocaleTimeString('de-DE');
    console.log('  ------------------------------------------- #' + nummer + '  ' + zeit);
    try {
      const e = await fuehreDurch({ zustand, spiel, bildschirm, ausschnitt, eintragen });
      zeigeErgebnis(e);
      if (eintragen) {
        console.log('');
        console.log('  ' + e.geschrieben + ' eingetragen, ' +
          e.bericht.rueckfragen.length + ' offen.');
      }
    } catch (err) {
      // Ein Fehler darf die Wache nicht beenden - sonst steht sie nach der
      // ersten unlesbaren Runde still und du merkst es erst spaeter.
      console.log('  FEHLER: ' + (err as Error).message);
    }
    console.log('');
  });

  process.on('SIGINT', () => {
    waechter.stopp();
    console.log('');
    console.log('  Wache beendet nach ' + nummer + ' Runden.');
    process.exit(0);
  });
}

main().catch((err: unknown) => {
  console.error('  FEHLER: ' + (err as Error).message);
  process.exitCode = 1;
});

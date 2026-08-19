/* =========================================================================
   PROBELAUF - die ganze Kette ohne Screenshot testen.

   Statt OCR laufen zu lassen, gibst du die zwei Spalten als Text vor. Damit
   kannst du pruefen, ob Kartei-Abgleich, Rueckfragen-Logik und das
   Eintragen in die Punkteliste stimmen, bevor ein einziger Screenshot
   existiert.

   Aufruf:
     npm run probelauf -- --namen "NorikoTv,Polosios" --punkte "12160,10579"
     npm run probelauf -- --namen "..." --punkte "..." --eintragen

   Ohne --eintragen wird NICHTS geschrieben, nur angezeigt.

   WARNUNG: mit --eintragen schreibt das Skript echte Eintraege. Setz
   TURNIER_URL auf einen Testserver, nicht auf den Live-Server 8777.

   Alle Ausgaben bewusst ohne Umlaute: die cmd-Konsole macht daraus sonst
   Buchstabensalat (dieselbe Regel wie in turnier/discordbot.js).
   ========================================================================= */

import { parseZeilen, SpaltenPassenNicht } from '../parse.js';
import { bewerteRunde, teileAuf, personVon } from '../runde.js';
import { ladeZustand, findeSpiel, trageEin } from '../turnier-client.js';
import { TURNIER_URL, SPIEL_NAME } from '../config.js';

interface Argumente {
  readonly namen: string;
  readonly punkte: string;
  readonly eintragen: boolean;
}

function leseArgumente(argv: readonly string[]): Argumente {
  let namen = '';
  let punkte = '';
  let eintragen = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--namen') namen = argv[++i] ?? '';
    else if (a === '--punkte') punkte = argv[++i] ?? '';
    else if (a === '--eintragen') eintragen = true;
  }

  if (!namen || !punkte) {
    throw new Error(
      'Aufruf: npm run probelauf -- --namen "A,B" --punkte "100,200" [--eintragen]'
    );
  }
  return { namen, punkte, eintragen };
}

/** Komma oder Zeilenumbruch trennt - beides ist bequem zu tippen. */
function alsSpalte(text: string): string {
  return text.split(/[,\n]/).map((s) => s.trim()).join('\n');
}

async function main(): Promise<void> {
  const args = leseArgumente(process.argv.slice(2));

  console.log('');
  console.log('  Turnier-Server : ' + TURNIER_URL);
  console.log('  Punkteliste    : ' + SPIEL_NAME);
  console.log('');

  const zustand = await ladeZustand();
  const spiel = findeSpiel(zustand);
  console.log('  Kartei         : ' + zustand.kartei.length + ' Personen');
  console.log('  Liste gefunden : ' + spiel.name + ' (' + spiel.id + '), ' +
    spiel.eintraege + ' Eintraege bisher');
  console.log('');

  let zeilen;
  try {
    zeilen = parseZeilen(alsSpalte(args.namen), alsSpalte(args.punkte));
  } catch (err) {
    if (err instanceof SpaltenPassenNicht) {
      console.log('  ABBRUCH: ' + err.message);
      console.log('  Die ganze Runde geht zur Rueckfrage, es wird nichts eingetragen.');
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const bericht = teileAuf(bewerteRunde(zeilen, zustand.kartei));

  console.log('  EINTRAGEN (' + bericht.einzutragen.length + ')');
  if (bericht.einzutragen.length === 0) console.log('    (nichts)');
  for (const e of bericht.einzutragen) {
    const person = personVon(e)!;
    const wie = e.zuordnung.art;
    console.log(
      '    ' + String(e.zeile.zeile).padStart(2) + '. ' +
      e.zeile.rohName.padEnd(20) + String(e.zeile.punkte!.punkte).padStart(7) +
      '   -> ' + person.name + ' [' + wie + ']'
    );
  }

  console.log('');
  console.log('  RUECKFRAGE (' + bericht.rueckfragen.length + ')');
  if (bericht.rueckfragen.length === 0) console.log('    (nichts)');
  for (const e of bericht.rueckfragen) {
    console.log(
      '    ' + String(e.zeile.zeile).padStart(2) + '. ' +
      e.zeile.rohName.padEnd(20) + e.zeile.rohPunkte.padStart(7) +
      '   -> ' + e.grund
    );
  }
  console.log('');

  if (!args.eintragen) {
    console.log('  Nichts geschrieben (Probelauf). Mit --eintragen wird es echt.');
    console.log('');
    return;
  }

  let ok = 0;
  for (const e of bericht.einzutragen) {
    const person = personVon(e)!;
    // Der Kartei-Name, nie der Rohname - sonst legt ensurePerson() im
    // Server ein Phantom an.
    await trageEin(spiel.id, { name: person.name, punkte: e.zeile.punkte!.punkte });
    ok++;
  }
  console.log('  ' + ok + ' Eintraege geschrieben.');
  console.log('');
}

main().catch((err: unknown) => {
  console.error('  FEHLER: ' + (err as Error).message);
  process.exitCode = 1;
});

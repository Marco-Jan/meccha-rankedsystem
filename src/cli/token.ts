/* =========================================================================
   TOKEN - Zugaenge verwalten.

     npm run token                                zeigt alle
     npm run token -- --neu "NorikoTv" --ingame "Jones"
                                                  Zuschauer-Token
     npm run token -- --neu "Nori" --ingame "Jones" --ohne-freigabe
                                                  vertrauter Zuschauer:
                                                  nur seine Zeile, aber
                                                  ohne dass du klickst
     npm run token -- --neu "Spiel-PC" --vertraut eigener Rechner: ganze
                                                  Lobby, ohne Freigabe
     npm run token -- --sperren <token> --grund "..."

   Zwei unabhaengige Fragen:

     --vertraut        wieviel zaehlt: die GANZE Lobby. Nur fuer eigene
                       Rechner - ein Zuschauer darf nicht die Punkte
                       aller Mitspieler einreichen.
     --ohne-freigabe   wird geprueft: nein, geht direkt in die Liste.

   Vertraute Tokens brauchen --ohne-freigabe nicht, das gilt dort
   ohnehin.

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ladeTokens, brauchtFreigabe } from '../tokens.js';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJEKT = path.join(HIER, '..', '..');
const DATEN_DIR = process.env.MC_DATEN || path.join(PROJEKT, 'daten');

function wert(argv: readonly string[], flagge: string): string | null {
  const i = argv.indexOf(flagge);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
}

function main(): void {
  const argv = process.argv.slice(2);
  const liste = ladeTokens(path.join(DATEN_DIR, 'tokens.json'));

  const neu = wert(argv, '--neu');
  if (neu) {
    const vertraut = argv.includes('--vertraut');
    const ingame = wert(argv, '--ingame') ?? undefined;
    const ohneFreigabe = argv.includes('--ohne-freigabe');
    let t;
    try {
      t = liste.anlegen(neu, vertraut, ingame, ohneFreigabe);
    } catch (err) {
      console.log('');
      console.log('  ' + (err as Error).message);
      console.log('');
      console.log('  Beispiel:');
      console.log('    npm run token -- --neu "NorikoTv" --ingame "Jones"');
      console.log('');
      process.exitCode = 1;
      return;
    }
    console.log('');
    console.log('  Angelegt fuer: ' + t.name);
    console.log('    Wertung : ' + (vertraut
      ? 'die ganze Lobby'
      : 'nur die Zeile von "' + t.ingameName + '"'));
    console.log('    Freigabe: ' + (brauchtFreigabe(t)
      ? 'ja - landet erst in der Freigabeliste'
      : 'NEIN - geht direkt in die Punkteliste'));
    console.log('');
    console.log('  ' + t.token);
    console.log('');
    console.log('  Diesen Token bekommt die Person. Er ist kein Passwort,');
    console.log('  sondern eine Kennung - wer ihn missbraucht, wird gesperrt.');
    console.log('');
    return;
  }

  const sperren = wert(argv, '--sperren');
  if (sperren) {
    const grund = wert(argv, '--grund') ?? 'ohne Angabe';
    if (liste.sperren(sperren, grund)) {
      console.log('  Gesperrt: ' + grund);
    } else {
      console.log('  Token nicht gefunden.');
      process.exitCode = 1;
    }
    return;
  }

  const alle = liste.alle();
  console.log('');
  if (alle.length === 0) {
    console.log('  Noch keine Tokens.');
    console.log('  Anlegen:  npm run token -- --neu "Name"');
    console.log('');
    return;
  }

  console.log('  ' + 'NAME'.padEnd(20) + 'ART'.padEnd(34) + 'ZULETZT'.padEnd(20) + 'TOKEN');
  for (const t of alle) {
    const art = t.gesperrt ? 'GESPERRT'
      : (t.vertraut ? 'ganze Lobby' : 'im Spiel: ' + (t.ingameName ?? '?')) +
        (brauchtFreigabe(t) ? '' : ' [ohne Freigabe]');
    const zuletzt = t.letzteNutzung
      ? new Date(t.letzteNutzung).toLocaleString('de-DE')
      : 'nie';
    // Nur den Anfang zeigen - die Liste landet leicht in einem Screenshot.
    console.log('  ' + t.name.padEnd(20) + art.padEnd(34) + zuletzt.padEnd(20) +
      t.token.slice(0, 8) + '...');
    if (t.gesperrt) console.log('  ' + ' '.repeat(20) + 'Grund: ' + (t.sperrgrund ?? ''));
  }
  console.log('');
}

main();

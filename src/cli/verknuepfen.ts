/* =========================================================================
   VERKNUEPFEN - einen Ingame-Namen einer Karteiperson zuordnen.

   Warum das gebraucht wird: die Kartei fuehrt Twitch-Namen
   ("theRealBaloou"), im Spiel steht der Ingame-Name ("Baloou"). Die liegen
   zu weit auseinander fuer Levenshtein (Distanz 7), also muss die
   Verbindung einmal von Hand gezogen werden. Danach findet der Server sie
   selbst, weil kartei.js:47 auch ueber die Aliase sucht.

   Aufruf:
     npm run verknuepfen                             (zeigt die Kartei)
     npm run verknuepfen -- --ingame "Baloou" --person "theRealBaloou"

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import {
  ladeZustand, legeKarteiAn, verknuepfe
} from '../turnier-client.js';
import { TURNIER_URL } from '../config.js';
import { nameKey } from '../namen.js';

function leseArgumente(argv: readonly string[]): { ingame: string; person: string } {
  let ingame = '';
  let person = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ingame') ingame = argv[++i] ?? '';
    else if (argv[i] === '--person') person = argv[++i] ?? '';
  }
  return { ingame, person };
}

async function main(): Promise<void> {
  const { ingame, person } = leseArgumente(process.argv.slice(2));
  const zustand = await ladeZustand();

  if (!ingame || !person) {
    console.log('');
    console.log('  Kartei auf ' + TURNIER_URL + ':');
    for (const p of zustand.kartei) console.log('    ' + p.name);
    console.log('');
    console.log('  Verknuepfen:');
    console.log('    npm run verknuepfen -- --ingame "Baloou" --person "theRealBaloou"');
    console.log('');
    return;
  }

  const ziel = zustand.kartei.find((p) => nameKey(p.name) === nameKey(person));
  if (!ziel) {
    console.log('  FEHLER: "' + person + '" steht nicht in der Kartei.');
    console.log('  Vorhanden: ' + zustand.kartei.map((p) => p.name).join(', '));
    process.exitCode = 1;
    return;
  }

  // Steht der Ingame-Name schon irgendwo? Dann ist nichts zu tun - oder er
  // gehoert bereits jemand anderem, was der Nutzer wissen muss.
  const schon = zustand.kartei.find((p) => nameKey(p.name) === nameKey(ingame));
  if (schon && schon.id === ziel.id) {
    console.log('  "' + ingame + '" ist bereits ' + ziel.name + '. Nichts zu tun.');
    return;
  }

  let quelleId: string;
  if (schon) {
    console.log('  "' + ingame + '" ist derzeit eine eigene Person - wird zusammengefuehrt.');
    quelleId = schon.id;
  } else {
    await legeKarteiAn(ingame);
    const neu = await ladeZustand();
    const angelegt = neu.kartei.find((p) => nameKey(p.name) === nameKey(ingame));
    if (!angelegt) {
      console.log('  FEHLER: "' + ingame + '" konnte nicht angelegt werden.');
      process.exitCode = 1;
      return;
    }
    quelleId = angelegt.id;
  }

  // Richtung beachten: der Ingame-Name ist das from und verschwindet,
  // seine Schluessel werden Aliase der echten Person.
  await verknuepfe(quelleId, ziel.id);

  console.log('  "' + ingame + '" ist jetzt ein Alias von ' + ziel.name + '.');
  console.log('  Eintraege mit "' + ingame + '" landen ab jetzt bei ' + ziel.name + '.');
}

main().catch((err: unknown) => {
  console.error('  FEHLER: ' + (err as Error).message);
  process.exitCode = 1;
});

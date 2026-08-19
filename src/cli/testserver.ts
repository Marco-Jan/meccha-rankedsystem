/* =========================================================================
   TESTSERVER - ein Turnier-Server mit WEGWERF-DATEN.

   Warum es den braucht: turnier mit  set PORT=8778  zu starten reicht
   NICHT. Der Port aendert sich, aber geschrieben wird weiter in
   turnier/data/listen.json - jsonstore.js:11 legt DATA_DIR fest auf den
   Ordner neben server.js. Ein Test mit --eintragen wuerde also echte
   Turnierdaten veraendern.

   Deshalb: die Projektdateien werden in einen Temp-Ordner KOPIERT und der
   Server laeuft dort. Die Kopie wird bei jedem Start frisch angelegt, das
   Original nie angefasst.

   Aufruf:  npm run testserver
   Beenden: STRG+C

   Ausgaben ohne Umlaute - cmd-Konsole.
   ========================================================================= */

import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
// Liegt als Unterordner IN turnier: von src/cli/ aus drei Ebenen hoch.
const TURNIER = path.resolve(HIER, '..', '..', '..');
const KOPIE = path.join(tmpdir(), 'mc-ranked-testserver');

const PORT = process.env.TESTPORT || '8778';

/* 8777 ist der Live-Server. Selbst mit Kopie waere es verwirrend, wenn der
   Testserver denselben Port belegt - und ein spaeter gestarteter echter
   Server wuerde scheitern. */
if (PORT === '8777') {
  console.error('  FEHLER: 8777 ist der Live-Port. Nimm einen anderen (TESTPORT).');
  process.exit(1);
}

if (!existsSync(path.join(TURNIER, 'server.js'))) {
  console.error('  FEHLER: turnier nicht gefunden unter ' + TURNIER);
  process.exit(1);
}

console.log('');
console.log('  Lege eine frische Kopie an (deine echten Daten bleiben unberuehrt)...');
rmSync(KOPIE, { recursive: true, force: true });
mkdirSync(KOPIE, { recursive: true });

// Nur was der Server braucht. node_modules gibt es dort ohnehin nicht.
/*
   Nur die aufgezaehlten Teile kopieren. Wichtig, seit mc-ranked ein
   Unterordner von turnier ist: ein pauschales Kopieren wuerde das
   Projekt samt node_modules in seine eigene Testkopie schaufeln.
*/
for (const teil of ['server.js', 'tournament.js', 'listen.js', 'kartei.js',
                    'ranking.js', 'jsonstore.js', 'discordbot.js',
                    'package.json', 'public', 'data']) {
  const quelle = path.join(TURNIER, teil);
  if (existsSync(quelle)) cpSync(quelle, path.join(KOPIE, teil), { recursive: true });
}

console.log('  Kopie: ' + KOPIE);
console.log('  Start auf Port ' + PORT + ' ...');
console.log('');
console.log('  In einem ZWEITEN Fenster:');
console.log('    set TURNIER_URL=http://localhost:' + PORT);
console.log('');

const kind = spawn(process.execPath, ['server.js'], {
  cwd: KOPIE,
  stdio: 'inherit',
  env: { ...process.env, PORT, DISCORD_TOKEN: '', DISCORD_GUILD: '' }
});

// STRG+C soll den Server mitnehmen, nicht nur dieses Skript.
process.on('SIGINT', () => { kind.kill(); process.exit(0); });
kind.on('exit', (code) => process.exit(code ?? 0));

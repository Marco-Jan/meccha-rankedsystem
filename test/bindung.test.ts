import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const PROJEKT = path.join(HIER, '..');

const serve = readFileSync(path.join(PROJEKT, 'src', 'cli', 'serve.ts'), 'utf8');

/* =========================================================================
   Ein Dienst, der ohne Adressangabe lauscht, haengt an allen Netzkarten -
   auch an der oeffentlichen. Auf dem gemieteten Server heisst das: der Port
   ist direkt erreichbar, an nginx und am Zertifikat vorbei, und Token gehen
   im Klartext ueber die Leitung.

   Das ist eine Zeile, die beim Aufraeumen leicht wieder verschwindet, und
   man sieht es nicht - der Dienst laeuft ja. Deshalb steht hier eine Wache.
   ========================================================================= */

describe('Woran die Dienste lauschen', () => {
  test('mc-ranked bindet an eine Adresse, nicht an alle', () => {
    assert.match(serve, /server\.listen\(port, host,/);
    assert.doesNotMatch(serve, /server\.listen\(port, \(\)/);
  });

  test('mc-ranked bleibt ohne Zutun auf der eigenen Maschine', () => {
    assert.match(serve, /process\.env\.MC_HOST \|\| '127\.0\.0\.1'/);
  });
});

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const projekt = path.join(hier, '..');
const verlangen = createRequire(import.meta.url);

const stempeln = verlangen('../client-cs/stempeln.cjs');
const clientOrdner = path.join(projekt, 'client-cs');

describe('Client-Fassung', () => {
  const verteilung = stempeln.liesJson(
    path.join(projekt, 'config', 'verteilung.json')
  );
  const stempel = stempeln.stempelLesen();

  test('es gibt einen Stempel des ausgelieferten Baus', () => {
    assert.match(stempel.version, /^\d+\.\d+\.\d+$/);
    assert.match(stempel.quellen, /^[0-9a-f]{64}$/);
  });

  test('geaenderte Quellen brauchen eine neue Nummer', () => {
    /* Genau das ist einmal passiert: der Client bekam alle japanischen
       Texte und hiess weiter 0.5.0. Der Server meldet die Nummer aus
       verteilung.json, der Client vergleicht sie mit seiner eigenen -
       sind beide gleich, bleibt der Hinweis auf die neue Fassung aus.
       Zwei verschiedene .exe, dieselbe Zahl, kein Weg das zu sehen. */
    const jetzt = stempeln.quellenHash(clientOrdner);
    if (jetzt === stempel.quellen) return; // nichts geaendert, alles gut

    assert.notEqual(
      verteilung.clientVersion,
      stempel.version,
      'Die Dateien ' +
        stempeln.QUELLEN.join(', ') +
        ' haben sich seit dem Bau von ' +
        stempel.version +
        ' geaendert. Zaehle clientVersion in config/verteilung.json hoch.'
    );
  });

  test('der Server meldet die Nummer, die im Client steht', () => {
    /* Die Nummer wird beim Bauen aus verteilung.json nach Kern.cs
       geschrieben - eine Quelle, zwei Orte. Steht sie auseinander,
       wurde von Hand am Code gedreht. */
    const code = readFileSync(path.join(clientOrdner, 'Kern.cs'), 'utf8');
    const m = /public const string Version = "([^"]*)";/.exec(code);
    assert.ok(m, 'Version steht nicht in Kern.cs');

    if (stempeln.quellenHash(clientOrdner) !== stempel.quellen) return;
    assert.equal(m![1], verteilung.clientVersion);
  });
});

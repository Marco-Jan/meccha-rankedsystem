import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { schneideAus, ausschnittPfadZu, SCHNEIDE_SKRIPT } from '../src/ausschnitt.js';
import { ladeFreigabeliste } from '../src/freigabe.js';

/* =========================================================================
   DER AUSSCHNITT

   Ein Screenshot wiegt rund 2 MB, der ausgeschnittene Ranglisten-Block
   rund 55 KB. Deshalb wird das Original nach drei Tagen geloescht und
   der Ausschnitt dauerhaft aufgehoben.

   Was hier geprueft wird, ist vor allem die Zusicherung "wirft nie": der
   Zuschnitt ist eine Zugabe, und wenn Python fehlt oder ein Bild
   unlesbar ist, darf davon keine Runde kaputtgehen. Ein Zuschauer haette
   von so einem Fehler nur eine Meldung, die er weder versteht noch
   beheben kann.
   ========================================================================= */

const ORDNER = mkdtempSync(path.join(tmpdir(), 'mc-ausschnitt-'));
after(() => rmSync(ORDNER, { recursive: true, force: true }));

describe('Zielpfad', () => {
  test('haengt .jpg an und legt ihn in den Unterordner', () => {
    const p = ausschnittPfadZu(path.join('/bilder', 'upload-2026-01-01-abc.png'));
    assert.equal(path.basename(p), 'upload-2026-01-01-abc.jpg');
    assert.equal(path.basename(path.dirname(p)), 'ausschnitte');
  });

  test('ein eigener Ordner laesst sich vorgeben', () => {
    const p = ausschnittPfadZu('/bilder/x.png', '/woanders');
    assert.equal(p, path.join('/woanders', 'x.jpg'));
  });

  test('auch ein JPEG-Original bekommt einen eigenen Zielnamen', () => {
    // Sonst schriebe der Zuschnitt auf das Original.
    const p = ausschnittPfadZu('/bilder/x.jpg');
    assert.notEqual(path.resolve(p), path.resolve('/bilder/x.jpg'));
  });
});

describe('Der Zuschnitt wirft nie', () => {
  /* Jeder dieser Faelle waere ein berechtigter Fehler - und trotzdem
     darf keiner davon einen Upload kippen. */

  test('fehlendes Python gibt null, keinen Fehler', () => {
    const raus = schneideAus('egal.png', path.join(ORDNER, 'a.jpg'), '/gibt/es/nicht');
    assert.equal(raus, null);
  });

  test('fehlendes Skript gibt null', () => {
    const raus = schneideAus('egal.png', path.join(ORDNER, 'b.jpg'),
      process.execPath, '/gibt/es/nicht.py');
    assert.equal(raus, null);
  });

  test('fehlendes Bild gibt null', () => {
    const raus = schneideAus(path.join(ORDNER, 'gibtsnicht.png'), path.join(ORDNER, 'c.jpg'));
    assert.equal(raus, null);
  });

  test('ein Bild, das kein Bild ist, gibt null', () => {
    const quatsch = path.join(ORDNER, 'quatsch.png');
    writeFileSync(quatsch, 'das ist kein PNG');
    assert.equal(schneideAus(quatsch, path.join(ORDNER, 'd.jpg')), null);
  });

  test('das Skript liegt da, wo es erwartet wird', () => {
    // Sonst waere jeder Zuschnitt still ein Nullwert, und niemand merkte es.
    assert.ok(existsSync(SCHNEIDE_SKRIPT), SCHNEIDE_SKRIPT + ' fehlt');
  });
});

describe('Aufraeumen laesst den Ausschnitt liegen', () => {
  test('nur das Original wird geloescht', () => {
    /* Das ist der ganze Sinn der Sache: das Original darf gehen, WEIL
       der Ausschnitt bleibt. Ginge er mit, waere nach drei Tagen kein
       Beleg mehr da und man koennte eine alte Runde nicht mehr
       nachvollziehen. */
    const dir = mkdtempSync(path.join(ORDNER, 'raeum-'));
    const original = path.join(dir, 'bild.png');
    const klein = path.join(dir, 'bild.jpg');
    writeFileSync(original, 'gross');
    writeFileSync(klein, 'klein');

    const f = ladeFreigabeliste(path.join(dir, 'freigabe.json'));
    const r = f.hinzufuegen({
      eingegangen: 1000,
      quelle: 'zuschauer',
      absender: 'A',
      bildPfad: original,
      ausschnittPfad: klein,
      bildHash: 'h',
      zeilen: []
    }).runde;
    f.entscheiden(r.id, 'freigegeben', 'Admin');

    const weg = f.bilderAufraeumen(1, 1000 + 2 * 60 * 60 * 1000);

    assert.equal(weg, 1);
    assert.equal(existsSync(original), false, 'das Original ist weg');
    assert.equal(existsSync(klein), true, 'der Ausschnitt bleibt');
    assert.equal(f.finde(r.id)!.bildGeloescht, true);
  });
});

/* --------------------------------------------------------- am echten Bild

   Laeuft nur, wenn die Python-Umgebung eingerichtet ist und eines der
   Testbilder danebenliegt. Auf dem Server ist beides nicht der Fall -
   dort wird der Test uebersprungen statt rot zu werden.
*/

const ECHTES_BILD = 'C:/Users/Baloou/Desktop/tesbilder/runde-2026-08-18T11-58-20-308Z.png';

describe('Am echten Screenshot', { skip: !existsSync(ECHTES_BILD) }, () => {
  test('schneidet den Block aus und ist drastisch kleiner', () => {
    const ziel = path.join(ORDNER, 'echt.jpg');
    const raus = schneideAus(ECHTES_BILD, ziel);

    assert.equal(raus, ziel);
    const vorher = statSync(ECHTES_BILD).size;
    const nachher = statSync(ziel).size;

    assert.ok(nachher < vorher / 20,
      'erwartet mindestens 20-mal kleiner, war ' +
      Math.round(vorher / nachher) + '-mal (' + Math.round(nachher / 1024) + ' KB)');

    // JPEG faengt mit FF D8 an - sonst haette Pillow etwas anderes geschrieben.
    const kopf = readFileSync(ziel).subarray(0, 2);
    assert.deepEqual([kopf[0], kopf[1]], [0xff, 0xd8]);
  });
});

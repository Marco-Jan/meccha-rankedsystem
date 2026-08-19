import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.join(HIER, '..', 'client-cs');

const lies = (n: string) => readFileSync(path.join(CLIENT, n), 'utf8');
const roh = (n: string) => readFileSync(path.join(CLIENT, n));

const sprache = lies('Sprache.cs');
const fenster = lies('Fenster.cs');
const kern = lies('Kern.cs');
const bauen = lies('BAUEN.bat');

/* =========================================================================
   Der Client wird nicht von diesen Tests uebersetzt - csc.exe gibt es nur
   auf Windows, und auf dem Server laeuft keiner. Was sich hier trotzdem
   pruefen laesst, ist der Quelltext, und genau dort sassen die Fehler:

   Kern.cs hatte keine BOM. csc.exe liest eine Datei ohne BOM in der
   Windows-Codepage, nicht als UTF-8 - in der ausgelieferten .exe stand
   deshalb "primArer Bildschirm". Bei chinesischen Zeichen faellt so etwas
   nicht nur auf, es macht den Text unbrauchbar.
   ========================================================================= */

describe('Client - Kodierung', () => {
  for (const datei of ['Kern.cs', 'Sprache.cs', 'Fenster.cs']) {
    test(datei + ' hat eine BOM', () => {
      const b = roh(datei);
      assert.deepEqual([b[0], b[1], b[2]], [0xef, 0xbb, 0xbf],
        datei + ' ohne BOM - csc.exe liest sie dann in der Windows-Codepage');
    });
  }

  test('BAUEN.bat schreibt die Codepage trotzdem vor', () => {
    // Doppelt: die BOM kann beim Bearbeiten verlorengehen.
    assert.match(bauen, /-codepage:65001/);
  });

  test('BAUEN.bat uebersetzt alle drei Dateien', () => {
    assert.match(bauen, /Kern\.cs Sprache\.cs Fenster\.cs/);
  });
});

describe('Client - Sprachen', () => {
  test('kennt Englisch, Deutsch und Chinesisch', () => {
    assert.match(sprache, /Kennungen = \{ "en", "de", "zh" \}/);
    assert.match(sprache, /"English", "Deutsch", "中文"/);
  });

  test('faengt auf Englisch an', () => {
    assert.match(sprache, /Aktuell = "en"/);
  });

  test('faellt auf den deutschen Satz zurueck statt auf nichts', () => {
    /* Ein fehlender Eintrag darf keine leere Beschriftung ergeben - ein
       Knopf ohne Text ist schlimmer als einer in der falschen Sprache. */
    assert.match(sprache, /if \(!W\.TryGetValue\(de, out a\)\) return de;/);
    assert.match(sprache, /string\.IsNullOrEmpty\(a\[i\]\) \? de : a\[i\]/);
  });

  test('jeder Eintrag hat beide Uebersetzungen', () => {
    const eintraege = [...sprache.matchAll(/new\[\] \{ ("(?:[^"\\]|\\.)*"|[^}]*?), ("(?:[^"\\]|\\.)*"|[^}]*?) \} \}/g)];
    assert.ok(eintraege.length > 40, 'zu wenige Eintraege gefunden: ' + eintraege.length);
  });

  test('die chinesischen Texte sind wirklich chinesisch', () => {
    // Faengt Buchstabensalat ab, falls doch einmal falsch kodiert wird.
    const han = sprache.match(/[一-鿿]/g) ?? [];
    assert.ok(han.length > 100, 'nur ' + han.length + ' chinesische Zeichen gefunden');
    assert.doesNotMatch(sprache, /Ã[-¿]/, 'sieht nach falsch gelesenem UTF-8 aus');
  });

  test('Platzhalter werden ersetzt, nicht angezeigt', () => {
    assert.match(sprache, /s\.Replace\("\{" \+ i \+ "\}"/);
  });
});

describe('Client - Oberflaeche', () => {
  test('die Einstellungen sind ein eigenes Fenster', () => {
    // Kein Aufklappstreifen mehr, der den Verlauf verkleinert.
    assert.match(fenster, /einstellungsFenster = new Form/);
    assert.doesNotMatch(fenster, /Panel BaueEinstellungsBereich/);
  });

  test('der Dialog ist in Abschnitte geteilt', () => {
    for (const a of ['Zugang', 'Aufnahme', 'Sprache']) {
      assert.match(fenster, new RegExp('Ueberschrift\\("' + a + '"\\)'),
        'Abschnitt ' + a + ' fehlt');
    }
    assert.match(fenster, /Speichern/);
    assert.match(fenster, /Abbrechen/);
  });

  test('Sprache und Taste lassen sich beide umstellen', () => {
    assert.match(fenster, /feldSprache = new ComboBox/);
    assert.match(fenster, /feldTaste = new ComboBox/);
    assert.match(fenster, /feldTaste\.Items\.AddRange\(Tasten\.Namen\)/);
  });

  test('beim Sprachwechsel wird neu beschriftet', () => {
    /* Sonst muesste das ganze Fenster neu entstehen - und der Verlauf
       der laufenden Sitzung waere weg. */
    assert.match(fenster, /if \(andereSprache\) Beschriften\(\);/);
    assert.match(fenster, /void Beschriften\(\)/);
  });

  test('die Sprache wird gemerkt', () => {
    assert.match(kern, /public string Sprache = "en";/);
    assert.match(kern, /sprache == "de" \|\| sprache == "en" \|\| sprache == "zh"/);
    assert.match(kern, /\\"sprache\\": /);
  });

  test('spricht TLS 1.2, bevor irgendetwas gesendet wird', () => {
    /* .NET Framework 4 nimmt von sich aus TLS 1.0, und nginx laesst nur
       noch 1.2 und 1.3 zu. Fehlt das hier, scheitert schon der
       Verbindungsaufbau und der Client meldet "Server nicht erreichbar",
       obwohl der Server laeuft. Genau so ist es beim Umzug auf https
       passiert - vorher fiel es nicht auf, weil localhost unverschluesselt
       war. */
    assert.match(fenster, /SecurityProtocol =/);
    assert.match(fenster, /\(System\.Net\.SecurityProtocolType\)3072/);

    // Vor dem ersten Fenster, nicht irgendwann spaeter.
    const tls = fenster.indexOf('SecurityProtocol =');
    const lauf = fenster.indexOf('Application.Run');
    assert.ok(tls > 0 && tls < lauf, 'TLS muss vor Application.Run gesetzt werden');
  });

  test('die Farben stehen an einer Stelle', () => {
    assert.match(sprache, /static class Farben/);
    /* Im Fenster duerfen keine losen Farbwerte mehr stehen - die waren
       ueber fuenf Stellen verteilt und liefen auseinander. */
    const lose = fenster.match(/Color\.FromArgb\(\d+, \d+, \d+\)/g) ?? [];
    assert.equal(lose.length, 0, 'noch lose Farben: ' + lose.join(', '));
  });

  test('keine festen deutschen Texte mehr in der Oberflaeche', () => {
    for (const s of ['"Beenden"', '"Aktualisieren"', '"Wartet auf Prüfung"']) {
      const stelle = fenster.indexOf('Text = ' + s);
      assert.equal(stelle, -1, 'unuebersetzt: ' + s);
    }
  });
});

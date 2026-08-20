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

  test('zeigt zu wenige Verstecker gelb, nicht rot als Abgelehnt', () => {
    /* Eine kleine Lobby ist kein Betrug - der Zuschauer hat nichts falsch
       gemacht. Rot mit "Abgelehnt" waere ein Vorwurf. */
    const kern = readFileSync(path.join(CLIENT, 'Kern.cs'), 'utf8');
    assert.match(kern, /art.*zu-wenige-spieler/);
    assert.match(kern, /public bool ZuWenige/);
    assert.match(fenster, /a\.ZuWenige/);
    assert.match(fenster, /zuWenige \? Farben\.Gelb/);
  });

  test('uebersetzt die Zu-wenige-Meldung', () => {
    assert.match(sprache, /Verstecker im Scoreboard/);
    assert.match(sprache, /hiders on the scoreboard/);
    assert.match(sprache, /躲藏者/);
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

describe('Client - Uebersetzungen sind vollstaendig', () => {
  /*
     Ohne diese Wache faellt eine fehlende Uebersetzung nicht auf: T()
     gibt den deutschen Satz zurueck, wenn es keinen Eintrag gibt. Das
     ist die richtige Rueckfallebene - sichtbarer Text statt einer leeren
     Stelle -, aber es heisst eben auch, dass niemand es bemerkt.

     Genau so ist es beim Aufklappen der Runden passiert: siebzehn neue
     Saetze, kein einziger uebersetzt, alle Tests gruen.
  */
  const schluesselAus = (quelle: string): string[] => {
    const raus: string[] = [];
    /*
       Sprache.T("...") - der erste Parameter ist der Schluessel.

       Lange Saetze stehen im Quelltext als mehrere Literale mit + davon
       zwischen, damit die Zeilen nicht ueberlaufen. In Sprache.cs steht
       dann der ZUSAMMENGESETZTE Satz. Wer nur das erste Literal liest,
       meldet drei Fehlalarme - deshalb wird hier weitergelesen, solange
       ein + folgt.
    */
    const start = /Sprache\.T\(\s*"/g;
    let t: RegExpExecArray | null;

    while ((t = start.exec(quelle)) !== null) {
      let i = t.index + t[0].length;
      let ganz = '';

      for (;;) {
        let stueck = '';
        while (i < quelle.length && quelle[i] !== '"') {
          if (quelle[i] === '\\') { stueck += quelle[i]! + quelle[i + 1]!; i += 2; continue; }
          stueck += quelle[i]!;
          i++;
        }
        ganz += stueck;
        i++;                                   // schliessendes Anfuehrungszeichen

        const rest = quelle.slice(i);
        const weiter = /^\s*\+\s*"/.exec(rest);
        if (!weiter) break;
        i += weiter[0].length;
      }

      raus.push(ganz);
    }
    return raus;
  };

  test('jeder Satz aus Fenster.cs und Kern.cs steht in der Tabelle', () => {
    const alle = [...schluesselAus(fenster), ...schluesselAus(kern)];
    assert.ok(alle.length > 20, 'die Suche muss etwas finden, sonst prueft sie nichts');

    const fehlen = [...new Set(alle)].filter((k) => !sprache.includes('"' + k + '"'));
    assert.deepEqual(fehlen, [],
      'ohne Eintrag in Sprache.cs bleibt der Satz auf Deutsch stehen');
  });
});

describe('Client - der Update-Hinweis', () => {
  test('steht im Info-Kasten, nicht mehr in der Kopfzeile', () => {
    /* Die Serveradresse steckt fest in der .exe. Nach einem Serverumzug
       sendet eine alte Fassung ins Leere - keine Fehlermeldung, keine
       Runde, nichts. Wer den Hinweis ueberliest, spielt weiter und
       wundert sich wochenspaeter, warum er nirgends auftaucht. Deshalb
       gehoert er dorthin, wo alles steht, was den Nutzer betrifft. */
    assert.match(fenster, /kastenNeueFassung/);
    assert.match(fenster, /Neue Fassung \{0\} verfügbar/);
    assert.doesNotMatch(fenster, /NEUE FASSUNG \{0\} verfügbar/,
      'die alte Kopfzeilen-Fassung ist weg');
  });

  test('fuehrt direkt zum Download, nicht zur Kontoseite', () => {
    // Wer "neue Fassung verfuegbar" liest, will sie holen.
    assert.match(fenster, /void OeffneDownload/);
    assert.match(fenster, /"\/download"/);
  });

  test('der Kasten ist nur anklickbar, wenn es etwas zu holen gibt', () => {
    /* Ein Handzeiger ueber einem Kasten, der auf nichts reagiert, ist
       ein Versprechen, das die Oberflaeche nicht haelt. */
    assert.match(fenster, /kastenNeueFassung\.Length > 0 \? Cursors\.Hand : Cursors\.Default/);
    assert.match(fenster, /if \(kastenNeueFassung\.Length > 0\) OeffneDownload\(\)/);
  });

  test('beide Quellen fuellen denselben Kasten, ohne sich zu ueberschreiben', () => {
    /* Rueckmeldungen kommen im Minutentakt, die Auskunft "wer bin ich"
       beim Start. Wuerden beide direkt zeichnen, stuende mal die
       Ablehnung da, mal der Update-Hinweis - je nachdem was zuletzt kam. */
    assert.match(fenster, /kastenOffene = offene/);
    assert.match(fenster, /kastenAblehnung = letzteAblehnung/);
    assert.equal((fenster.match(/ZeigeInfoKasten\(\);/g) ?? []).length, 2,
      'genau zwei Aufrufe: einer je Quelle');
  });
});

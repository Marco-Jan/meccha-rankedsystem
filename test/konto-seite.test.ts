import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { kontoSeite } from '../src/konto-seite.js';

/* =========================================================================
   Die Kontoseite ist eine Zeichenkette - ein Tippfehler faellt hier
   niemandem auf, sondern erst im Browser des Zuschauers, und dort nur
   als leere Seite ohne Meldung. Deshalb wird hier geprueft, was sich
   ohne Browser pruefen laesst: Geruest, gueltiges JavaScript, und dass
   die Skriptteile nur Elemente ansprechen, die es auch gibt.

   Was die Seite AUFRUFT, prueft konto-api.test.ts gegen den echten
   Server ("Kontoseite und API passen zusammen").
   ========================================================================= */

const html = kontoSeite();

/** Der Inhalt des script-Blocks. */
function skript(): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'die Seite braucht einen script-Block');
  return m![1]!;
}

describe('Kontoseite - Geruest', () => {
  test('ist eine vollstaendige HTML-Seite', () => {
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="de">/);
    assert.match(html, /<meta charset="utf-8">/);
    assert.match(html, /<\/html>\s*$/);
  });

  test('taugt fuer das Handy', () => {
    // Die meisten holen sich den Token nebenbei am Telefon ab.
    assert.match(html, /<meta name="viewport"[^>]*width=device-width/);
  });

  test('hat einen Titel', () => {
    assert.match(html, /<title>[^<]*Meccha[^<]*<\/title>/);
  });

  test('bringt Aussehen und Verhalten selbst mit', () => {
    /* Der Server soll ohne Netz und ohne weitere Dateien auskommen -
       er laeuft auf demselben Rechner wie das Spiel. */
    assert.doesNotMatch(html, /<script[^>]+src=/);
    assert.doesNotMatch(html, /<link[^>]+stylesheet/);
    assert.match(html, /<style>/);
    assert.match(html, /<script>/);
  });

  test('liefert bei jedem Aufruf dasselbe', () => {
    // Keine Zufallswerte, kein Zeitstempel - sonst waere jede Auslieferung
    // eine andere Seite und nichts liesse sich zwischenspeichern.
    assert.equal(kontoSeite(), html);
  });

  test('hat keine offene Einsetzung stehen lassen', () => {
    // ${...} im Ergebnis hiesse: im Quelltext falsch geschuetzt.
    assert.doesNotMatch(html, /\$\{/);
  });
});

describe('Kontoseite - Skript', () => {
  test('ist gueltiges JavaScript', () => {
    // new Function uebersetzt, fuehrt aber nichts aus: ein Syntaxfehler
    // faellt auf, document und location werden nicht angefasst.
    assert.doesNotThrow(() => new Function(skript()));
  });

  test('laeuft gekapselt ab', () => {
    // Sonst haengen die Hilfsnamen am window-Objekt.
    assert.match(skript(), /\(function \(\)/);
  });

  test('spricht nur Elemente an, die es gibt', () => {
    for (const m of skript().matchAll(/\$\('([^']+)'\)/g)) {
      assert.match(html, new RegExp('id="' + m[1]! + '"'), 'kein Element mit id ' + m[1]);
    }
  });

  test('setzt fremde Namen nie als HTML ein', () => {
    /* Benutzername, Ingame-Name und Sperrgrund kommen von aussen. Sie
       gehen ueber textContent - innerHTML darf nur zum Leeren dienen. */
    for (const m of skript().matchAll(/innerHTML\s*=\s*([^;]+);/g)) {
      assert.equal(m[1]!.trim(), "''", 'innerHTML darf nur leeren, hier: ' + m[1]);
    }
  });

  test('holt den Stand beim Laden', () => {
    assert.match(skript(), /fetch\('\/api\/konto'\)/);
    assert.match(skript(), /lade\(\);/);
  });

  test('zeigt eine Meldung, wenn der Server nicht antwortet', () => {
    // Ohne catch bliebe "wird geladen ..." fuer immer stehen.
    assert.match(skript(), /\.catch\(/);
    assert.match(html, /nicht erreichbar/);
  });

  test('nimmt den Fehler von der Steam-Rueckkehr entgegen', () => {
    // konto-api leitet bei abgelehnter Anmeldung nach /konto?fehler=... .
    assert.match(skript(), /get\('fehler'\)/);
  });
});

describe('Kontoseite - Sprachen', () => {
  test('bringt Englisch und Chinesisch mit', () => {
    /* Englisch ist die Vorgabe, Deutsch der Schluessel im Woerterbuch -
       fehlt eine Uebersetzung, steht dort deutscher Text statt einer
       leeren Stelle. */
    assert.match(skript(), /en: \{/);
    assert.match(skript(), /zh: \{/);
    assert.match(skript(), /Sign in with Steam/);
    assert.match(skript(), /使用 Steam 登录/);
  });

  test('faengt auf Englisch an', () => {
    assert.match(skript(), /return 'en';/);
  });

  test('merkt sich die Wahl', () => {
    // Sonst muesste jeder bei jedem Besuch neu umstellen.
    assert.match(skript(), /localStorage.setItem\('mc_sprache'/);
  });

  test('hat drei Knoepfe zum Umschalten', () => {
    for (const s of ['en', 'de', 'zh']) {
      assert.match(html, new RegExp('data-sprache="' + s + '"'));
    }
  });

  test('uebersetzt auch die festen Texte im Geruest', () => {
    // Ueberschrift und Fusszeile stehen im HTML, nicht im Skript.
    assert.match(html, /data-t="Rangliste für MECCHA CHAMELEON – deine Runden zählen mit\."/);
    assert.match(skript(), /querySelectorAll\('\[data-t\]'\)/);
  });
});

describe('Kontoseite - Inhalt', () => {
  test('bietet die Anmeldung ueber Steam an', () => {
    assert.match(skript(), /href = '\/anmelden'/);
    assert.match(html, /Mit Steam anmelden/);
  });

  test('erklaert, wozu der Ingame-Name dient', () => {
    // Er entscheidet, welche Zeile gewertet wird - das muss dastehen.
    assert.match(html, /Rangliste/);
    assert.match(html, /Zeile/);
  });

  test('sagt, dass ein neuer Token den alten ungueltig macht', () => {
    assert.match(html, /alte Token wird dabei ungültig/);
  });

  test('verweist auf den Discord statt auf den Streamer persoenlich', () => {
    /* Zuschauer sollen sich bei Admins und Mods melden - der Streamer
       spielt und liest nebenbei keine Direktnachrichten. */
    assert.match(html, /Admin oder Mod/);
    assert.match(html, /discord\.gg/);
    assert.doesNotMatch(html, /beim Streamer/);
  });

  test('bietet das Abmelden an', () => {
    assert.match(skript(), /href = '\/abmelden'/);
  });

  test('bietet das Programm zum Herunterladen an', () => {
    /* Eine Bezugsquelle statt fuenf Anhaengen im Discord - und im KOPF,
       nicht unter der Rangliste. Dort wanderte der Knopf mit jedem neuen
       Spieler weiter nach unten, bis ihn niemand mehr sah. */
    /* Auf die Attributreihenfolge kommt es nicht an - sie hat diesen
       Test schon einmal gebrochen, als der Knopf eine id bekam.

       Das Ziel ist seit dem 21.08.2026 /download und nicht mehr /client:
       die Datei liegt bei GitHub. Das Skript setzt den Knopf danach auf
       die Release-Adresse um, sobald der Server sie nennt - bis dahin
       fuehrt er auf die Seite, die erklaert, was Sache ist. */
    assert.match(html, /<a[^>]*class="holen"[^>]*href="\/download"/);
    assert.match(html, /<a[^>]*class="holen-warum"[^>]*href="\/download"/);
  });

  test('nennt Fassung und Baudatum am Knopf, aber keine Groesse', () => {
    /* Die Nummer samt Datum sagt, ob man die aktuelle hat. Die GROESSE
       stand hier auch einmal - sie kam aus der Datei, die dieser Server
       auslieferte. Seit die bei GitHub liegt, kennt er sie nicht mehr,
       und was er nicht weiss, soll er nicht behaupten.

       Was wirklich passiert, prueft test/download-knopf.test.ts - dort
       laeuft die Seite. Diese Zeilen halten nur fest, woher die Angaben
       stammen. */
    assert.match(skript(), /holen-daten/);
    assert.match(skript(), /c\.gebaut/);
    assert.match(skript(), /c\.releases/);
    assert.doesNotMatch(skript(), /c\.groesse/);
  });

  test('der Download steht nur EINMAL auf der Seite', () => {
    /* Zweimal derselbe Knopf ist keine Hilfe, sondern die Frage, welcher
       der richtige ist. */
    const treffer = (kontoSeite().match(/class="holen"/g) ?? []).length;
    assert.equal(treffer, 1, 'genau ein Knopf zur Datei');
  });

  test('verspricht kein Entpacken mehr', () => {
    /* Umgedreht am 21.08.2026: ausgeliefert wird wieder die .exe.

       Die ZIP sollte Chromes Warnung umgehen - sie tut es nicht, ein
       Archiv mit einer unsignierten .exe darin wird genauso gemeldet.
       Damit blieb von ihr nur der Nachteil: entpacken ist ein Schritt
       mehr, den nicht jeder kann.

       Steht hier noch irgendwo "entpacken", ist ein Text von damals
       ueberlebt und schickt Leute in einen Arbeitsschritt, den es nicht
       mehr gibt. */
    assert.doesNotMatch(html, /entpacken|Unzip|unzip/i);
  });

  test('nennt die Mindestzahl-Regel gross, nicht im Kleingedruckten', () => {
    /* Wer die Regel nicht kennt, haelt eine nicht zaehlende Runde fuer
       einen Fehler. Der Streifen steht ueber beiden Reitern, die Zahl
       kommt aus /api/status - eine Quelle. */
    assert.match(html, /class="regel"/);
    assert.match(html, /data-tp="[^"]*Verstecker im Scoreboard[^"]*"/);
    assert.match(skript(), /\/api\/status/);
    assert.match(skript(), /minSpieler = s\.minSpieler/);
    // data-tp muss auch uebersetzt werden, sonst bleibt {0} stehen.
    assert.match(skript(), /querySelectorAll\('\[data-tp\]'\)/);
  });

  test('ist auffindbar und hat ein Zeichen in der Reiterleiste', () => {
    /* Die Seite hat einen Zweck: jemand sucht die Rangliste oder bekommt
       den Link aus dem Stream. Ohne Beschreibung steht in der Suche und
       in der Chat-Vorschau nur die nackte Adresse. */
    assert.match(html, /<meta name="description" content="[^"]{60,}">/);
    assert.match(html, /<meta name="robots" content="index, follow">/);
    assert.match(html, /<meta property="og:title"/);
    assert.match(html, /<meta property="og:description"/);
    assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
  });

  test('das Vorschaubild ist behauptet UND vorhanden', () => {
    /* Hier stand einmal das Gegenteil: "behauptet kein Vorschaubild,
       das es nicht gibt". Damals gab es keins, und ein toter Bildlink
       sieht in der Vorschau schlechter aus als gar keiner.

       Jetzt gibt es eins - und derselbe Gedanke gilt weiter, nur
       andersherum: es muss auch wirklich dort liegen. */
    assert.match(html, /<meta property="og:image" content="[^"]+\/karte\.png">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);

    const bild = path.join(import.meta.dirname, '..', 'public', 'karte.png');
    assert.ok(existsSync(bild), 'public/karte.png fehlt - siehe python/mach_karte.py');

    /* Discord und X rendern kein SVG. Und die Masse muessen stimmen:
       gibt man sie an und sie passen nicht, schneiden die Plattformen
       falsch zu. */
    assert.match(html, /<meta property="og:image:width" content="1200">/);
    assert.match(html, /<meta property="og:image:height" content="630">/);
  });

  test('erklaert die Windows-Warnung', () => {
    /* Ohne diesen Satz bricht ein Teil der Zuschauer beim SmartScreen ab
       und meldet sich nie wieder. */
    assert.match(html, /Trotzdem ausführen/);
  });

  test('fuehrt in nummerierten Schritten durch', () => {
    assert.match(html, /\.schritte li::before/, 'die Schritte brauchen ihre Ziffern');
    assert.match(skript(), /'schritte'/);
  });
});

describe('Kontoseite - Auf dem Sprung', () => {
  test('zeichnet den Block aus aufDemSprung', () => {
    /* Wer noch Anwaerter ist, steht ganz unten - hinter allen
       Gewerteten, auch wenn er besser spielt als sie alle. Der Block
       oben ist die Gegenmassnahme. */
    assert.match(skript(), /d\.aufDemSprung/);
    assert.match(skript(), /sprung-zeile/);
  });

  test('sagt dazu, wie viele Runden noch fehlen', () => {
    // Ohne die Zahl ist es kein Ansporn, sondern nur eine Feststellung.
    assert.match(skript(), /noch \{0\} Runden/);
  });

  test('verlinkt die Regelseite', () => {
    assert.match(kontoSeite(), /href="\/regeln"/);
  });
});

describe('Kontoseite - Uebersetzungen sind vollstaendig', () => {
  /*
     Dieselbe Wache wie bei Client und Dashboard, aus demselben Grund:
     t() gibt den deutschen Satz zurueck, wenn ein Eintrag fehlt. Das ist
     die richtige Rueckfallebene - sichtbarer Text statt einer Luecke -,
     bedeutet aber, dass ein vergessener Eintrag NIEMANDEM auffaellt.

     Beim Dashboard sind auf diesem Weg zwei Saetze monatelang deutsch
     geblieben, ohne dass es jemand bemerkt hat.
  */
  const quelle = kontoSeite();

  /** Saetze aus t('...'), auch ueber mehrere Zeilen mit + verkettet. */
  const schluessel = (): string[] => {
    const raus: string[] = [];
    const start = /\bt\(\s*'/g;
    let treffer: RegExpExecArray | null;

    while ((treffer = start.exec(quelle)) !== null) {
      let i = treffer.index + treffer[0].length;
      let ganz = '';

      for (;;) {
        while (i < quelle.length && quelle[i] !== "'") {
          if (quelle[i] === '\\') { ganz += quelle[i + 1]!; i += 2; continue; }
          ganz += quelle[i]!;
          i++;
        }
        i++;
        const weiter = /^\s*\+\s*'/.exec(quelle.slice(i));
        if (!weiter) break;
        i += weiter[0].length;
      }
      raus.push(ganz);
    }
    return raus;
  };

  test('jeder Satz steht in der Woerterliste', () => {
    const alle = schluessel();
    assert.ok(alle.length > 40, 'die Suche muss etwas finden, sonst prueft sie nichts');

    const fehlen = [...new Set(alle)].filter((k) => !quelle.includes("'" + k + "':"));
    assert.deepEqual(fehlen, [],
      'ohne Eintrag bleibt der Satz auf Deutsch stehen');
  });

  test('nichts ist doppelt kodiert', () => {
    /* Ein Zeichen, dessen UTF-8-Bytes als Latin-1 gelesen wurden, trifft
       seinen Schluessel nicht mehr - und dann bleibt die Zeile still auf
       Deutsch, obwohl eine Uebersetzung dasteht. */
    const verdaechtig = quelle.split('\n')
      .map((z, i) => ({ z, nr: i + 1 }))
      .filter(({ z }) => /Ã.|â..|Ã¼|Ã¶|Ã¤|ÃŸ/.test(z));

    assert.deepEqual(verdaechtig.map((v) => v.nr), [],
      'doppelt kodiert: ' + verdaechtig.map((v) => v.z.trim().slice(0, 60)).join(' | '));
  });
});

describe('Kontoseite - die Pruefsumme', () => {
  const quelle = kontoSeite();

  test('holt sie vom Server statt sie fest einzutragen', () => {
    /* Eine hinterlegte Pruefsumme waere nach dem naechsten BAUEN.bat
       falsch - und eine falsche ist schlimmer als keine: sie laesst die
       echte Datei manipuliert aussehen. */
    assert.match(quelle, /fetch\('\/api\/client'\)/);
    assert.doesNotMatch(quelle, /[0-9a-f]{64}/,
      'im Quelltext darf keine feste SHA-256 stehen');
  });

  test('schickt zum HOCHLADEN, nicht zur Abfrage nach Pruefsumme', () => {
    /* Siehe download.test.ts: eine Abfrage nach Pruefsumme antwortet bei
       einer frisch gebauten .exe mit "not found", und das ist schlimmer
       als kein Link. */
    assert.match(quelle, /virustotal\.com\/gui\/home\/upload/);
    assert.doesNotMatch(quelle, /virustotal\.com\/gui\/file/);
  });

  test('nennt keine Pruefsumme mehr, sondern sagt wo sie steht', () => {
    /* Sie kam aus der Datei, die dieser Server auslieferte - deshalb
       konnte sie gar nicht falsch sein. Seit die Datei bei GitHub liegt,
       kann er sie nicht mehr ausrechnen, und eine geratene Pruefsumme
       ist schlimmer als keine: sie laesst die echte Datei manipuliert
       aussehen. */
    assert.doesNotMatch(quelle, /c\.sha256/);
    assert.match(quelle, /Get-FileHash/);
  });

  test('bleibt brauchbar, wenn die Auskunft ausfaellt', () => {
    // Ohne Pruefsumme ist der Rest des Kastens weiterhin nuetzlich.
    assert.match(quelle, /pruef\.remove\(\)/);
  });
});

describe('Kontoseite - die Rangliste bleibt frisch', () => {
  const quelle = kontoSeite();

  test('laedt sich in einem Takt nach', () => {
    /* Sie ist der Grund, warum jemand die Seite offen HAELT - waehrend
       des Streams liegt sie auf dem zweiten Bildschirm. Vorher lief
       ladeRangliste() genau einmal, und wer eine Runde eingeschickt
       hatte, musste neu laden, um sie zu sehen. */
    assert.match(quelle, /setInterval\(function \(\) \{\s*if \(document\.hidden\) return;\s*ladeRangliste\(\);/);
  });

  test('fragt nicht, wenn niemand hinsieht', () => {
    // Ein vergessener Hintergrundtab soll den Server nicht stundenlang befragen.
    assert.match(quelle, /document\.hidden/);
    assert.match(quelle, /visibilitychange/);
  });

  test('merkt sich die angesehene Liste an ihrer Kennung, nicht an der Position', () => {
    /* Beim Aktualisieren kommen die Listen neu vom Server, sortiert nach
       aktiv und Anlagedatum. An der Position festgehalten, saehe man
       nach fuenfzehn Sekunden ploetzlich eine andere Liste - ohne etwas
       geklickt zu haben. */
    assert.match(quelle, /gewaehlteKennung/);
    assert.match(quelle, /ranglisten\[gi\]\.id === gewaehlteKennung/);
  });
});

describe('Kontoseite - kein Zugriff auf Fremdes', () => {
  /*
     Anlass: in ladeRangliste() stand einmal kopfDaten.voll - eine
     Variable, die es nur INNERHALB von baueRangliste() gibt. Zur
     Laufzeit warf das einen ReferenceError, der catch schluckte ihn,
     und die oeffentliche Rangliste blieb einfach leer. Kein Test hat
     angeschlagen, weil syntaktisch alles stimmte.
  */
  test('kopfDaten wird nur dort benutzt, wo es auch existiert', () => {
    const quelle = kontoSeite();
    const anfang = quelle.indexOf('function baueRangliste(d, kopfDaten)');
    const ende = quelle.indexOf('function ladeRangliste()');
    assert.ok(anfang > 0 && ende > anfang, 'beide Funktionen muessen da sein');

    const danach = quelle.slice(ende);
    assert.doesNotMatch(danach, /kopfDaten/,
      'kopfDaten ist ein Parameter von baueRangliste und ausserhalb undefiniert');
  });
});

describe('Kontoseite - vier Sprachen, keine mit Luecken', () => {
  const quelle = kontoSeite();

  /** Die Schluessel eines Sprachblocks, in Quelltextform. */
  const schluesselVon = (kennung: string): string[] => {
    const anfang = quelle.indexOf('    ' + kennung + ': {');
    assert.ok(anfang > 0, 'der Block ' + kennung + ' fehlt');

    // Bis zum naechsten Block bzw. bis zum Ende der Tabelle
    const rest = quelle.slice(anfang + 8);
    const naechster = rest.search(/^ {4}(?:en|zh|ja): \{|^ {2}\};/m);
    const block = naechster > 0 ? rest.slice(0, naechster) : rest;

    return [...block.matchAll(/^ {6}'((?:[^'\\]|\\.)*)':/gm)].map((m) => m[1]!);
  };

  test('es gibt einen japanischen Block', () => {
    assert.ok(quelle.includes('    ja: {'));
    assert.match(quelle, /data-sprache="ja"/, 'und einen Knopf dafuer');
  });

  test('Japanisch hat jeden Satz, den Englisch hat', () => {
    /* Ein fehlender Eintrag faellt still auf Deutsch zurueck. Richtig
       als Rueckfallebene - aber dann steht auf einer japanischen Seite
       ploetzlich ein deutscher Satz, und niemand meldet es. */
    const en = schluesselVon('en');
    const ja = schluesselVon('ja');

    assert.ok(en.length > 100, 'zu wenige englische Saetze gefunden: ' + en.length);

    const fehlen = en.filter((k) => !ja.includes(k));
    assert.deepEqual(fehlen.map((f) => f.slice(0, 60)), [],
      'diese Saetze fehlen auf Japanisch');
  });

  test('Chinesisch ebenso', () => {
    const en = schluesselVon('en');
    const zh = schluesselVon('zh');
    const fehlen = en.filter((k) => !zh.includes(k));
    assert.deepEqual(fehlen.map((f) => f.slice(0, 60)), []);
  });

  test('die japanischen Texte sind wirklich japanisch', () => {
    // Faengt Buchstabensalat ab, falls doch einmal falsch kodiert wird.
    const anfang = quelle.indexOf('    ja: {');
    const block = quelle.slice(anfang);
    const kana = block.match(/[ぁ-んァ-ン]/g) ?? [];
    assert.ok(kana.length > 300, 'nur ' + kana.length + ' Kana gefunden');
  });

  test('die Browsersprache wird als Vorauswahl benutzt', () => {
    /* Wer aus Japan kommt, soll nicht erst einen Knopf suchen muessen.
       Englisch bleibt die Rueckfallebene - die Zuschauer kommen aus dem
       Stream, nicht aus dem Nachbarort. */
    assert.match(quelle, /navigator\.language/);
    assert.match(quelle, /kurz === 'ja'/);
  });
});

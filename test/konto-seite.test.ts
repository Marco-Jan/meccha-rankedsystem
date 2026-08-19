import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

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
    assert.match(html, /data-t="Deine Runden zählen mit\."/);
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
    // Eine Bezugsquelle statt fuenf Anhaengen im Discord.
    assert.match(skript(), /href = '\/client'/);
    assert.match(html, /Meccha-Ranked\.zip/);
  });

  test('liefert als ZIP aus, nicht als nackte .exe', () => {
    /* Chrome blockt eine unsignierte .exe von einer jungen Domain hart
       weg - "Verdaechtiger Download blockiert", ohne Knopf zum
       Trotzdem-Laden. Als Archiv kommt sie durch. Faellt das zurueck,
       laedt kein Zuschauer den Client mehr herunter. */
    assert.doesNotMatch(html, /⬇\s*Meccha-Ranked\.exe/);
    assert.match(html, /entpacken/i);
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

  test('behauptet kein Vorschaubild, das es nicht gibt', () => {
    // Discord und X rendern kein SVG - ein toter Bildlink sieht in der
    // Vorschau schlechter aus als gar keiner.
    assert.doesNotMatch(html, /<meta property="og:image"/);
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

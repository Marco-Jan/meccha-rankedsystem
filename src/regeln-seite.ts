/* =========================================================================
   DIE REGELSEITE

   Was zaehlt und was nicht - fuer Spieler, nicht fuer Entwickler.

   -------------------------------------------------------------------------
   WAS HIER NICHT HINGEHOERT

   Eine frueherer Fassung erklaerte auch, WIE geprueft wird: die vier
   Betrugshuerden, der Bild-Hash, die Partie-Kennung, wie lange welches
   Bild liegt. Das ist alles wahr und alles uninteressant. Wer wissen
   will, ob seine Runde zaehlt, braucht keine Erklaerung der
   Pruefmechanik - er braucht die Regel.

   Schlimmer noch: eine Seite, die dem Betrueger erklaert, woran er
   erkannt wird, hilft vor allem ihm. Und dem ehrlichen Spieler liest
   sich dieselbe Aufzaehlung wie ein Generalverdacht.

   Geblieben ist, was jemand tatsaechlich braucht:
     - wann eine Runde zaehlt
     - wie man F9 richtig drueckt
     - wie der Rang entsteht
     - warum eine Runde abgelehnt werden kann (kurz, ohne Mechanik)

   -------------------------------------------------------------------------
   DIE ZAHLEN KOMMEN AUS DEM CODE

   Deshalb wird diese Seite erzeugt und nicht als HTML abgelegt. Eine
   Regelseite, die "mindestens 6 Verstecker" behauptet, waehrend der
   Server bei 8 abweist, ist schlimmer als gar keine: sie erzeugt
   Vertrauen, das sie nicht deckt, und beide Stellen sehen fuer sich
   betrachtet stimmig aus.

   -------------------------------------------------------------------------
   DREI SPRACHEN, wie ueberall im Projekt.

   Der deutsche Satz ist der Schluessel, Englisch ist die Vorgabe -
   dieselbe Regel wie auf der Kontoseite und im Client. Gewechselt wird
   im Browser, ohne Neuladen: die Seite traegt alle drei Fassungen bei
   sich. Das ist bei zwei Bildschirmseiten Text die einfachere Loesung
   als drei Anfragen an den Server.
   ========================================================================= */

import { FENSTER, VOLL, SPRUNG_AB, SPRUNG_PLATZ } from './rangliste.js';
import { MAX_RANG } from './leser.js';
import { ABSTAND_ANGENOMMEN_MS, ABSTAND_FEHLSCHLAG_MS } from './tokens.js';
import { NAMENSSPERRE_TAGE } from './konten.js';
import { verteilung } from './config.js';

export interface RegelZahlen {
  /** Mindestzahl Verstecker im Scoreboard. Aus server.ts. */
  readonly minSpieler: number;
}

/** Minuten oder Sekunden, je nachdem was sich besser liest. */
function minuten(ms: number): number {
  return Math.round(ms / 60000);
}
function sekunden(ms: number): number {
  return Math.round(ms / 1000);
}

export function regelnSeite(zahlen: RegelZahlen): string {
  const discord = verteilung().discord;
  const url = (verteilung().server || '').replace(/\/+$/, '');

  const z = {
    min: zahlen.minSpieler,
    rang: MAX_RANG,
    fenster: FENSTER,
    voll: VOLL,
    sprungAb: SPRUNG_AB,
    sprungPlatz: SPRUNG_PLATZ,
    pause: minuten(ABSTAND_ANGENOMMEN_MS),
    kurz: sekunden(ABSTAND_FEHLSCHLAG_MS),
    namensTage: NAMENSSPERRE_TAGE
  };

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Regeln – Meccha Ranked</title>
<meta name="description" content="Wann eine Runde zählt und wie der Rang entsteht.">${url ? `
<link rel="canonical" href="${url}/regeln">` : ''}
<style>
  :root {
    --grund:#0d1017; --flaeche:#161b24; --kante:#28313f;
    --text:#e8ecf3; --leise:#95a1b3;
    --akzent:#66c0f4; --zahl:#ffb020;
    --schrift:"Segoe UI", system-ui, -apple-system, sans-serif;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --grund:#f3f6fa; --flaeche:#ffffff; --kante:#d7dfeb;
      --text:#16202e; --leise:#5c6a7d;
    }
  }
  * { box-sizing:border-box; }
  body {
    margin:0; background:var(--grund); color:var(--text);
    font:15px/1.65 var(--schrift);
  }
  .huelle { max-width:640px; margin:0 auto; padding:30px 20px 70px; }
  a { color:var(--akzent); }

  .oben { display:flex; align-items:center; gap:12px; margin-bottom:26px; }
  .oben a { font-size:14px; }
  .sprachen { margin-left:auto; display:flex; gap:5px; }
  .sprachen button {
    background:var(--flaeche); color:var(--leise);
    border:1px solid var(--kante); border-radius:6px;
    padding:4px 9px; font-size:12px; cursor:pointer; font-family:inherit;
  }
  .sprachen button.aktiv { color:var(--text); border-color:var(--akzent); }

  h1 { font-size:26px; margin:0 0 26px; }
  h2 {
    font-size:16px; margin:30px 0 10px;
    padding-bottom:6px; border-bottom:1px solid var(--kante);
  }

  .karte {
    background:var(--flaeche); border:1px solid var(--kante);
    border-radius:11px; padding:15px 17px; margin:12px 0;
  }
  table { width:100%; border-collapse:collapse; }
  td { padding:8px 4px; border-bottom:1px solid var(--kante); vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  td:first-child { white-space:nowrap; padding-right:18px; font-weight:600; }
  .z { color:var(--zahl); font-variant-numeric:tabular-nums; }

  ul { margin:8px 0; padding-left:20px; }
  li { margin:6px 0; }
  .leise { color:var(--leise); }
  .klein { font-size:13.5px; }
  footer { margin-top:38px; color:var(--leise); font-size:13px; }
</style>
</head>
<body>
<div class="huelle">

<div class="oben">
  <a href="/" data-t="Zur Rangliste">&#8592; Zur Rangliste</a>
  <div class="sprachen" id="sprachen">
    <button data-sprache="de">Deutsch</button>
    <button data-sprache="en">English</button>
    <button data-sprache="zh">中文</button>
  </div>
</div>

<h1 data-t="Regeln">Regeln</h1>

<h2 data-t="Wann zählt eine Runde?">Wann zählt eine Runde?</h2>

<div class="karte"><table>
  <tr>
    <td><span class="z">${z.min}</span> <span data-t="Verstecker">Verstecker</span></td>
    <td data-tp="So viele müssen mindestens im Scoreboard stehen. In einer winzigen Runde wäre der eigene Platz zu leicht zu steuern.">So viele müssen mindestens im Scoreboard stehen. In einer winzigen Runde wäre der eigene Platz zu leicht zu steuern.</td>
  </tr>
  <tr>
    <td data-tp="Rang 1–{0}">Rang 1–${z.rang}</td>
    <td data-tp="Nur diese Plätze werden gewertet. Wer weiter unten landet, bekommt keinen Eintrag – nicht etwa einen schlechten.">Nur diese Plätze werden gewertet. Wer weiter unten landet, bekommt keinen Eintrag – nicht etwa einen schlechten.</td>
  </tr>
  <tr>
    <td data-t="Angemeldet">Angemeldet</td>
    <td data-tp="Mit Steam, und mit eingetragenem Ingame-Namen. Ohne den lässt sich nicht sagen, welche Zeile dir gehört.">Mit Steam, und mit eingetragenem Ingame-Namen. Ohne den lässt sich nicht sagen, welche Zeile dir gehört.</td>
  </tr>
</table></div>

<p class="klein leise" data-tp="Im Scoreboard stehen nur die Verstecker, nie die Jäger. Wer als Jäger spielt, drückt einfach kein F9 – in dieser Runde ist nichts zu holen.">Im Scoreboard stehen nur die Verstecker, nie die Jäger. Wer als Jäger spielt, drückt einfach kein F9 – in dieser Runde ist nichts zu holen.</p>

<h2 data-t="F9 richtig drücken">F9 richtig drücken</h2>

<div class="karte">
<ul>
  <li data-tp="Am Ende der Runde, wenn die Rangliste vollständig steht.">Am Ende der Runde, wenn die Rangliste vollständig steht.</li>
  <li data-tp="Dabei auf einen ruhigen Hintergrund schauen – Himmel oder eine Wand statt buntem Boden.">Dabei auf einen ruhigen Hintergrund schauen – Himmel oder eine Wand statt buntem Boden.</li>
</ul>
<p class="klein leise" data-tp="Die Schrift im Spiel ist durchsichtig. Über Wiese und Bonbons verschwindet sie halb, und dann ist die Rangliste nicht mehr lesbar. Es liegt nicht an dir und nicht an deinem Rechner – nur am Bild.">Die Schrift im Spiel ist durchsichtig. Über Wiese und Bonbons verschwindet sie halb, und dann ist die Rangliste nicht mehr lesbar. Es liegt nicht an dir und nicht an deinem Rechner – nur am Bild.</p>
</div>

<h2 data-t="Wie entsteht dein Rang?">Wie entsteht dein Rang?</h2>

<div class="karte"><table>
  <tr>
    <td data-tp="Schnitt der letzten {0}">Schnitt der letzten ${z.fenster}</td>
    <td data-tp="Gewertet werden die Punkte aus dem Spiel, nicht die Platzierung.">Gewertet werden die Punkte aus dem Spiel, nicht die Platzierung.</td>
  </tr>
  <tr>
    <td data-tp="Ab {0} Runden">Ab ${z.voll} Runden</td>
    <td data-tp="Erst dann stehst du in der Wertung. Davor bist du Anwärter: sichtbar mit Schnitt, aber ohne Platz. So wird jeder über gleich viele Ergebnisse verglichen.">Erst dann stehst du in der Wertung. Davor bist du Anwärter: sichtbar mit Schnitt, aber ohne Platz. So wird jeder über gleich viele Ergebnisse verglichen.</td>
  </tr>
  <tr>
    <td data-t="Gleichstand">Gleichstand</td>
    <td data-tp="Wer mehr Einträge hat, steht vorne – er hat es öfter gezeigt.">Wer mehr Einträge hat, steht vorne – er hat es öfter gezeigt.</td>
  </tr>
</table></div>

<p class="klein leise" data-tp="Ein alter Ausrutscher verschwindet von selbst: sobald {0} neuere Runden da sind, fällt er aus der Wertung.">Ein alter Ausrutscher verschwindet von selbst: sobald ${z.fenster} neuere Runden da sind, fällt er aus der Wertung.</p>

<h2 data-t="Auf dem Sprung">Auf dem Sprung</h2>

<p data-tp="Anwärter, deren Schnitt für die ersten {0} reichen würde, stehen zusätzlich ganz oben – ab {1} Runden. Sonst stünde der Beste der Neuen am Ende einer Liste, in der er eigentlich vorne wäre.">Anwärter, deren Schnitt für die ersten ${z.sprungPlatz} reichen würde, stehen zusätzlich ganz oben – ab ${z.sprungAb} Runden. Sonst stünde der Beste der Neuen am Ende einer Liste, in der er eigentlich vorne wäre.</p>

<h2 data-t="Mehrere Ranglisten">Mehrere Ranglisten</h2>

<p data-tp="Es kann mehrere Ranglisten gleichzeitig geben, etwa eine fürs Jahr und eine für den Monat. Eine Runde zählt dann für alle – einmal F9 genügt.">Es kann mehrere Ranglisten gleichzeitig geben, etwa eine fürs Jahr und eine für den Monat. Eine Runde zählt dann für alle – einmal F9 genügt.</p>

<h2 data-t="Pause zwischen zwei Runden">Pause zwischen zwei Runden</h2>

<div class="karte"><table>
  <tr>
    <td data-tp="{0} Minuten">${z.pause} Minuten</td>
    <td data-tp="nachdem eine Runde angenommen wurde">nachdem eine Runde angenommen wurde</td>
  </tr>
  <tr>
    <td data-tp="{0} Sekunden">${z.kurz} Sekunden</td>
    <td data-tp="wenn sie nicht verwertbar war – dann darfst du es gleich noch einmal versuchen">wenn sie nicht verwertbar war – dann darfst du es gleich noch einmal versuchen</td>
  </tr>
</table></div>

<h2 data-t="Dein Ingame-Name">Dein Ingame-Name</h2>

<div class="karte">
<ul>
  <li data-tp="Eindeutig über alle Konten. Wer zuerst da ist, dem gehört der Name.">Eindeutig über alle Konten. Wer zuerst da ist, dem gehört der Name.</li>
  <li data-tp="Nur alle {0} Tage änderbar.">Nur alle ${z.namensTage} Tage änderbar.</li>
</ul>
<p class="klein leise" data-tp="Beides hat denselben Grund: Der Name entscheidet, welche Zeile des Scoreboards dir gutgeschrieben wird.">Beides hat denselben Grund: Der Name entscheidet, welche Zeile des Scoreboards dir gutgeschrieben wird.</p>
</div>

<h2 data-t="Wenn eine Runde abgelehnt wird">Wenn eine Runde abgelehnt wird</h2>

<p data-tp="Jede Einreichung sieht sich ein Mensch an, bevor sie zählt. Wird sie abgelehnt, steht der Grund im Programm und auf deiner Kontoseite – meistens ist es schlicht ein Bild, auf dem die Zahlen nicht sicher zu lesen sind.">Jede Einreichung sieht sich ein Mensch an, bevor sie zählt. Wird sie abgelehnt, steht der Grund im Programm und auf deiner Kontoseite – meistens ist es schlicht ein Bild, auf dem die Zahlen nicht sicher zu lesen sind.</p>

<p class="klein leise" data-tp="Kommt dir eine Entscheidung falsch vor, frag im Discord nach. Dort sieht sich das jemand noch einmal an.">Kommt dir eine Entscheidung falsch vor, frag im Discord nach. Dort sieht sich das jemand noch einmal an.</p>

<footer>
  <a href="/" data-t="Rangliste">Rangliste</a> ·
  <a href="/konto" data-t="Dein Zugang">Dein Zugang</a> ·
  <a href="/download" data-t="Programm">Programm</a>${discord ? ` ·
  <a href="${discord}" rel="noopener">Discord</a>` : ''}
</footer>

</div>

<script>
(function () {
  'use strict';

  /* Die Zahlen stehen schon im HTML - der Server hat sie eingesetzt.
     Uebersetzt werden nur die Saetze drumherum, und Platzhalter darin
     bekommen dieselben Zahlen wieder. So gibt es sie an einer Stelle. */
  var ZAHLEN = ${JSON.stringify(z)};

  var WOERTER = {
    en: {
      'Zur Rangliste': '\\u2190 Back to leaderboard',
      'Rangliste': 'Leaderboard',
      'Dein Zugang': 'Your access',
      'Programm': 'The app',
      'Regeln': 'Rules',

      'Wann zählt eine Runde?': 'When does a round count?',
      'Verstecker': 'hiders',
      'So viele müssen mindestens im Scoreboard stehen. In einer winzigen Runde wäre der eigene Platz zu leicht zu steuern.':
        'That many must be on the scoreboard at least. In a tiny round your own placement would be far too easy to arrange.',
      'Rang 1–{0}': 'Rank 1–{0}',
      'Nur diese Plätze werden gewertet. Wer weiter unten landet, bekommt keinen Eintrag – nicht etwa einen schlechten.':
        'Only these places count. Finish lower and you get no entry at all \\u2013 not a bad one.',
      'Angemeldet': 'Signed in',
      'Mit Steam, und mit eingetragenem Ingame-Namen. Ohne den lässt sich nicht sagen, welche Zeile dir gehört.':
        'With Steam, and with your in-game name entered. Without it there is no way to tell which row is yours.',
      'Im Scoreboard stehen nur die Verstecker, nie die Jäger. Wer als Jäger spielt, drückt einfach kein F9 – in dieser Runde ist nichts zu holen.':
        'The scoreboard lists only hiders, never hunters. If you are a hunter, simply do not press F9 \\u2013 there is nothing to earn that round.',

      'F9 richtig drücken': 'Pressing F9 properly',
      'Am Ende der Runde, wenn die Rangliste vollständig steht.':
        'At the end of the round, once the leaderboard is complete.',
      'Dabei auf einen ruhigen Hintergrund schauen – Himmel oder eine Wand statt buntem Boden.':
        'While looking at a calm background \\u2013 sky or a wall instead of colourful ground.',
      'Die Schrift im Spiel ist durchsichtig. Über Wiese und Bonbons verschwindet sie halb, und dann ist die Rangliste nicht mehr lesbar. Es liegt nicht an dir und nicht an deinem Rechner – nur am Bild.':
        'The in-game text is see-through. Over grass and candy it half disappears, and then the leaderboard cannot be read. It is not you and not your computer \\u2013 only the picture.',

      'Wie entsteht dein Rang?': 'How is your rank calculated?',
      'Schnitt der letzten {0}': 'Average of your last {0}',
      'Gewertet werden die Punkte aus dem Spiel, nicht die Platzierung.':
        'Your in-game points count, not your placement.',
      'Ab {0} Runden': 'From {0} rounds',
      'Erst dann stehst du in der Wertung. Davor bist du Anwärter: sichtbar mit Schnitt, aber ohne Platz. So wird jeder über gleich viele Ergebnisse verglichen.':
        'Only then are you ranked. Before that you are a contender: visible with an average, but without a place. That way everyone is compared over the same number of results.',
      'Gleichstand': 'Tie',
      'Wer mehr Einträge hat, steht vorne – er hat es öfter gezeigt.':
        'Whoever has more entries comes first \\u2013 they showed it more often.',
      'Ein alter Ausrutscher verschwindet von selbst: sobald {0} neuere Runden da sind, fällt er aus der Wertung.':
        'An old slip-up disappears on its own: once {0} newer rounds exist, it drops out.',

      'Auf dem Sprung': 'On the verge',
      'Anwärter, deren Schnitt für die ersten {0} reichen würde, stehen zusätzlich ganz oben – ab {1} Runden. Sonst stünde der Beste der Neuen am Ende einer Liste, in der er eigentlich vorne wäre.':
        'Contenders whose average would reach the top {0} also appear at the very top \\u2013 from {1} rounds on. Otherwise the best newcomer would sit at the bottom of a list they actually lead.',

      'Mehrere Ranglisten': 'Several leaderboards',
      'Es kann mehrere Ranglisten gleichzeitig geben, etwa eine fürs Jahr und eine für den Monat. Eine Runde zählt dann für alle – einmal F9 genügt.':
        'There can be several leaderboards at once, say one for the year and one for the month. A round then counts for all of them \\u2013 pressing F9 once is enough.',

      'Pause zwischen zwei Runden': 'Pause between two rounds',
      '{0} Minuten': '{0} minutes',
      'nachdem eine Runde angenommen wurde': 'after a round was accepted',
      '{0} Sekunden': '{0} seconds',
      'wenn sie nicht verwertbar war – dann darfst du es gleich noch einmal versuchen':
        'if it could not be used \\u2013 then you may try again right away',

      'Dein Ingame-Name': 'Your in-game name',
      'Eindeutig über alle Konten. Wer zuerst da ist, dem gehört der Name.':
        'Unique across all accounts. First come, first served.',
      'Nur alle {0} Tage änderbar.': 'Changeable only every {0} days.',
      'Beides hat denselben Grund: Der Name entscheidet, welche Zeile des Scoreboards dir gutgeschrieben wird.':
        'Both for the same reason: the name decides which row of the scoreboard is credited to you.',

      'Wenn eine Runde abgelehnt wird': 'If a round is rejected',
      'Jede Einreichung sieht sich ein Mensch an, bevor sie zählt. Wird sie abgelehnt, steht der Grund im Programm und auf deiner Kontoseite – meistens ist es schlicht ein Bild, auf dem die Zahlen nicht sicher zu lesen sind.':
        'A human looks at every submission before it counts. If it is rejected, the reason appears in the app and on your account page \\u2013 usually it is simply a picture where the numbers cannot be read reliably.',
      'Kommt dir eine Entscheidung falsch vor, frag im Discord nach. Dort sieht sich das jemand noch einmal an.':
        'If a decision seems wrong to you, ask on Discord. Someone will take another look.'
    },

    zh: {
      'Zur Rangliste': '\\u2190 \\u8fd4\\u56de\\u6392\\u884c\\u699c',
      'Rangliste': '\\u6392\\u884c\\u699c',
      'Dein Zugang': '\\u4f60\\u7684\\u6743\\u9650',
      'Programm': '\\u5ba2\\u6237\\u7aef',
      'Regeln': '\\u89c4\\u5219',

      'Wann zählt eine Runde?': '\\u4ec0\\u4e48\\u65f6\\u5019\\u4e00\\u5c40\\u4f1a\\u8ba1\\u5206\\uff1f',
      'Verstecker': '\\u540d\\u8eb2\\u85cf\\u8005',
      'So viele müssen mindestens im Scoreboard stehen. In einer winzigen Runde wäre der eigene Platz zu leicht zu steuern.':
        '\\u8ba1\\u5206\\u677f\\u4e0a\\u81f3\\u5c11\\u8981\\u6709\\u8fd9\\u4e48\\u591a\\u4eba\\u3002\\u5728\\u4eba\\u6570\\u5f88\\u5c11\\u7684\\u5bf9\\u5c40\\u91cc\\uff0c\\u540d\\u6b21\\u592a\\u5bb9\\u6613\\u88ab\\u64cd\\u63a7\\u3002',
      'Rang 1–{0}': '\\u7b2c 1\\u2013{0} \\u540d',
      'Nur diese Plätze werden gewertet. Wer weiter unten landet, bekommt keinen Eintrag – nicht etwa einen schlechten.':
        '\\u53ea\\u6709\\u8fd9\\u4e9b\\u540d\\u6b21\\u8ba1\\u5206\\u3002\\u6392\\u5728\\u66f4\\u540e\\u9762\\u4e0d\\u4f1a\\u5f97\\u5230\\u6761\\u76ee \\u2013 \\u800c\\u4e0d\\u662f\\u5f97\\u5230\\u4e00\\u4e2a\\u5dee\\u6210\\u7ee9\\u3002',
      'Angemeldet': '\\u5df2\\u767b\\u5f55',
      'Mit Steam, und mit eingetragenem Ingame-Namen. Ohne den lässt sich nicht sagen, welche Zeile dir gehört.':
        '\\u4f7f\\u7528 Steam \\u767b\\u5f55\\uff0c\\u5e76\\u586b\\u5199\\u6e38\\u620f\\u5185\\u540d\\u79f0\\u3002\\u5426\\u5219\\u65e0\\u6cd5\\u5224\\u65ad\\u54ea\\u4e00\\u884c\\u662f\\u4f60\\u3002',
      'Im Scoreboard stehen nur die Verstecker, nie die Jäger. Wer als Jäger spielt, drückt einfach kein F9 – in dieser Runde ist nichts zu holen.':
        '\\u8ba1\\u5206\\u677f\\u4e0a\\u53ea\\u6709\\u8eb2\\u85cf\\u8005\\uff0c\\u4ece\\u4e0d\\u5305\\u62ec\\u730e\\u4eba\\u3002\\u5f53\\u730e\\u4eba\\u65f6\\u5c31\\u4e0d\\u8981\\u6309 F9 \\u2013 \\u8fd9\\u4e00\\u5c40\\u6ca1\\u6709\\u5206\\u53ef\\u62ff\\u3002',

      'F9 richtig drücken': '\\u6b63\\u786e\\u5730\\u6309 F9',
      'Am Ende der Runde, wenn die Rangliste vollständig steht.':
        '\\u5728\\u4e00\\u5c40\\u7ed3\\u675f\\u65f6\\uff0c\\u6392\\u884c\\u699c\\u5b8c\\u6574\\u663e\\u793a\\u4e4b\\u540e\\u3002',
      'Dabei auf einen ruhigen Hintergrund schauen – Himmel oder eine Wand statt buntem Boden.':
        '\\u540c\\u65f6\\u770b\\u5411\\u5e72\\u51c0\\u7684\\u80cc\\u666f \\u2013 \\u5929\\u7a7a\\u6216\\u5899\\u58c1\\uff0c\\u800c\\u4e0d\\u662f\\u4e94\\u989c\\u516d\\u8272\\u7684\\u5730\\u9762\\u3002',
      'Die Schrift im Spiel ist durchsichtig. Über Wiese und Bonbons verschwindet sie halb, und dann ist die Rangliste nicht mehr lesbar. Es liegt nicht an dir und nicht an deinem Rechner – nur am Bild.':
        '\\u6e38\\u620f\\u5185\\u7684\\u6587\\u5b57\\u662f\\u534a\\u900f\\u660e\\u7684\\u3002\\u5728\\u8349\\u5730\\u548c\\u7cd6\\u679c\\u4e0a\\u5b83\\u4f1a\\u534a\\u9690\\u5f62\\uff0c\\u6392\\u884c\\u699c\\u5c31\\u65e0\\u6cd5\\u8bc6\\u522b\\u3002\\u8fd9\\u4e0d\\u662f\\u4f60\\u7684\\u9519\\uff0c\\u4e5f\\u4e0d\\u662f\\u7535\\u8111\\u7684\\u9519 \\u2013 \\u53ea\\u662f\\u56fe\\u7247\\u7684\\u95ee\\u9898\\u3002',

      'Wie entsteht dein Rang?': '\\u6392\\u540d\\u662f\\u600e\\u4e48\\u7b97\\u7684\\uff1f',
      'Schnitt der letzten {0}': '\\u6700\\u8fd1 {0} \\u5c40\\u7684\\u5747\\u5206',
      'Gewertet werden die Punkte aus dem Spiel, nicht die Platzierung.':
        '\\u8ba1\\u5206\\u4f9d\\u636e\\u662f\\u6e38\\u620f\\u5185\\u5206\\u6570\\uff0c\\u800c\\u975e\\u540d\\u6b21\\u3002',
      'Ab {0} Runden': '\\u6ee1 {0} \\u5c40\\u8d77',
      'Erst dann stehst du in der Wertung. Davor bist du Anwärter: sichtbar mit Schnitt, aber ohne Platz. So wird jeder über gleich viele Ergebnisse verglichen.':
        '\\u8fbe\\u5230\\u540e\\u624d\\u6b63\\u5f0f\\u8fdb\\u5165\\u6392\\u540d\\u3002\\u5728\\u6b64\\u4e4b\\u524d\\u4f60\\u662f\\u5019\\u8865\\uff1a\\u53ef\\u4ee5\\u770b\\u5230\\u5747\\u5206\\uff0c\\u4f46\\u6ca1\\u6709\\u540d\\u6b21\\u3002\\u8fd9\\u6837\\u6bcf\\u4e2a\\u4eba\\u90fd\\u57fa\\u4e8e\\u76f8\\u540c\\u6570\\u91cf\\u7684\\u6210\\u7ee9\\u6bd4\\u8f83\\u3002',
      'Gleichstand': '\\u5e73\\u5c40',
      'Wer mehr Einträge hat, steht vorne – er hat es öfter gezeigt.':
        '\\u6761\\u76ee\\u591a\\u7684\\u6392\\u5728\\u524d\\u9762 \\u2013 \\u4ed6\\u8bc1\\u660e\\u4e86\\u66f4\\u591a\\u6b21\\u3002',
      'Ein alter Ausrutscher verschwindet von selbst: sobald {0} neuere Runden da sind, fällt er aus der Wertung.':
        '\\u4ee5\\u524d\\u7684\\u5931\\u8bef\\u4f1a\\u81ea\\u884c\\u6d88\\u5931\\uff1a\\u53ea\\u8981\\u6709 {0} \\u5c40\\u66f4\\u65b0\\u7684\\u6210\\u7ee9\\uff0c\\u5b83\\u5c31\\u4e0d\\u518d\\u8ba1\\u5165\\u3002',

      'Auf dem Sprung': '\\u5373\\u5c06\\u4e0a\\u699c',
      'Anwärter, deren Schnitt für die ersten {0} reichen würde, stehen zusätzlich ganz oben – ab {1} Runden. Sonst stünde der Beste der Neuen am Ende einer Liste, in der er eigentlich vorne wäre.':
        '\\u5747\\u5206\\u8db3\\u4ee5\\u8fdb\\u524d {0} \\u540d\\u7684\\u5019\\u8865\\u4f1a\\u989d\\u5916\\u663e\\u793a\\u5728\\u6700\\u4e0a\\u65b9 \\u2013 \\u6ee1 {1} \\u5c40\\u8d77\\u3002\\u5426\\u5219\\u65b0\\u4eba\\u4e2d\\u7684\\u4f7c\\u4f7c\\u8005\\u4f1a\\u5f85\\u5728\\u672c\\u8be5\\u9886\\u5148\\u7684\\u699c\\u5355\\u672b\\u5c3e\\u3002',

      'Mehrere Ranglisten': '\\u591a\\u4e2a\\u6392\\u884c\\u699c',
      'Es kann mehrere Ranglisten gleichzeitig geben, etwa eine fürs Jahr und eine für den Monat. Eine Runde zählt dann für alle – einmal F9 genügt.':
        '\\u53ef\\u4ee5\\u540c\\u65f6\\u5b58\\u5728\\u591a\\u4e2a\\u6392\\u884c\\u699c\\uff0c\\u4f8b\\u5982\\u5e74\\u699c\\u548c\\u6708\\u699c\\u3002\\u4e00\\u5c40\\u4f1a\\u8ba1\\u5165\\u5168\\u90e8 \\u2013 \\u6309\\u4e00\\u6b21 F9 \\u5c31\\u591f\\u4e86\\u3002',

      'Pause zwischen zwei Runden': '\\u4e24\\u5c40\\u4e4b\\u95f4\\u7684\\u95f4\\u9694',
      '{0} Minuten': '{0} \\u5206\\u949f',
      'nachdem eine Runde angenommen wurde': '\\u5f53\\u4e00\\u5c40\\u88ab\\u63a5\\u53d7\\u540e',
      '{0} Sekunden': '{0} \\u79d2',
      'wenn sie nicht verwertbar war – dann darfst du es gleich noch einmal versuchen':
        '\\u5982\\u679c\\u65e0\\u6cd5\\u4f7f\\u7528 \\u2013 \\u90a3\\u4e48\\u4f60\\u53ef\\u4ee5\\u9a6c\\u4e0a\\u518d\\u8bd5\\u4e00\\u6b21',

      'Dein Ingame-Name': '\\u4f60\\u7684\\u6e38\\u620f\\u5185\\u540d\\u79f0',
      'Eindeutig über alle Konten. Wer zuerst da ist, dem gehört der Name.':
        '\\u5728\\u6240\\u6709\\u8d26\\u53f7\\u4e2d\\u552f\\u4e00\\u3002\\u5148\\u5230\\u5148\\u5f97\\u3002',
      'Nur alle {0} Tage änderbar.': '\\u6bcf {0} \\u5929\\u624d\\u80fd\\u4fee\\u6539\\u4e00\\u6b21\\u3002',
      'Beides hat denselben Grund: Der Name entscheidet, welche Zeile des Scoreboards dir gutgeschrieben wird.':
        '\\u4e24\\u8005\\u539f\\u56e0\\u76f8\\u540c\\uff1a\\u540d\\u79f0\\u51b3\\u5b9a\\u8ba1\\u5206\\u677f\\u4e0a\\u54ea\\u4e00\\u884c\\u7b97\\u5728\\u4f60\\u5934\\u4e0a\\u3002',

      'Wenn eine Runde abgelehnt wird': '\\u5f53\\u4e00\\u5c40\\u88ab\\u62d2\\u7edd\\u65f6',
      'Jede Einreichung sieht sich ein Mensch an, bevor sie zählt. Wird sie abgelehnt, steht der Grund im Programm und auf deiner Kontoseite – meistens ist es schlicht ein Bild, auf dem die Zahlen nicht sicher zu lesen sind.':
        '\\u6bcf\\u4e00\\u6b21\\u63d0\\u4ea4\\u8ba1\\u5206\\u524d\\u90fd\\u7531\\u4eba\\u5de5\\u67e5\\u770b\\u3002\\u5982\\u679c\\u88ab\\u62d2\\u7edd\\uff0c\\u539f\\u56e0\\u4f1a\\u663e\\u793a\\u5728\\u5ba2\\u6237\\u7aef\\u548c\\u4f60\\u7684\\u8d26\\u53f7\\u9875\\u9762\\u4e0a \\u2013 \\u5927\\u591a\\u6570\\u60c5\\u51b5\\u53ea\\u662f\\u56fe\\u7247\\u4e0a\\u7684\\u6570\\u5b57\\u65e0\\u6cd5\\u53ef\\u9760\\u8bc6\\u522b\\u3002',
      'Kommt dir eine Entscheidung falsch vor, frag im Discord nach. Dort sieht sich das jemand noch einmal an.':
        '\\u5982\\u679c\\u4f60\\u89c9\\u5f97\\u5224\\u5b9a\\u6709\\u8bef\\uff0c\\u8bf7\\u5728 Discord \\u4e0a\\u63d0\\u51fa\\u3002\\u4f1a\\u6709\\u4eba\\u518d\\u770b\\u4e00\\u904d\\u3002'
    }
  };

  var sprache = 'de';
  try {
    var g = localStorage.getItem('mc_sprache');
    if (g === 'de' || g === 'en' || g === 'zh') sprache = g;
    else if ((navigator.language || '').slice(0, 2) === 'zh') sprache = 'zh';
    else if ((navigator.language || '').slice(0, 2) !== 'de') sprache = 'en';
  } catch (e) { /* ohne Speicher eben Deutsch */ }

  /** Der deutsche Satz IST der Schluessel - fehlt eine Uebersetzung,
      steht er da. Sichtbarer Text statt einer leeren Stelle. */
  function t(de) {
    if (sprache === 'de') return de;
    var w = WOERTER[sprache];
    return (w && w[de]) || de;
  }

  /** Platzhalter mit denselben Zahlen fuellen, die der Server gesetzt hat. */
  function fuelle(text, werte) {
    for (var i = 0; i < werte.length; i++) {
      text = text.split('{' + i + '}').join(String(werte[i]));
    }
    return text;
  }

  /* Welcher Satz welche Zahlen bekommt. Steht hier und nicht im HTML,
     damit die Reihenfolge der Platzhalter an einer Stelle gepflegt wird. */
  var EINGESETZT = {
    'Rang 1–{0}': [ZAHLEN.rang],
    'Schnitt der letzten {0}': [ZAHLEN.fenster],
    'Ab {0} Runden': [ZAHLEN.voll],
    'Ein alter Ausrutscher verschwindet von selbst: sobald {0} neuere Runden da sind, fällt er aus der Wertung.': [ZAHLEN.fenster],
    'Anwärter, deren Schnitt für die ersten {0} reichen würde, stehen zusätzlich ganz oben – ab {1} Runden. Sonst stünde der Beste der Neuen am Ende einer Liste, in der er eigentlich vorne wäre.': [ZAHLEN.sprungPlatz, ZAHLEN.sprungAb],
    '{0} Minuten': [ZAHLEN.pause],
    '{0} Sekunden': [ZAHLEN.kurz],
    'Nur alle {0} Tage änderbar.': [ZAHLEN.namensTage]
  };

  function zeichne() {
    document.documentElement.lang = sprache;

    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (e) {
      e.textContent = t(e.getAttribute('data-t'));
    });

    Array.prototype.forEach.call(document.querySelectorAll('[data-tp]'), function (e) {
      var de = e.getAttribute('data-tp');
      e.textContent = fuelle(t(de), EINGESETZT[de] || []);
    });

    Array.prototype.forEach.call(document.querySelectorAll('#sprachen button'), function (b) {
      b.className = b.getAttribute('data-sprache') === sprache ? 'aktiv' : '';
    });
  }

  document.getElementById('sprachen').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    sprache = b.getAttribute('data-sprache');
    try { localStorage.setItem('mc_sprache', sprache); } catch (x) { /* egal */ }
    zeichne();
  });

  zeichne();
})();
</script>
</body>
</html>`;
}

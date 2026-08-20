/* =========================================================================
   DIE REGELSEITE

   Alles, was zaehlt, an einer Stelle - damit Rueckfragen im Discord sich
   mit einem Link beantworten.

   -------------------------------------------------------------------------
   DIE ZAHLEN KOMMEN AUS DEM CODE, NICHT AUS DIESEM TEXT

   Das ist der ganze Grund, warum diese Seite erzeugt und nicht als
   HTML-Datei abgelegt wird. Eine Regelseite, die "mindestens 6 Spieler"
   behauptet, waehrend der Server bei 8 abweist, ist schlimmer als gar
   keine: sie erzeugt Vertrauen, das sie nicht deckt, und niemand
   bemerkt die Abweichung, weil beide Stellen fuer sich betrachtet
   stimmig aussehen.

   Wird also eine Regel geaendert, aendert sich diese Seite mit. Ohne
   dass jemand daran denken muss.
   ========================================================================= */

import { FENSTER, VOLL, SPRUNG_AB, SPRUNG_PLATZ } from './rangliste.js';
import { MAX_RANG, MAX_ZEILEN } from './leser.js';
import { ABSTAND_ANGENOMMEN_MS, ABSTAND_FEHLSCHLAG_MS } from './tokens.js';
import { NAMENSSPERRE_TAGE } from './konten.js';
import { verteilung } from './config.js';

export interface RegelZahlen {
  /** Mindestzahl Verstecker im Scoreboard. Aus server.ts. */
  readonly minSpieler: number;
  /** Wie lange das Original eines Bildes liegen bleibt, in Stunden. */
  readonly bildStunden: number;
}

/** Minuten oder Sekunden, je nachdem was sich besser liest. */
function dauer(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + ' Sekunden';
  const m = Math.round(s / 60);
  return m === 1 ? 'eine Minute' : m + ' Minuten';
}

function tage(stunden: number): string {
  if (stunden < 48) return stunden + ' Stunden';
  return Math.round(stunden / 24) + ' Tage';
}

export function regelnSeite(zahlen: RegelZahlen): string {
  const discord = verteilung().discord;
  const url = (verteilung().server || '').replace(/\/+$/, '');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Regeln – Meccha Ranked</title>
<meta name="description" content="Wann eine Runde zählt, wie der Rang entsteht und was mit den Bildern passiert.">${url ? `
<link rel="canonical" href="${url}/regeln">` : ''}
<style>
  :root {
    --grund:#0d1017;
    --flaeche:#161b24;
    --kante:#28313f;
    --text:#e8ecf3;
    --leise:#95a1b3;
    --akzent:#66c0f4;
    --zahl:#ffb020;
    --gut:#4fd18b;
    --schlecht:#f0736f;
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
  .huelle { max-width:760px; margin:0 auto; padding:34px 20px 70px; }

  header { margin-bottom:30px; }
  h1 { font-size:26px; margin:0 0 5px; }
  .augen { color:var(--leise); font-size:13px; }

  h2 {
    font-size:17px; margin:34px 0 12px;
    padding-bottom:7px; border-bottom:1px solid var(--kante);
  }

  .karte {
    background:var(--flaeche); border:1px solid var(--kante);
    border-radius:11px; padding:16px 18px; margin:14px 0;
  }

  ul { margin:10px 0; padding-left:20px; }
  li { margin:7px 0; }

  b, strong { color:var(--text); }
  .z { color:var(--zahl); font-weight:700; font-variant-numeric:tabular-nums; }
  .leise { color:var(--leise); }
  .klein { font-size:13px; }

  table { width:100%; border-collapse:collapse; margin:10px 0; }
  td { padding:7px 4px; border-bottom:1px solid var(--kante); vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  td:first-child { white-space:nowrap; padding-right:16px; }

  .warum {
    color:var(--leise); font-size:13.5px;
    border-left:2px solid var(--kante); padding-left:12px; margin:9px 0 0;
  }

  a { color:var(--akzent); }
  .zurueck { display:inline-block; margin-bottom:22px; font-size:14px; }
  footer { margin-top:40px; color:var(--leise); font-size:13px; }
</style>
</head>
<body>
<div class="huelle">

<a class="zurueck" href="/">&#8592; Zur Rangliste</a>

<header>
  <h1>Regeln</h1>
  <div class="augen">Meccha Chameleon · was zählt und was nicht</div>
</header>

<h2>Wann zählt eine Runde?</h2>

<div class="karte">
<table>
  <tr>
    <td><span class="z">${zahlen.minSpieler}</span> Verstecker</td>
    <td>So viele müssen mindestens im Scoreboard stehen.
      <p class="warum">Eine Lobby zu zweit ist beliebig oft gewinnbar. Ohne diese
      Latte könnte man sich mit einem Freund einen Schnitt bauen, ohne je gegen
      jemanden gespielt zu haben.</p></td>
  </tr>
  <tr>
    <td>Rang <span class="z">1</span>–<span class="z">${MAX_RANG}</span></td>
    <td>Nur diese Plätze werden gewertet.
      <p class="warum">Weiter unten sind kaum Punkte zu holen, und es sind genau
      die Zeilen, die am unzuverlässigsten gelesen werden. Wer schlechter
      abschneidet, bekommt <b>keinen</b> Eintrag — nicht etwa einen schlechten.</p></td>
  </tr>
  <tr>
    <td>Angemeldet</td>
    <td>Mit Steam, und mit eingetragenem Ingame-Namen.
      <p class="warum">Ohne den lässt sich nicht sagen, welche Zeile dir gehört.</p></td>
  </tr>
</table>
</div>

<p>Im Scoreboard stehen nur die <b>Verstecker</b>, nie die Jäger. Eine Lobby fasst bis
zu 24 Leute, die Zahl der Jäger schwankt — im Bild landen dadurch etwa
${zahlen.minSpieler} bis 20 Zeilen. Wer als Jäger spielt, drückt einfach kein F9:
er steht in keinem Scoreboard und kann in dieser Runde nichts verdienen.</p>

<h2>F9 richtig drücken</h2>

<div class="karte">
<ul>
  <li><b>Am Ende der Runde</b>, wenn die Rangliste vollständig steht.</li>
  <li><b>Auf einen ruhigen Hintergrund schauen</b> — Himmel oder eine Wand statt
      buntem Boden.</li>
</ul>
<p class="warum">Die Schrift im Spiel ist durchsichtig. Über Wiese und Bonbons
verschwindet sie halb, und dann liest der Server nur noch Bruchstücke. An echten
Screenshots gemessen: bei brauchbarem Untergrund werden praktisch alle Zeilen
erkannt, über buntem Boden manchmal keine einzige. Es liegt nicht an dir und nicht
an deinem Rechner — nur am Bild.</p>
</div>

<h2>Wie entsteht dein Rang?</h2>

<div class="karte">
<table>
  <tr>
    <td>Schnitt der letzten <span class="z">${FENSTER}</span></td>
    <td>Gewertet werden die <b>Punkte aus dem Spiel</b>, nicht die Platzierung.</td>
  </tr>
  <tr>
    <td>Ab <span class="z">${VOLL}</span> Runden</td>
    <td>Erst dann stehst du in der Wertung. Davor bist du <b>Anwärter</b>:
      sichtbar mit Schnitt, aber ohne Platz.
      <p class="warum">So wird jeder über dieselbe Zahl von Ergebnissen verglichen.
      Sonst stünde jemand mit einer einzigen Glücksrunde vor jemandem mit
      zwanzig soliden.</p></td>
  </tr>
  <tr>
    <td>Gleichstand</td>
    <td>Wer mehr Einträge hat, steht vorne — er hat es öfter gezeigt.</td>
  </tr>
</table>
<p class="klein leise">Ein alter Ausrutscher verschwindet von selbst: sobald
${FENSTER} neuere Runden da sind, fällt er aus dem Fenster.</p>
</div>

<h2>Auf dem Sprung</h2>

<p>Anwärter, deren Schnitt für die <b>ersten ${SPRUNG_PLATZ}</b> reichen würde, stehen
zusätzlich ganz oben in der Rangliste — ab <span class="z">${SPRUNG_AB}</span> Runden.</p>

<p class="warum">Sonst stünde der Beste der Neuen am Ende einer Liste, in der er
eigentlich vorne wäre. Die ${SPRUNG_AB} sind nötig, damit dort kein einzelner
Glückstreffer auftaucht, der beim nächsten Eintrag wieder verschwindet.</p>

<h2>Abstand zwischen zwei Einreichungen</h2>

<div class="karte">
<table>
  <tr>
    <td class="z">${dauer(ABSTAND_ANGENOMMEN_MS)}</td>
    <td>nachdem eine Runde angenommen wurde</td>
  </tr>
  <tr>
    <td class="z">${dauer(ABSTAND_FEHLSCHLAG_MS)}</td>
    <td>wenn sie nicht verwertbar war</td>
  </tr>
</table>
<p class="warum">Der Unterschied ist Absicht. Nach einer angenommenen Runde gibt es
nichts mehr einzureichen — die nächste Partie dauert ohnehin länger. Ein Fehlschlag
ist dagegen meist nicht deine Schuld: schlecht erwischter Moment, unruhiger
Hintergrund. Dafür ${dauer(ABSTAND_ANGENOMMEN_MS)} zu warten würde dich deine Runde
kosten.</p>
</div>

<h2>Wann eine Runde abgelehnt wird</h2>

<p>Nichts davon entscheidet ein Automat. Fällt etwas auf, landet die Runde bei einem
Mod — mit Bild daneben.</p>

<ul>
  <li>Der Screenshot wirkt <b>bearbeitet</b></li>
  <li>Dieselbe Partie wurde <b>schon gewertet</b> — auch wenn sie jemand anderes
      eingeschickt hat</li>
  <li>Die Zahlen sind <b>nicht sicher lesbar</b></li>
  <li>Immer wieder <b>exakt dieselbe Punktzahl</b></li>
</ul>

<p class="warum">Der letzte Punkt richtet sich gegen den Geduldigen: echte Runden mit
wechselnden Mitspielern, aber jedes Mal die eigene Zeile auf denselben Wert gefälscht.
Jedes Bild wäre frisch, jede Partie anders — und trotzdem stünde dreimal dieselbe Zahl
in der Liste. Zwei hohe Punktzahlen werden nicht zufällig gleich.</p>

<p>Wirst du abgelehnt, siehst du den <b>Grund</b> — im Programm und auf deiner
Kontoseite. Er ist keine Anklage: „Zahlen nicht sicher lesbar" heißt genau das und
nichts weiter.</p>

<h2>Dein Ingame-Name</h2>

<div class="karte">
<ul>
  <li><b>Eindeutig</b> über alle Konten. Wer zuerst da ist, dem gehört der Name.</li>
  <li>Nur alle <span class="z">${NAMENSSPERRE_TAGE}</span> Tage änderbar.</li>
  <li>Jede Änderung setzt deinen Zugang zurück auf <b>„braucht Freigabe"</b>.</li>
</ul>
<p class="warum">Alle drei haben denselben Grund: Der Name entscheidet, welche Zeile
des Scoreboards dir gutgeschrieben wird. Ohne diese Regeln könnte sich jemand die
Zeile des Erstplatzierten nehmen.</p>
</div>

<h2>Was mit deinen Bildern passiert</h2>

<div class="karte">
<table>
  <tr>
    <td>Ganzer Screenshot</td>
    <td>wird nach <b>${tage(zahlen.bildStunden)}</b> gelöscht</td>
  </tr>
  <tr>
    <td>Ranglisten-Ausschnitt</td>
    <td>bleibt — er ist der Beleg</td>
  </tr>
</table>
<p class="warum">Vom Vollbild bleibt also nur der Teil übrig, auf dem die Rangliste
steht. Was sonst noch auf deinem Bildschirm war — offene Fenster, Nachrichten —
verschwindet mit dem Original. Angesehen wird beides nur von Mods und Admins.</p>
</div>

<h2>Warum überhaupt Screenshots?</h2>

<p class="leise">MECCHA CHAMELEON hat keine Schnittstelle, kein Web-Leaderboard und
keinen Export. Die Punkte gibt es nur auf dem Bildschirm. Deshalb liest ein Programm
sie aus dem Bild — und deshalb schaut am Ende ein Mensch drauf, bevor sie zählen.</p>

<footer>
  <a href="/">Rangliste</a> ·
  <a href="/konto">Dein Zugang</a>${discord ? ` ·
  <a href="${discord}" rel="noopener">Discord</a>` : ''}
</footer>

</div>
</body>
</html>`;
}

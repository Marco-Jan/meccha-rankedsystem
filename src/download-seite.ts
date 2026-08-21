/* =========================================================================
   DIE DOWNLOAD-SEITE

   Chrome meldet "Diese Datei wird selten heruntergeladen und koennte
   gefaehrlich sein". Windows meldet beim Start "Der Computer wurde durch
   Windows geschuetzt".

   Das sind ZWEI VERSCHIEDENE Warnungen zu verschiedenen Zeitpunkten -
   Browser beim Herunterladen, SmartScreen beim Ausfuehren -, und wer nur
   eine erklaert, laesst den Zuschauer beim zweiten Mal wieder allein.

   Beide entstehen nicht daran, dass etwas an der Datei faul waere,
   sondern daran, dass sie UNBEKANNT ist: keine Signatur, kein Ruf, wenige
   Downloads. Dagegen hilft nur ein Code-Signing-Zertifikat, und das
   kostet mehrere hundert Euro im Jahr - siehe UMBAU.md, Etappe 9.

   Also der ehrliche Weg: die Warnung ZEIGEN statt sie zu verschweigen,
   erklaeren woher sie kommt, und dem Misstrauischen die Mittel geben,
   selbst nachzusehen. Das ist der Unterschied zwischen "komisch, lieber
   nicht" und "ah, verstanden".

   -------------------------------------------------------------------------
   DIE PRUEFSUMME WIRD BERECHNET, NICHT EINGETRAGEN

   Eine fest hinterlegte Pruefsumme waere nach dem naechsten BAUEN.bat
   falsch - und eine falsche Pruefsumme ist schlimmer als keine: sie
   laesst die echte Datei manipuliert aussehen und zerstoert genau das
   Vertrauen, das sie herstellen sollte.
   ========================================================================= */

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { verteilung } from './config.js';

export interface Clientstand {
  /** Wie die Datei heisst, die ausgeliefert wird. */
  readonly name: string;
  readonly groesse: number;
  readonly sha256: string;
  readonly version: string;
  /**
   * Wann diese Fassung gebaut wurde, als ISO-Datum. Leer, wenn es dazu
   * keine verlaessliche Auskunft gibt.
   *
   * Nicht die Aenderungszeit der Datei: die zeigt nach einem scp den
   * Zeitpunkt des Hochladens, nach einem git clone den des Auscheckens.
   * Der Wert kommt aus client-cs/fassung.json und wird nur benutzt, wenn
   * die Nummer dort zur ausgelieferten passt - sonst gehoert das Datum
   * zu einem anderen Bau, und ein falsches Datum ist schlimmer als
   * keines.
   */
  readonly gebaut: string;
  readonly istZip: boolean;
}

/** Liest das Baudatum aus dem Stempel, den client-cs/stempeln.cjs setzt. */
function baudatum(version: string): string {
  try {
    const datei = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'client-cs',
      'fassung.json'
    );
    let roh = readFileSync(datei, 'utf8');
    if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);
    const d = JSON.parse(roh) as { version?: string; gebaut?: string };

    if (!d.gebaut || d.version !== version) return '';
    return Number.isNaN(Date.parse(d.gebaut)) ? '' : d.gebaut;
  } catch {
    return '';
  }
}

/*
   Gemerkt nach Pfad, Groesse und Aenderungszeit.

   SHA-256 ueber 45 KB kostet nichts, aber die Datei bei jedem Aufruf zu
   lesen waere trotzdem unnoetig. Die Aenderungszeit im Schluessel sorgt
   dafuer, dass ein neu gebauter Client sofort die neue Summe zeigt -
   ohne Neustart, ohne dass jemand daran denken muss.
*/
const gemerkt = new Map<string, Clientstand>();

export function clientstand(datei: string): Clientstand | null {
  try {
    const s = statSync(datei);
    const schluessel = datei + '|' + s.size + '|' + s.mtimeMs;

    const da = gemerkt.get(schluessel);
    if (da) return da;

    const inhalt = readFileSync(datei);
    const stand: Clientstand = {
      name: path.basename(datei),
      groesse: s.size,
      sha256: createHash('sha256').update(inhalt).digest('hex'),
      version: verteilung().clientVersion,
      gebaut: baudatum(verteilung().clientVersion),
      istZip: datei.toLowerCase().endsWith('.zip')
    };

    // Nur den aktuellen Stand behalten - alte Schluessel sind wertlos.
    gemerkt.clear();
    gemerkt.set(schluessel, stand);
    return stand;
  } catch {
    return null;
  }
}

function kb(bytes: number): string {
  return bytes < 1024 * 1024
    ? Math.round(bytes / 1024) + ' KB'
    : (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/** Tag.Monat.Jahr - ohne Uhrzeit, die Stunde hilft hier niemandem. */
function datum(iso: string): string {
  const d = new Date(iso);
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear()
  ].join('.');
}

/** Die Summe in Vierergruppen - so laesst sie sich von Auge vergleichen. */
function gruppiert(hex: string): string {
  return (hex.match(/.{1,8}/g) ?? []).join(' ');
}

export function downloadSeite(stand: Clientstand | null): string {
  const discord = verteilung().discord;
  const url = (verteilung().server || '').replace(/\/+$/, '');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Programm herunterladen – Meccha Ranked</title>
<meta name="robots" content="noindex, nofollow">${url ? `
<link rel="canonical" href="${url}/download">` : ''}
<style>
  :root {
    --grund:#0d1017; --flaeche:#161b24; --kante:#28313f;
    --text:#e8ecf3; --leise:#95a1b3;
    --akzent:#66c0f4; --zahl:#ffb020;
    --gut:#4fd18b; --warn:#ffb020;
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
  .huelle { max-width:700px; margin:0 auto; padding:34px 20px 70px; }
  a { color:var(--akzent); }
  .zurueck { display:inline-block; margin-bottom:22px; font-size:14px; }

  h1 { font-size:26px; margin:0 0 5px; }
  .augen { color:var(--leise); font-size:13px; margin-bottom:26px; }
  h2 {
    font-size:17px; margin:32px 0 12px;
    padding-bottom:7px; border-bottom:1px solid var(--kante);
  }

  .karte {
    background:var(--flaeche); border:1px solid var(--kante);
    border-radius:11px; padding:17px 19px; margin:14px 0;
  }

  .holen {
    display:inline-block; background:var(--akzent); color:#06121c;
    font-weight:700; font-size:16px; text-decoration:none;
    padding:13px 26px; border-radius:9px;
  }
  .daten { color:var(--leise); font-size:13px; margin-top:11px; }

  /* Die Warnung nachgebaut. Wer sie hier schon gesehen hat, erschrickt
     im Browser nicht mehr - das ist der ganze Zweck dieser Seite. */
  .nachbau {
    border:1px solid var(--kante); border-left:3px solid var(--warn);
    border-radius:7px; padding:12px 14px; margin:11px 0;
    background:var(--grund); font-size:14px;
  }
  .nachbau .titel { font-weight:600; margin-bottom:3px; }
  .nachbau .weg { color:var(--leise); font-size:13px; margin-top:8px; }

  code {
    font-family:ui-monospace, Consolas, monospace; font-size:12.5px;
    background:var(--grund); border:1px solid var(--kante);
    border-radius:5px; padding:2px 5px;
  }
  .summe {
    display:block; padding:10px 12px; margin-top:7px;
    word-break:break-all; line-height:1.9; letter-spacing:.03em;
  }
  .leise { color:var(--leise); }
  .klein { font-size:13px; }
  ol { padding-left:20px; }
  li { margin:6px 0; }
  footer { margin-top:40px; color:var(--leise); font-size:13px; }
</style>
</head>
<body>
<div class="huelle">

<a class="zurueck" href="/">&#8592; Zur Rangliste</a>

<h1>Das Programm</h1>
<div class="augen">Eine Datei, keine Installation.</div>

${stand ? `<div class="karte">
  <a class="holen" href="/client">Herunterladen</a>
  <div class="daten">
    ${stand.name} · ${kb(stand.groesse)}${stand.version ? ` · Fassung ${stand.version}` : ''}${
      stand.gebaut ? ` · vom ${datum(stand.gebaut)}` : ''
    }
  </div>
</div>` : `<div class="karte">
  <p><b>Gerade nicht verfügbar.</b> Das Programm liegt auf dem Server nicht bereit.
  Frag im Discord einen Admin oder Mod.</p>
</div>`}

<h2>Dein Rechner wird warnen. Zweimal.</h2>

<p>Das ist zu erwarten und kein Zeichen dafür, dass etwas nicht stimmt. Beide
Warnungen sagen dasselbe: <b>diese Datei ist unbekannt.</b> Sie kommt nicht aus einem
App-Store und trägt keine gekaufte Signatur — die kostet mehrere hundert Euro im Jahr,
und dieses Projekt kostet nichts.</p>

<div class="nachbau">
  <div class="titel">1 · Beim Herunterladen, im Browser</div>
  <div>„… wird selten heruntergeladen und könnte gefährlich sein"</div>
  <div class="weg">Auf die drei Punkte neben dem Download klicken →
    <b>Beibehalten</b></div>
</div>

<div class="nachbau">
  <div class="titel">2 · Beim ersten Start, von Windows</div>
  <div>„Der Computer wurde durch Windows geschützt"</div>
  <div class="weg">Auf <b>Weitere Informationen</b> klicken →
    <b>Trotzdem ausführen</b></div>
</div>

<p class="klein leise">Der zweite Hinweis kommt nur beim ersten Mal. Danach kennt
Windows die Datei.</p>

<h2>Nicht glauben — nachsehen</h2>

<p>Du musst mir nicht vertrauen. Hier ist der Fingerabdruck der Datei, die dieser
Server gerade ausliefert:</p>

${stand ? `<div class="karte">
  <div class="klein leise">SHA-256</div>
  <code class="summe">${gruppiert(stand.sha256)}</code>

  <p class="klein" style="margin-top:14px">
    <a href="https://www.virustotal.com/gui/file/${stand.sha256}" rel="noopener nofollow"
       target="_blank">Bei VirusTotal nachschlagen</a>
    — dort prüfen über 70 Virenscanner gleichzeitig.
  </p>
  <p class="klein leise">
    Findet VirusTotal nichts, hat die Datei einfach noch niemand hochgeladen. Du kannst
    sie dort selbst hochladen; das Ergebnis sieht dann jeder nach dir.
  </p>
</div>

<p class="klein leise">Selbst nachrechnen, in PowerShell:<br>
<code>Get-FileHash .\\${stand.name} -Algorithm SHA256</code><br>
Stimmt die Zeile mit der oben überein, ist die Datei unterwegs nicht verändert
worden.</p>` : ''}

<h2>Was das Programm tut</h2>

<div class="karte">
<ol>
  <li>Es wartet auf deinen Tastendruck — <b>F9</b>, während du spielst.</li>
  <li>Dann macht es <b>ein Bild</b> deines Bildschirms.</li>
  <li>Und schickt es an diesen Server, zusammen mit deinem Token.</li>
</ol>
<p class="klein leise">Mehr nicht. Es liest nichts aus dem Spiel, verändert nichts und
läuft nur, solange du es offen hast. Die Serveradresse steckt fest in der Datei — es
kann seine Bilder nirgendwo anders hinschicken.</p>
</div>

<h2>Und dann?</h2>

<p>Auf <a href="/konto">deiner Kontoseite</a> holst du dir den Token, fügst ihn im
Programm ein — fertig. Ab dann reicht F9.</p>

<footer>
  <a href="/">Rangliste</a> ·
  <a href="/regeln">Regeln</a> ·
  <a href="/konto">Dein Zugang</a>${discord ? ` ·
  <a href="${discord}" rel="noopener">Discord</a>` : ''}
</footer>

</div>
</body>
</html>`;
}

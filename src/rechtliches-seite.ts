/* =========================================================================
   IMPRESSUM UND DATENSCHUTZ

   Beides erzeugt und nicht als HTML-Datei abgelegt, aus demselben Grund
   wie bei der Regelseite: die ZAHLEN kommen aus dem Code. Wenn jemand
   MC_BILD_STUNDEN aendert, soll hier nicht weiter "72 Stunden" stehen.
   Eine Datenschutzerklaerung, die etwas behauptet, das der Server nicht
   tut, ist schlimmer als keine.

   Deutsch und Englisch, nicht vier Sprachen wie sonst. Fuer Oesterreich
   ist die deutsche Fassung die massgebliche; eine schlecht uebersetzte
   Rechtsauskunft auf Japanisch waere kein Dienst am Leser, sondern ein
   Haftungsrisiko. Der Hinweis darauf steht auf der Seite.

   WICHTIG: Das ist ein sorgfaeltiger Entwurf nach dem, was der Server
   tatsaechlich macht - keine Rechtsberatung. Vor dem Scharfschalten
   sollte ein Mensch mit Ahnung drueberschauen.
   ========================================================================= */

import { verteilung } from './config.js';
import { NAMENSSPERRE_TAGE } from './konten.js';
import { VERDACHT_BILD_STUNDEN } from './freigabe.js';

/* -------------------------------------------------------- Betreiber */

/**
 * Wer die Seite betreibt.
 *
 * An einer Stelle, damit Impressum und Datenschutz nicht auseinander-
 * laufen koennen - im Datenschutz steht dieselbe Anschrift noch einmal
 * als Verantwortlicher.
 */
export const BETREIBER = {
  name: 'Marco Jan',
  strasse: 'Körösistraße 196',
  ort: '8010 Graz',
  land: 'Österreich',
  mail: 'marco.jan@walk-buddy.app'
};

/** Wie lange ein Original-Screenshot liegen bleibt. Wie in cli/serve.ts. */
const BILD_STUNDEN = Number(process.env.MC_BILD_STUNDEN || 72);

function schuetze(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Die Mailadresse verschleiert.
 *
 * Kein echter Schutz - wer sammeln will, kann das aufloesen. Es haelt
 * aber die einfachen Sammler ab, die nur nach "mailto:" greifen, und
 * kostet nichts. Sichtbar bleibt sie vollstaendig: ein Impressum, dessen
 * Adresse man nicht lesen kann, erfuellt seinen Zweck nicht.
 */
function mailLink(adresse: string): string {
  const [vorn, hinten] = adresse.split('@');
  return `<a href="mailto:${schuetze(adresse)}">${schuetze(vorn ?? '')}<span>@</span>${
    schuetze(hinten ?? '')}</a>`;
}

/* ---------------------------------------------------------- Geruest */

function seite(titel: string, pfad: string, inhalt: string): string {
  const url = (verteilung().server || '').replace(/\/+$/, '');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${schuetze(titel)} – Meccha Ranked</title>${url ? `
<link rel="canonical" href="${url}${pfad}">` : ''}
<style>
  :root {
    --grund:#0d1017; --flaeche:#161b24; --kante:#28313f;
    --text:#e8ecf3; --leise:#95a1b3;
    --akzent:#66c0f4;
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
  h3 { font-size:15px; margin:22px 0 6px; }
  .karte {
    background:var(--flaeche); border:1px solid var(--kante);
    border-radius:11px; padding:17px 19px; margin:14px 0;
  }
  table { border-collapse:collapse; width:100%; margin:12px 0; font-size:14px; }
  th, td {
    text-align:left; padding:7px 9px; border-bottom:1px solid var(--kante);
    vertical-align:top;
  }
  th { color:var(--leise); font-weight:600; }
  .leise { color:var(--leise); }
  .klein { font-size:13px; }
  ul { padding-left:20px; }
  li { margin:5px 0; }
  .fuss {
    margin-top:44px; padding-top:16px; border-top:1px solid var(--kante);
    color:var(--leise); font-size:13px;
  }
  .fuss a { margin-right:14px; }
</style>
</head>
<body>
<div class="huelle">

<a class="zurueck" href="/">&#8592; Zur Rangliste</a>

${inhalt}

<div class="fuss">
  <a href="/">Rangliste</a>
  <a href="/regeln">Regeln</a>
  <a href="/impressum">Impressum</a>
  <a href="/datenschutz">Datenschutz</a>
</div>

</div>
</body>
</html>`;
}

/* -------------------------------------------------------- Impressum */

export function impressumSeite(): string {
  const b = BETREIBER;

  return seite('Impressum', '/impressum', `
<h1>Impressum</h1>
<div class="augen">Angaben nach § 5 ECG und § 25 MedienG</div>

<div class="karte">
  <b>${schuetze(b.name)}</b><br>
  ${schuetze(b.strasse)}<br>
  ${schuetze(b.ort)}<br>
  ${schuetze(b.land)}<br><br>
  ${mailLink(b.mail)}
</div>

<h2>Was diese Seite ist</h2>

<p>Eine Rangliste für Zuschauerinnen und Zuschauer eines Twitch-Streams zum Spiel
MECCHA CHAMELEON. Sie wird privat betrieben, nicht gewerblich, und ist kostenlos.
Es werden keine Waren oder Dienstleistungen angeboten, keine Werbung geschaltet und
keine Zahlungen entgegengenommen.</p>

<h2>Kein Zusammenhang mit dem Spiel</h2>

<p>Dieses Projekt steht in keiner Verbindung zu den Entwicklern oder dem Verlag von
MECCHA CHAMELEON und ist von ihnen weder unterstützt noch genehmigt. Alle Marken- und
Spielrechte liegen bei den jeweiligen Inhabern. Ebenso besteht keine Verbindung zu
Valve, Steam oder Twitch.</p>

<h2>Haftung für Inhalte und Links</h2>

<p>Die Inhalte werden nach bestem Wissen erstellt. Für Vollständigkeit und Aktualität
kann keine Gewähr übernommen werden. Diese Seite verweist auf externe Angebote
(unter anderem Steam, Discord und VirusTotal); für deren Inhalte sind ausschließlich
die jeweiligen Anbieter verantwortlich.</p>

<h2>Urheberrecht</h2>

<p>Die Software dieses Projekts wurde von ${schuetze(b.name)} erstellt. Eingereichte
Screenshots bleiben bei den Personen, die sie erstellt haben; sie werden
ausschließlich zur Prüfung der eingereichten Punktzahlen verwendet.</p>

<h2>Streitbeilegung</h2>

<p>Da hier keine Verträge geschlossen und keine Entgelte verlangt werden, findet die
Online-Streitbeilegung der EU keine Anwendung. Bei Fragen oder Beschwerden genügt eine
Nachricht an ${mailLink(b.mail)} — das ist der schnellste Weg.</p>
`);
}

/* ------------------------------------------------------ Datenschutz */

export function datenschutzSeite(): string {
  const b = BETREIBER;
  const tage = Math.round(BILD_STUNDEN / 24);
  const verdachtTage = Math.round(VERDACHT_BILD_STUNDEN / 24);

  return seite('Datenschutz', '/datenschutz', `
<h1>Datenschutz</h1>
<div class="augen">Was gespeichert wird, warum, und wie lange</div>

<p>Kurz vorweg, weil es das Wesentliche ist:
<b>keine Werbung, keine Analysedienste, keine Tracker</b>.
Es gibt genau ein Cookie, und das hält deine Anmeldung. Es werden keine Daten an
Dritte verkauft oder weitergegeben.</p>

<h2>Verantwortlich</h2>

<div class="karte">
  ${schuetze(b.name)}<br>
  ${schuetze(b.strasse)}, ${schuetze(b.ort)}, ${schuetze(b.land)}<br>
  ${mailLink(b.mail)}
</div>

<h2>Was gespeichert wird</h2>

<table>
  <tr><th>Was</th><th>Warum</th><th>Wie lange</th></tr>

  <tr>
    <td><b>Steam-ID und Steam-Anzeigename</b></td>
    <td>Damit eine Runde einer Person zugeordnet werden kann. Die Anmeldung läuft über
        Steam; ein Passwort wird hier weder abgefragt noch gespeichert.</td>
    <td>bis zur Löschung des Kontos</td>
  </tr>

  <tr>
    <td><b>Ingame-Name</b></td>
    <td>Nur diese eine Zeile aus dem Scoreboard wird gewertet. Ohne den Namen lässt
        sich keine Punktzahl zuordnen.</td>
    <td>bis zur Löschung des Kontos</td>
  </tr>

  <tr>
    <td><b>Zugangsschlüssel (Token)</b></td>
    <td>Damit der Server erkennt, wer eine Runde einschickt.</td>
    <td>bis zur Löschung des Kontos</td>
  </tr>

  <tr>
    <td><b>Eingereichte Runden</b> — Zeitpunkt, gelesener Name, Punktzahl,
        Ergebnis der Prüfung</td>
    <td>Das ist die Rangliste. Ohne diese Angaben gibt es keine Wertung.</td>
    <td><b>dauerhaft</b></td>
  </tr>

  <tr>
    <td><b>Screenshot der Runde</b> (ganzer Bildschirm)</td>
    <td>Beleg für die Prüfung. Zuschauer dürfen keine Punktzahl selbst eintippen —
        die Zahl kommt aus dem Bild.</td>
    <td>${BILD_STUNDEN} Stunden (${tage} Tage), bei auffälligen Runden
        ${verdachtTage} Tage</td>
  </tr>

  <tr>
    <td><b>Ausschnitt des Ranglisten-Blocks</b> (kleines Bild)</td>
    <td>Damit eine Entscheidung später nachvollziehbar bleibt, ohne den ganzen
        Bildschirm aufzuheben.</td>
    <td><b>dauerhaft</b></td>
  </tr>

  <tr>
    <td><b>Sitzungs-Cookie</b></td>
    <td>Hält die Anmeldung, solange du auf der Seite bist. Kein Tracking, keine
        Reichweitenmessung.</td>
    <td>bis zur Abmeldung bzw. bis das Cookie abläuft</td>
  </tr>
</table>

<h3>Warum der ganze Bildschirm?</h3>

<p>Weil ein Ausschnitt sich leichter fälschen lässt als eine vollständige Aufnahme.
Genau deshalb wird das Original nach ${tage} Tagen gelöscht und nur der schmale
Ranglisten-Streifen behalten — auf dem sind die Mitspielernamen zu sehen, aber nicht
mehr, was sonst auf deinem Bildschirm war. Achte trotzdem darauf, was beim Drücken von
F9 offen ist.</p>

<h3>Was öffentlich sichtbar ist</h3>

<p>Auf der Rangliste erscheinen <b>Ingame-Name, Durchschnitt und Platzierung</b>. Die
Screenshots sind <b>nicht</b> öffentlich — sie sehen ausschließlich der Betreiber und
die von ihm bestimmten Moderatorinnen und Moderatoren.</p>

<h2>Anmeldung über Steam</h2>

<p>Die Anmeldung läuft über Steam OpenID. Dabei wirst du zu Steam weitergeleitet und
meldest dich dort an; zurück kommt ausschließlich deine Steam-ID. <b>Dein Passwort
sieht diese Seite nie.</b> Für die Verarbeitung auf den Steam-Seiten gilt die
Datenschutzerklärung von Valve.</p>

<h2>Server-Protokolle</h2>

<p>Der Webserver protokolliert Zugriffe, wie im Internet üblich, einschließlich
IP-Adresse, Zeitpunkt und aufgerufener Adresse. Das dient dem Betrieb und der Abwehr
von Missbrauch. Diese Einträge werden nicht mit deinem Konto zusammengeführt.</p>

<h2>Rechtsgrundlagen</h2>

<ul>
  <li><b>Einwilligung</b> (Art. 6 Abs. 1 lit. a DSGVO) für die Teilnahme an der
      Rangliste. Du entscheidest dich dafür, indem du dich anmeldest und Runden
      einschickst — beides ist freiwillig.</li>
  <li><b>Berechtigtes Interesse</b> (Art. 6 Abs. 1 lit. f DSGVO) für die Prüfung der
      Einreichungen und die Server-Protokolle. Das Interesse ist eine Rangliste, in
      der die Zahlen stimmen.</li>
</ul>

<h2>Deine Rechte</h2>

<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
Verarbeitung, Datenübertragbarkeit und Widerspruch. Eine formlose Nachricht an
${mailLink(b.mail)} genügt.</p>

<p><b>Konto löschen:</b> Das geht selbst, auf deiner Kontoseite. Dabei werden Steam-ID
und Name entfernt. Die eingereichten Runden bleiben in anonymisierter Form bestehen —
sonst ließe sich die Rangliste der Vergangenheit nicht mehr nachvollziehen, und ein
freigewordener Ingame-Name könnte von jemand anderem übernommen werden, dem dann alte
Runden zugeschrieben würden. Möchtest du auch die Runden entfernt haben, schreib mir.</p>

<p>Außerdem steht dir eine <b>Beschwerde bei der Aufsichtsbehörde</b> zu. In Österreich
ist das die Datenschutzbehörde, Barichgasse 40–42, 1030 Wien,
<a href="https://www.dsb.gv.at" rel="noopener">dsb.gv.at</a>.</p>

<h2>Der Ingame-Name lässt sich nur alle ${NAMENSSPERRE_TAGE} Tage ändern</h2>

<p>Das ist keine Schikane. Am Ingame-Namen hängt, welche Zeile aus dem Scoreboard dir
gutgeschrieben wird. Wäre er beliebig änderbar, könnte man sich kurz den Namen der
erstplatzierten Person geben und deren Punktzahl einsammeln.</p>

<h2>Das Zuschauer-Programm</h2>

<p>Das Programm auf deinem Rechner nimmt <b>nur dann</b> ein Bild auf, wenn du die
eingestellte Taste drückst. Es läuft kein Mitschnitt im Hintergrund, es wird nichts
mitgelesen und nichts von selbst gesendet. Die Tastenabfrage prüft ausschließlich, ob
genau diese eine Taste gedrückt ist.</p>

<p>Gespeichert wird auf deinem Rechner nur, was das Programm zum Arbeiten braucht:
dein Zugangsschlüssel, die gewählte Taste, der Bildschirm und die Sprache — sowie
Runden, die noch nicht gesendet werden konnten.</p>

<div class="karte klein leise">
  Stand: 21.08.2026. Diese Seite beschreibt, was der Server tatsächlich tut; die
  Zahlen darin stammen unmittelbar aus seiner Einstellung. Maßgeblich ist die deutsche
  Fassung.
</div>
`);
}

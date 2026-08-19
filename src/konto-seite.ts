import { verteilung } from './config.js';

/* =========================================================================
   DIE KONTOSEITE

   HTML, CSS und JavaScript als Zeichenkette - wie bei der Freigabeseite
   auch, nur dass die hier vom Server erzeugt wird statt aus public/ zu
   kommen. Grund: sie gehoert eng zu konto-api.ts und soll nicht
   versehentlich getrennt davon geaendert werden.

   Was der Zuschauer hier macht:
     1. ueber Steam anmelden
     2. seinen Ingame-Namen eintragen
     3. seinen Token abholen und in den Client kopieren
   ========================================================================= */

export function kontoSeite(): string {
  /* Der Einladungslink steht in config/verteilung.json - dieselbe Datei,
     aus der die Serveradresse in die .exe kommt. Fehlt er, entfaellt der
     Hinweis, statt auf eine tote Adresse zu zeigen. */
  const discord = verteilung().discord;

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meccha Ranked</title>
<style>
  /* =======================================================================
     Zwei Rollen, beide aus Systemschriften - die Seite laedt NICHTS nach.
     Der Server steht neben dem Spiel und soll auch ohne Internet
     ausliefern koennen.

       Sans        alles Gesprochene
       Monospace   alles Maschinelle: Token, Punkte, Zeiten, Ziffern

     Wer ueberfliegt, erkennt an der Schrift, was eine Zahl ist.
     ======================================================================= */
  :root {
    --grund:#0d1017;
    --flaeche:#161b24;
    --flaeche2:#1d2431;
    --kante:#28313f;
    --text:#e8ecf3;
    --leise:#95a1b3;

    /* Steam-Blau: der Zuschauer kommt ueber Steam herein, er kennt es. */
    --akzent:#66c0f4;
    /* Bernstein NUR fuer Punkte und Zustaende, nie fuer Knoepfe. */
    --zahl:#ffb020;

    --gut:#4fd18b;
    --schlecht:#f0736f;

    --schrift:"Segoe UI", system-ui, -apple-system, sans-serif;
    --mono:Consolas, "SF Mono", ui-monospace, "Cascadia Mono", monospace;

    --breite:1060px;
    --lesbar:46ch;
  }

  /* Helles System: dieselben Rollen, andere Werte - der Akzent wird
     dunkler, sonst verschwindet er auf Weiss. */
  @media (prefers-color-scheme: light) {
    :root {
      --grund:#f3f6fa;
      --flaeche:#ffffff;
      --flaeche2:#eaeff7;
      --kante:#d5dde9;
      --text:#131820;
      --leise:#5b687b;
      --akzent:#0c6cba;
      --zahl:#9a5b00;
      --gut:#137a4c;
      --schlecht:#bf372d;
    }
  }

  * { box-sizing:border-box; }
  html { -webkit-text-size-adjust:100%; }

  body {
    margin:0; padding:0 20px 72px;
    background:var(--grund); color:var(--text);
    font:16px/1.62 var(--schrift);
    -webkit-font-smoothing:antialiased;
  }

  /* --- Kopf: Text links, der Ablauf rechts daneben ------------------ */
  .kopf {
    max-width:var(--breite); margin:0 auto; padding:54px 0 32px;
    display:grid; grid-template-columns:1fr auto; gap:40px; align-items:center;
  }
  .kopf .worte { min-width:0; }

  /* Der Ablauf in drei Feldern - das ist die ganze Bedienung des
     Programms, und sie passt in eine Zeile. */
  .rechts-oben { display:flex; flex-direction:column; align-items:flex-end; gap:14px; }

  /* Sprachwahl: klein, oben rechts, drei Knoepfe statt Aufklappmenue -
     bei drei Sprachen ist die Liste kuerzer als das Menue. */
  .sprachen { display:flex; gap:4px; }
  .sprachen button {
    font:600 12px/1 var(--mono); letter-spacing:.06em;
    padding:7px 11px; border-radius:7px;
    border:1px solid var(--kante); background:transparent; color:var(--leise);
    cursor:pointer;
  }
  .sprachen button:hover { color:var(--text); background:var(--flaeche); }
  .sprachen button.aktiv {
    color:var(--akzent); border-color:var(--akzent); background:var(--flaeche);
  }

  .ablauf { display:flex; gap:10px; align-items:center; }
  .ablauf .feld {
    background:var(--flaeche); border:1px solid var(--kante); border-radius:10px;
    padding:13px 15px; text-align:center; min-width:104px;
  }
  .ablauf .feld .gross {
    display:block; font:700 19px/1.1 var(--mono); color:var(--zahl);
  }
  .ablauf .feld .klein {
    display:block; margin-top:5px; font-size:12px; color:var(--leise);
  }
  .ablauf .pfeil { color:var(--kante); font-size:19px; }
  @media (max-width:900px) { .kopf { grid-template-columns:1fr; gap:26px; } }
  @media (max-width:560px) { .ablauf { display:none; } }
  .augen {
    font:600 11px/1 var(--mono); letter-spacing:.16em; text-transform:uppercase;
    color:var(--akzent); margin-bottom:14px;
  }
  .kopf h1 {
    /* Waechst mit dem Fenster, bleibt aber lesbar: auf dem Handy 30 px,
       am Rechner bis 52 px. */
    margin:0; font-size:clamp(30px, 4.6vw, 52px); line-height:1.08;
    letter-spacing:-1px; font-weight:680; text-wrap:balance;
  }
  .kopf .unter {
    margin:12px 0 0; max-width:var(--lesbar); color:var(--leise); font-size:16px;
  }
  .karte p, .karte .leise { max-width:var(--lesbar); }

  .huelle { max-width:var(--breite); margin:0 auto; }

  /* Zwei Spalten statt einer langen Schlange.

     Bewusst CSS-Spalten und kein Grid: die Karten sind verschieden hoch,
     und ein Grid liesse unter der kuerzeren ein Loch stehen. Spalten
     verteilen sie nach Hoehe - break-inside verhindert, dass eine Karte
     mitten im Text umbricht. */
  /* Zwei Reiter: die Rangliste steht allein und zuerst - sie ist der
     Grund, warum jemand die Seite aufruft. Alles zum eigenen Zugang
     liegt einen Klick daneben. */
  .reiter {
    display:flex; gap:6px; margin:0 0 18px;
    border-bottom:1px solid var(--kante);
  }
  .reiter button {
    border:1px solid transparent; border-bottom:none; background:transparent;
    color:var(--leise); padding:11px 18px; border-radius:9px 9px 0 0;
    font:600 15px/1 var(--schrift); cursor:pointer; position:relative; top:1px;
  }
  .reiter button:hover { color:var(--text); background:var(--flaeche); }
  .reiter button.aktiv {
    background:var(--flaeche); color:var(--text);
    border-color:var(--kante); border-bottom:1px solid var(--flaeche);
  }
  .tafel { display:none; }
  .tafel.aktiv { display:block; }

  #rangliste { margin-bottom:16px; }
  #inhalt { columns:2; column-gap:16px; }
  .karte { break-inside:avoid; }
  @media (max-width:860px) { #inhalt { columns:1; } }

  /* --- Panels: schmale Akzentkante oben ----------------------------- */
  .karte {
    position:relative; background:var(--flaeche);
    border:1px solid var(--kante); border-radius:12px;
    padding:24px; margin-bottom:14px; overflow:hidden;
  }
  .karte::before {
    content:""; position:absolute; inset:0 0 auto 0; height:2px;
    background:linear-gradient(90deg, var(--akzent), transparent 62%);
    opacity:.6;
  }
  .karte h2 {
    margin:0 0 14px; font-size:13px; font-weight:700;
    letter-spacing:.11em; text-transform:uppercase; color:var(--leise);
    font-family:var(--mono);
  }
  .leise { color:var(--leise); font-size:14.5px; }
  p { margin:0 0 10px; }
  p:last-child { margin-bottom:0; }

  /* --- Schritte: echte Reihenfolge, Ziffern in Mono ------------------ */
  .schritte { list-style:none; margin:0; padding:0; counter-reset:s; }
  .schritte li {
    counter-increment:s; position:relative;
    padding:0 0 20px 42px; margin-left:13px;
    border-left:1px solid var(--kante);
  }
  .schritte li:last-child { border-left-color:transparent; padding-bottom:0; }
  .schritte li::before {
    content:counter(s, decimal-leading-zero);
    position:absolute; left:-14px; top:-3px;
    width:27px; height:27px; border-radius:7px;
    background:var(--flaeche2); border:1px solid var(--kante);
    color:var(--akzent); font:700 11px/1 var(--mono);
    display:flex; align-items:center; justify-content:center;
  }
  .schritte b { display:block; margin-bottom:3px; font-weight:640; }
  .schritte .leise { display:block; }

  /* --- Bedienelemente ---------------------------------------------- */
  a.knopf, button {
    font:15px/1 var(--schrift); border-radius:9px;
    border:1px solid var(--kante); background:var(--flaeche2);
    color:var(--text); padding:12px 18px; cursor:pointer;
    text-decoration:none; display:inline-block;
    transition:background .12s ease, border-color .12s ease;
  }
  button:hover, a.knopf:hover { background:var(--kante); }
  button.haupt { border-color:var(--akzent); color:var(--akzent); }
  button:disabled { opacity:.45; cursor:default; }
  a:focus-visible, button:focus-visible, input:focus-visible {
    outline:2px solid var(--akzent); outline-offset:2px;
  }

  .steam-knopf, .laden {
    display:flex; align-items:center; justify-content:center; gap:11px;
    width:100%; padding:16px 18px; border-radius:10px;
    font-weight:640; text-decoration:none;
  }
  .steam-knopf {
    margin-top:4px; color:#ffffff;
    background:linear-gradient(180deg,#2a4d68,#16222e);
    border:1px solid #3d6d92;
  }
  .steam-knopf:hover { background:linear-gradient(180deg,#31597a,#1b2b3a); }
  /* Der Download ist der Knopf, um den es geht - er darf laut sein. */
  .laden {
    flex-direction:column; gap:3px; margin-top:2px; padding:18px;
    color:#08121c; background:var(--akzent);
    border:1px solid var(--akzent);
    box-shadow:0 6px 20px rgba(102,192,244,.22);
  }
  .laden:hover { background:#8ed0ff; border-color:#8ed0ff; }
  .laden .gross { font-size:17px; font-weight:700; letter-spacing:-.2px; }
  .laden .klein { font:12.5px/1.3 var(--mono); opacity:.75; }

  /* Trennt die beiden Schritte innerhalb einer Karte, ohne sie zu
     zerreissen: eine Linie mit dem Wort in der Mitte. */
  .trenner {
    display:flex; align-items:center; gap:12px;
    margin:20px 0 14px; color:var(--leise);
    font:11px/1 var(--mono); letter-spacing:.14em; text-transform:uppercase;
  }
  .trenner::before, .trenner::after {
    content:""; flex:1; height:1px; background:var(--kante);
  }

  input[type=text] {
    font:15px/1.4 var(--schrift); width:100%; padding:12px 13px;
    border-radius:9px; border:1px solid var(--kante);
    background:var(--grund); color:var(--text);
  }
  .reihe { display:flex; gap:9px; margin-top:11px; flex-wrap:wrap; }
  .reihe input { flex:1 1 190px; }

  /* --- Maschinelles: Token, Punkte, Zeiten -------------------------- */
  .token {
    font:16px/1.5 var(--mono); letter-spacing:.02em;
    background:var(--grund); border:1px solid var(--kante);
    border-left:3px solid var(--akzent); border-radius:8px;
    padding:14px 15px; word-break:break-all; margin-bottom:13px;
    color:var(--text);
  }

  .merkmal {
    display:flex; justify-content:space-between; gap:12px; align-items:baseline;
    margin-top:15px; padding-top:13px; border-top:1px solid var(--kante);
    font-size:14.5px;
  }
  .merkmal span:last-child { font-family:var(--mono); font-size:13.5px; }
  .ja { color:var(--gut); } .warn { color:var(--zahl); } .nein { color:var(--schlecht); }

  .hinweis {
    background:var(--flaeche2); border:1px solid var(--kante);
    border-left:3px solid var(--zahl);
    border-radius:8px; padding:13px 15px; font-size:14.5px;
    color:var(--leise); margin-top:14px;
  }
  .hinweis b { color:var(--text); }

  /* --- Eigene Runden ------------------------------------------------ */
  .runden { list-style:none; margin:0; padding:0; }
  .runden li {
    display:flex; justify-content:space-between; gap:14px; align-items:baseline;
    padding:12px 0; border-top:1px solid var(--kante);
  }
  .runden li:first-child { border-top:0; padding-top:0; }
  .runden .wert {
    font:700 17px/1 var(--mono); font-variant-numeric:tabular-nums;
    color:var(--zahl);
  }
  .runden .rechts { text-align:right; font-size:14px; }
  .runden .frei { color:var(--gut); }
  .runden .abg { color:var(--schlecht); }
  .runden .off { color:var(--leise); }
  .runden .grund { display:block; color:var(--leise); font-size:13px; margin-top:2px; }

  /* Die Rangliste - der Grund, warum jemand die Seite aufruft. Sie
     steht ganz oben und braucht keine Anmeldung. */
  .rang { width:100%; border-collapse:collapse; }
  .rang th {
    text-align:left; padding:0 10px 9px 0; color:var(--leise);
    font:700 11px/1 var(--mono); letter-spacing:.11em; text-transform:uppercase;
  }
  .rang td { padding:9px 10px 9px 0; border-top:1px solid var(--kante); }
  .rang .platz {
    font:700 15px/1 var(--mono); color:var(--leise); width:44px;
    font-variant-numeric:tabular-nums;
  }
  .rang tr:nth-child(-n+3) .platz { color:var(--zahl); }
  .rang .wer { font-weight:600; }
  .rang .schnitt {
    text-align:right; font:700 16px/1 var(--mono);
    font-variant-numeric:tabular-nums; color:var(--zahl);
  }
  .rang .aus { text-align:right; color:var(--leise); font-size:12.5px; white-space:nowrap; }
  .rang tbody.anwaerter td { color:var(--leise); }
  .rang tbody.anwaerter .schnitt { color:var(--leise); font-weight:600; }
  .rang-titel {
    display:flex; justify-content:space-between; align-items:baseline;
    gap:12px; margin:26px 0 10px;
  }
  .rang-titel .leise { font-family:var(--mono); font-size:11px; letter-spacing:.11em;
    text-transform:uppercase; }

  /* Wie weit bis zur Wertung - eine Zahl, die man auch sehen kann. */
  .balken {
    height:6px; border-radius:3px; background:var(--flaeche2);
    border:1px solid var(--kante); overflow:hidden; margin:12px 0 16px;
  }
  .balken .gefuellt { height:100%; background:var(--zahl); }

  /* Der gefaehrliche Bereich: gedaempft, abgesetzt, nicht rot schreiend -
     er soll auffindbar sein, ohne zum Draufklicken einzuladen. */
  .gefahr {
    margin-top:18px; padding-top:15px; border-top:1px solid var(--kante);
  }
  .gefahr .titel {
    font:700 11px/1 var(--mono); letter-spacing:.11em; text-transform:uppercase;
    color:var(--leise); margin-bottom:7px;
  }
  .gefahr-knopf {
    margin-top:11px; border-color:rgba(240,115,111,.45); color:var(--schlecht);
    background:transparent;
  }
  .gefahr-knopf:hover { background:rgba(240,115,111,.12); }

  .fuss {
    max-width:var(--breite); margin:34px auto 0; text-align:center;
    color:var(--leise); font-size:13.5px;
  }
  .fuss b { color:var(--text); font-weight:600; }
  .discord {
    display:inline-flex; align-items:center; gap:8px; margin-left:10px;
    padding:8px 14px; border-radius:9px; text-decoration:none;
    background:#5865f2; color:#fff; font-weight:600; font-size:13.5px;
  }
  .discord:hover { background:#4752c4; }
  @media (max-width:540px) {
    .discord { display:flex; margin:12px auto 0; width:max-content; }
  }

  /* --- Eigene Dialoge statt confirm()/prompt() ---------------------- */
  .schleier {
    position:fixed; inset:0; background:rgba(6,8,12,.72);
    display:flex; align-items:center; justify-content:center; padding:22px;
    z-index:50; animation:auf .12s ease-out;
  }
  .dialog {
    background:var(--flaeche); border:1px solid var(--kante);
    border-radius:14px; padding:24px; width:min(430px, 100%);
    box-shadow:0 24px 60px rgba(0,0,0,.55);
    animation:hoch .14s ease-out;
  }
  .dialog .d-titel {
    font-size:18px; font-weight:660; letter-spacing:-.3px; margin-bottom:9px;
  }
  .dialog p { margin:0 0 4px; max-width:none; }
  .d-feld {
    width:100%; margin-top:14px; padding:11px 13px; border-radius:9px;
    border:1px solid var(--kante); background:var(--grund); color:var(--text);
    font:15px/1.4 var(--schrift);
  }
  .d-knoepfe {
    display:flex; gap:9px; justify-content:flex-end; margin-top:20px; flex-wrap:wrap;
  }
  @keyframes auf { from { opacity:0; } }
  @keyframes hoch { from { opacity:0; transform:translateY(9px) scale(.985); } }

  /* --- Meldungen ---------------------------------------------------- */
  #meldung {
    position:fixed; left:50%; bottom:26px; transform:translateX(-50%);
    background:var(--flaeche2); border:1px solid var(--kante);
    border-left:3px solid var(--akzent);
    padding:13px 20px; border-radius:11px; display:none; max-width:86vw;
    box-shadow:0 14px 38px rgba(0,0,0,.5); font-size:15px;
    animation:melden .16s ease-out;
  }
  #meldung.gut { border-left-color:var(--gut); }
  #meldung.schlecht { border-left-color:var(--schlecht); }
  @keyframes melden { from { opacity:0; transform:translate(-50%, 12px); } }

  @media (prefers-reduced-motion:reduce) {
    .schleier, .dialog, #meldung { animation:none; }
  }

  @media (prefers-reduced-motion:reduce) {
    * { transition:none !important; animation:none !important; }
  }

  @media (max-width:540px) {
    .kopf { padding:38px 0 24px; }
    .karte { padding:19px; }
  }
</style>
</head>
<body>
<div class="kopf">
  <div class="worte">
    <div class="augen">Meccha Chameleon · Rangliste</div>
    <h1 data-t="Deine Runden zählen mit.">Deine Runden zählen mit.</h1>
    <p class="unter" id="untertitel">…</p>
  </div>
  <div class="rechts-oben">
    <div class="sprachen" id="sprachen">
      <button data-sprache="en">EN</button>
      <button data-sprache="de">DE</button>
      <button data-sprache="zh">中文</button>
    </div>
    <div class="ablauf">
      <div class="feld"><span class="gross">F9</span><span class="klein" data-t="im Spiel drücken">im Spiel drücken</span></div>
      <span class="pfeil">→</span>
      <div class="feld"><span class="gross">OCR</span><span class="klein" data-t="Server liest ab">Server liest ab</span></div>
      <span class="pfeil">→</span>
      <div class="feld"><span class="gross">+2 771</span><span class="klein" data-t="in der Rangliste">in der Rangliste</span></div>
    </div>
  </div>
</div>
<div class="huelle">
  <div class="reiter" id="reiter">
    <button data-tafel="t-rang" class="aktiv" data-t="Rangliste">Rangliste</button>
    <button data-tafel="t-konto" data-t="Dein Zugang">Dein Zugang</button>
  </div>
  <div class="tafel aktiv" id="t-rang"><div id="rangliste"></div></div>
  <div class="tafel" id="t-konto"><div id="inhalt"></div></div>
  <div class="fuss">
    <span data-t="Fragen oder Probleme? Melde dich im Discord bei einem">Fragen oder Probleme? Melde dich im Discord bei einem</span> <b data-t="Admin oder Mod">Admin oder Mod</b>.
    ${discord ? `<a class="discord" href="${discord}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 18" width="19" height="15" aria-hidden="true"><path fill="currentColor"
        d="M20.3 1.6A19.8 19.8 0 0 0 15.4.2l-.3.5c1.7.4 2.9 1 4 1.7a15.7 15.7 0 0 0-11.9 0c1.1-.7 2.4-1.3 4-1.7L10.9.2A19.8 19.8 0 0 0 6 1.6C2.8 6.3 2 10.9 2.4 15.4a19.9 19.9 0 0 0 6 3l1.3-2c-.7-.2-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.9 19.9 0 0 0 6-3c.5-5.2-.8-9.8-3.7-13.8ZM9.7 12.6c-1.2 0-2.1-1.1-2.1-2.4S8.5 7.7 9.7 7.7s2.1 1.1 2.1 2.4-.9 2.5-2.1 2.5Zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.5 2.1-2.5 2.1 1.1 2.1 2.4-.9 2.5-2.1 2.5Z"/></svg>
      <span data-t="Discord öffnen">Discord öffnen</span>
    </a>` : ''}
  </div>
</div>
<div id="meldung"></div>

<script>
(function () {
  'use strict';

  var stand = null;

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ Sprache

     Englisch ist die Vorgabe, Deutsch und Chinesisch sind wählbar.

     Der deutsche Satz ist zugleich der SCHLÜSSEL im Wörterbuch. Das
     spart eine Ebene erfundener Kürzel („konto.token.hinweis"), hält
     den Code lesbar – und fehlt eine Übersetzung, steht dort deutscher
     Text statt einer leeren Stelle. Das fällt beim Ansehen sofort auf.

     {0}, {1} … sind Platzhalter für Zahlen und Namen. Ohne sie müsste
     man Sätze aus Bruchstücken zusammensetzen, und in einer anderen
     Sprache steht das Bruchstück an einer anderen Stelle.
  */

  var WOERTER = {
    en: {
      'Deine Runden zählen mit.': 'Your rounds count.',
      'im Spiel drücken': 'press in game',
      'Server liest ab': 'server reads it',
      'in der Rangliste': 'on the leaderboard',
      'Fragen oder Probleme? Melde dich im Discord bei einem':
        'Questions or trouble? Ask an',
      'Admin oder Mod': 'admin or mod on Discord',
      'Discord öffnen': 'Open Discord',
      'Ein Tastendruck nach der Runde, den Rest macht der Server. Kein Abtippen, keine Screenshots im Chat.':
        'One keypress after the round, the server does the rest. No typing, no screenshots in chat.',

      'In drei Schritten dabei': 'Three steps to join',
      'Programm herunterladen': 'Download the app',
      'Eine einzige Datei, 32 KB, keine Installation. Sie nimmt auf Tastendruck deinen Bildschirm auf und schickt das Bild hierher.':
        'A single file, 32 KB, no installation. One keypress captures your screen and sends the image here.',
      'Mit Steam anmelden': 'Sign in with Steam',
      'Du spielst Meccha ohnehin über Steam – ein Klick, fertig. Kein Passwort, keine Mailadresse, keine Anmeldung bei uns.':
        'You already play Meccha through Steam – one click, done. No password, no email, no account with us.',
      'Namen eintragen und Token einfügen': 'Enter your name, paste your token',
      'Trag ein, wie du in der Rangliste im Spiel stehst, kopier den Token ins Programm – fertig. Ab dann reicht F9.':
        'Enter your name exactly as it appears on the in-game leaderboard, paste the token into the app – done. From then on, F9 is enough.',

      'Los geht es': 'Get started',
      'ZIP · 21 KB · entpacken, starten, fertig':
        'ZIP · 21 KB · unzip, run, done',
      'Als ZIP, damit der Browser den Download nicht blockiert. Entpacken und die .exe darin starten.':
        'Packaged as a ZIP so your browser does not block the download. Unzip it and run the .exe inside.',
      'Windows meldet „Der Computer wurde geschützt"? Auf „Weitere Informationen" klicken, dann „Trotzdem ausführen". Das ist bei unsignierten Programmen normal.':
        'Windows says "Windows protected your PC"? Click "More info", then "Run anyway". That is normal for unsigned programs.',
      'und dann': 'and then',
      'Danach siehst du hier deinen Token und kannst jederzeit nachsehen, was aus deinen eingeschickten Runden geworden ist.':
        'Afterwards your token appears here, and you can check what happened to the rounds you sent in.',

      'Angemeldet als {0}': 'Signed in as {0}',
      'Dein Zugang ist gesperrt': 'Your access is blocked',
      ' – {0}. Melde dich im Discord bei einem Admin oder Mod.':
        ' – {0}. Contact an admin or mod on Discord.',
      'ohne Angabe': 'no reason given',

      'Dein Name im Spiel': 'Your in-game name',
      'Genau so, wie er in der Rangliste steht. Danach wird nur diese eine Zeile aus deinem Screenshot gewertet.':
        'Exactly as it appears on the leaderboard. Only that one row of your screenshot will count.',
      'dein Name in der Rangliste': 'your name on the leaderboard',
      'Ändern': 'Change',
      'Speichern': 'Save',
      'Der Name lässt sich erst in {0} Tag(en) wieder ändern. Brauchst du es früher, melde dich im Discord bei einem Admin oder Mod.':
        'The name can only be changed again in {0} day(s). Need it sooner? Ask an admin or mod on Discord.',
      'Gespeichert.': 'Saved.',

      'Dein Token': 'Your token',
      'Trag zuerst deinen Namen im Spiel ein – ohne den gibt es keinen Token.':
        'Enter your in-game name first – without it there is no token.',
      'Noch kein Token vorhanden.': 'No token yet.',
      'Der Token ist persönlich – mit ihm zählt jede Runde auf dein Konto. Gib ihn nicht weiter und zeig ihn nicht im Stream.':
        'The token is personal – every round sent with it counts for you. Do not share it, and do not show it on stream.',
      'Kopieren': 'Copy',
      'Kopiert. Im Programm unter „Token" einfügen.':
        'Copied. Paste it into the app under "Token".',
      'Markiere den Text und kopiere ihn mit Strg+C.':
        'Select the text and copy it with Ctrl+C.',
      'Neuen erzeugen': 'Create new',
      'Neuen Token erzeugen?': 'Create a new token?',
      'Der alte Token wird dabei ungültig – trag den neuen danach im Programm ein, sonst kommt nichts mehr an.':
        'The old token stops working – paste the new one into the app, otherwise nothing arrives.',
      'Neuer Token erzeugt – im Programm eintragen.':
        'New token created – paste it into the app.',
      'Runden werden geprüft': 'Rounds are reviewed',
      'ja – der Streamer gibt sie frei': 'yes – the streamer approves them',
      'nein – zählen sofort': 'no – they count right away',

      'Dein Anzeigename': 'Your display name',
      'Nur zur Anzeige – hat nichts damit zu tun, welche Zeile gewertet wird.':
        'For display only – it does not affect which row counts.',
      'Abmelden': 'Sign out',

      'Konto löschen': 'Delete account',
      'Dein Zugang gilt danach nicht mehr, und du verschwindest aus der Zuschauerliste. Deine bereits gewerteten Runden bleiben in der Punkteliste – sie gehören zum Turnier. Meldest du dich später wieder über Steam an, ist dein Konto zurück.':
        'Your access stops working and you disappear from the viewer list. Rounds already counted stay in the score list – they belong to the tournament. Sign in with Steam again later and your account is back.',
      'Konto löschen?': 'Delete account?',
      'Dein Token gilt danach nicht mehr. Gewertete Runden bleiben in der Punkteliste. Meldest du dich wieder über Steam an, ist dein Konto zurück.':
        'Your token stops working. Counted rounds stay in the score list. Sign in with Steam again and your account is back.',
      'Löschen': 'Delete',
      'Konto gelöscht. Du kannst dich jederzeit wieder anmelden.':
        'Account deleted. You can sign in again any time.',
      'Hat nicht geklappt.': 'That did not work.',

      'Verwaltung': 'Administration',
      'Du bist Admin: Runden freigeben, Zugänge und Rollen verwalten.':
        'You are an admin: approve rounds, manage access and roles.',
      'Du bist Mod: Runden freigeben und ablehnen.':
        'You are a mod: approve and reject rounds.',
      'Zum Dashboard': 'Open dashboard',

      'Programm': 'App',
      'Immer die aktuelle Fassung. Meldet dein Programm „veraltet", hol sie dir hier neu.':
        'Always the current version. If your app says "outdated", get it here again.',

      'Deine letzten Runden': 'Your recent rounds',
      'Du bist Anwärter: {0} von {1} gewerteten Runden. Noch {2}, dann stehst du in der Wertung.':
        'You are a contender: {0} of {1} counted rounds. {2} more and you are ranked.',
      'Du stehst in der Wertung – gerechnet wird der Schnitt deiner letzten {0} Runden.':
        'You are ranked – your average over the last {0} rounds counts.',
      'Noch nichts eingeschickt.': 'Nothing sent in yet.',
      'gewertet': 'counted',
      'abgelehnt': 'rejected',
      'wartet auf Prüfung': 'waiting for review',

      'Rangliste': 'Leaderboard',
      'Dein Zugang': 'Your access',
      'Schnitt der letzten {0}': 'average of the last {0}',
      'Noch keine Runden gewertet. Sei der Erste – unter „Dein Zugang" steht, wie es geht.':
        'No rounds counted yet. Be the first – see "Your access" for how it works.',
      'Spieler': 'Player',
      'Schnitt': 'Average',
      '{0} Runden': '{0} rounds',
      '{0} von {1}': '{0} of {1}',
      'Grau: noch Anwärter – ab {0} gewerteten Runden zählt der Schnitt.':
        'Grey: still contenders – from {0} counted rounds the average counts.',

      'gerade eben': 'just now',
      'vor {0} min': '{0} min ago',
      'vor {0} h': '{0} h ago',
      'vor {0} Tagen': '{0} days ago',

      'Abbrechen': 'Cancel',
      'Übernehmen': 'Apply',
      'Fehler beim Laden.': 'Could not load.',
      'Server nicht erreichbar.': 'Server unreachable.'
    },

    zh: {
      'Deine Runden zählen mit.': '你的每一局都算数。',
      'im Spiel drücken': '在游戏中按下',
      'Server liest ab': '服务器识别',
      'in der Rangliste': '进入排行榜',
      'Fragen oder Probleme? Melde dich im Discord bei einem':
        '有疑问或遇到问题？请在 Discord 联系',
      'Admin oder Mod': '管理员或版主',
      'Discord öffnen': '打开 Discord',
      'Ein Tastendruck nach der Runde, den Rest macht der Server. Kein Abtippen, keine Screenshots im Chat.':
        '一局结束后按一个键，其余交给服务器。无需手动输入，也不用把截图发到聊天里。',

      'In drei Schritten dabei': '三步即可参与',
      'Programm herunterladen': '下载程序',
      'Eine einzige Datei, 32 KB, keine Installation. Sie nimmt auf Tastendruck deinen Bildschirm auf und schickt das Bild hierher.':
        '只有一个文件，32 KB，无需安装。按一次键即可截取屏幕并发送到这里。',
      'Mit Steam anmelden': '使用 Steam 登录',
      'Du spielst Meccha ohnehin über Steam – ein Klick, fertig. Kein Passwort, keine Mailadresse, keine Anmeldung bei uns.':
        '你本来就通过 Steam 游玩 Meccha — 点一下即可。无需密码、邮箱，也不用在我们这里注册。',
      'Namen eintragen und Token einfügen': '填写名称并粘贴令牌',
      'Trag ein, wie du in der Rangliste im Spiel stehst, kopier den Token ins Programm – fertig. Ab dann reicht F9.':
        '按游戏排行榜上显示的名称填写，把令牌粘贴到程序里即可。之后按 F9 就够了。',

      'Los geht es': '开始使用',
      'ZIP · 21 KB · entpacken, starten, fertig':
        'ZIP · 21 KB · 解压后直接运行',
      'Als ZIP, damit der Browser den Download nicht blockiert. Entpacken und die .exe darin starten.':
        '以 ZIP 形式提供，避免浏览器拦截下载。解压后运行其中的 .exe 即可。',
      'Windows meldet „Der Computer wurde geschützt"? Auf „Weitere Informationen" klicken, dann „Trotzdem ausführen". Das ist bei unsignierten Programmen normal.':
        'Windows 提示"已保护你的电脑"？点击"更多信息"，然后选择"仍要运行"。未签名程序出现此提示属于正常现象。',
      'und dann': '然后',
      'Danach siehst du hier deinen Token und kannst jederzeit nachsehen, was aus deinen eingeschickten Runden geworden ist.':
        '之后你可以在这里看到令牌，并随时查看已提交对局的处理结果。',

      'Angemeldet als {0}': '已登录：{0}',
      'Dein Zugang ist gesperrt': '你的访问已被封禁',
      ' – {0}. Melde dich im Discord bei einem Admin oder Mod.':
        ' — {0}。请在 Discord 联系管理员或版主。',
      'ohne Angabe': '未说明原因',

      'Dein Name im Spiel': '你的游戏内名称',
      'Genau so, wie er in der Rangliste steht. Danach wird nur diese eine Zeile aus deinem Screenshot gewertet.':
        '请与排行榜上完全一致。之后只有截图中的这一行会被计入。',
      'dein Name in der Rangliste': '排行榜上的名称',
      'Ändern': '修改',
      'Speichern': '保存',
      'Der Name lässt sich erst in {0} Tag(en) wieder ändern. Brauchst du es früher, melde dich im Discord bei einem Admin oder Mod.':
        '名称需再过 {0} 天才能修改。如需提前更改，请在 Discord 联系管理员或版主。',
      'Gespeichert.': '已保存。',

      'Dein Token': '你的令牌',
      'Trag zuerst deinen Namen im Spiel ein – ohne den gibt es keinen Token.':
        '请先填写游戏内名称 — 否则无法生成令牌。',
      'Noch kein Token vorhanden.': '尚无令牌。',
      'Der Token ist persönlich – mit ihm zählt jede Runde auf dein Konto. Gib ihn nicht weiter und zeig ihn nicht im Stream.':
        '令牌属于你个人 — 用它提交的每一局都会计到你名下。请勿转发，也不要在直播中展示。',
      'Kopieren': '复制',
      'Kopiert. Im Programm unter „Token" einfügen.':
        '已复制。请粘贴到程序的"令牌"栏。',
      'Markiere den Text und kopiere ihn mit Strg+C.':
        '请选中文本并按 Ctrl+C 复制。',
      'Neuen erzeugen': '生成新令牌',
      'Neuen Token erzeugen?': '生成新令牌？',
      'Der alte Token wird dabei ungültig – trag den neuen danach im Programm ein, sonst kommt nichts mehr an.':
        '旧令牌将失效 — 请随后把新令牌填入程序，否则将无法提交。',
      'Neuer Token erzeugt – im Programm eintragen.':
        '已生成新令牌 — 请填入程序。',
      'Runden werden geprüft': '对局需要审核',
      'ja – der Streamer gibt sie frei': '是 — 由主播批准',
      'nein – zählen sofort': '否 — 立即计入',

      'Dein Anzeigename': '你的显示名称',
      'Nur zur Anzeige – hat nichts damit zu tun, welche Zeile gewertet wird.':
        '仅用于显示 — 与计入哪一行无关。',
      'Abmelden': '退出登录',

      'Konto löschen': '删除账号',
      'Dein Zugang gilt danach nicht mehr, und du verschwindest aus der Zuschauerliste. Deine bereits gewerteten Runden bleiben in der Punkteliste – sie gehören zum Turnier. Meldest du dich später wieder über Steam an, ist dein Konto zurück.':
        '之后你的访问将失效，并从观众列表中移除。已计入的对局仍保留在分数表中 — 它们属于比赛。日后再用 Steam 登录，账号即可恢复。',
      'Konto löschen?': '删除账号？',
      'Dein Token gilt danach nicht mehr. Gewertete Runden bleiben in der Punkteliste. Meldest du dich wieder über Steam an, ist dein Konto zurück.':
        '你的令牌将失效。已计入的对局仍保留在分数表中。再次用 Steam 登录后账号即可恢复。',
      'Löschen': '删除',
      'Konto gelöscht. Du kannst dich jederzeit wieder anmelden.':
        '账号已删除。你随时可以重新登录。',
      'Hat nicht geklappt.': '操作失败。',

      'Verwaltung': '管理',
      'Du bist Admin: Runden freigeben, Zugänge und Rollen verwalten.':
        '你是管理员：可审核对局、管理访问权限与角色。',
      'Du bist Mod: Runden freigeben und ablehnen.':
        '你是版主：可批准或拒绝对局。',
      'Zum Dashboard': '进入管理面板',

      'Programm': '程序',
      'Immer die aktuelle Fassung. Meldet dein Programm „veraltet", hol sie dir hier neu.':
        '始终是最新版本。若程序提示"版本过旧"，请在此重新下载。',

      'Deine letzten Runden': '你最近的对局',
      'Du bist Anwärter: {0} von {1} gewerteten Runden. Noch {2}, dann stehst du in der Wertung.':
        '你是候选：已计入 {0} / {1} 局。再有 {2} 局即可进入排名。',
      'Du stehst in der Wertung – gerechnet wird der Schnitt deiner letzten {0} Runden.':
        '你已进入排名 — 按最近 {0} 局的平均分计算。',
      'Noch nichts eingeschickt.': '尚未提交任何对局。',
      'gewertet': '已计入',
      'abgelehnt': '已拒绝',
      'wartet auf Prüfung': '等待审核',

      'Rangliste': '排行榜',
      'Dein Zugang': '你的账号',
      'Schnitt der letzten {0}': '最近 {0} 局平均分',
      'Noch keine Runden gewertet. Sei der Erste – unter „Dein Zugang" steht, wie es geht.':
        '还没有计入的对局。来当第一个 — 请看"你的账号"了解如何参与。',
      'Spieler': '玩家',
      'Schnitt': '平均分',
      '{0} Runden': '{0} 局',
      '{0} von {1}': '{0} / {1}',
      'Grau: noch Anwärter – ab {0} gewerteten Runden zählt der Schnitt.':
        '灰色：仍为候选 — 达到 {0} 局后平均分才计入排名。',

      'gerade eben': '刚刚',
      'vor {0} min': '{0} 分钟前',
      'vor {0} h': '{0} 小时前',
      'vor {0} Tagen': '{0} 天前',

      'Abbrechen': '取消',
      'Übernehmen': '确定',
      'Fehler beim Laden.': '加载失败。',
      'Server nicht erreichbar.': '无法连接服务器。'
    }
  };

  var sprache = (function () {
    try {
      var gemerkt = localStorage.getItem('mc_sprache');
      if (gemerkt && (gemerkt === 'de' || gemerkt === 'en' || gemerkt === 'zh')) return gemerkt;
    } catch (e) { /* privater Modus */ }
    return 'en';
  })();

  /** Übersetzt einen deutschen Satz. Fehlt er, bleibt er deutsch. */
  function t(text) {
    if (sprache === 'de') return text;
    var w = WOERTER[sprache];
    return (w && w[text] !== undefined) ? w[text] : text;
  }

  /** Wie t(), aber mit Platzhaltern: tv('Noch {0} Tage', [3]) */
  function tv(text, werte) {
    var s = t(text);
    (werte || []).forEach(function (w, i) {
      s = s.split('{' + i + '}').join(String(w));
    });
    return s;
  }

  function setzeSprache(neu) {
    sprache = neu;
    try { localStorage.setItem('mc_sprache', neu); } catch (e) { /* egal */ }
    document.documentElement.lang = neu;
    zeichneSprache();
    lade();
  }

  /** Übersetzt die festen Texte im HTML und markiert den aktiven Knopf. */
  function zeichneSprache() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (e) {
      e.textContent = t(e.getAttribute('data-t'));
    });
    Array.prototype.forEach.call(
      document.querySelectorAll('#sprachen button'), function (b) {
        b.className = b.getAttribute('data-sprache') === sprache ? 'aktiv' : '';
      });
  }


  function el(tag, klasse, text) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function melde(text, dauer, art) {
    var m = $('meldung');
    m.textContent = text;
    m.className = art || '';
    m.style.display = 'block';
    clearTimeout(melde.t);
    melde.t = setTimeout(function () { m.style.display = 'none'; }, dauer || 5000);
  }

  var letzteRunden = [];
  var wertung = { gewertet: 0, voll: 10 };

  /* ------------------------------------------------------------ Dialoge

     Eigene Fenster statt confirm() und prompt().

     Nicht aus Eitelkeit: die Browser-Dialoge sehen auf jedem System
     anders aus, lassen sich nicht beschriften ("OK/Abbrechen" statt
     "Löschen/Behalten") und blockieren nebenbei alles, was im
     Hintergrund läuft – bei einer Seite, die sich alle 15 Sekunden
     aktualisiert, ist das spürbar.

     frage()  ersetzt confirm()  → Promise<boolean>
     hole()   ersetzt prompt()   → Promise<string|null>
  */

  function dialog(o) {
    return new Promise(function (fertig) {
      var schleier = el('div', 'schleier');
      var kasten = el('div', 'dialog');

      kasten.appendChild(el('div', 'd-titel', o.titel));
      if (o.text) kasten.appendChild(el('p', 'leise', o.text));

      var feld = null;
      if (o.eingabe !== undefined) {
        feld = document.createElement('input');
        feld.type = 'text';
        feld.value = o.eingabe;
        feld.className = 'd-feld';
        kasten.appendChild(feld);
      }

      var reihe = el('div', 'd-knoepfe');
      var nein = el('button', null, o.abbrechen || t('Abbrechen'));
      var ja = el('button', o.art === 'schlecht' ? 'schlecht' : 'haupt', o.ja || 'OK');
      reihe.appendChild(nein);
      reihe.appendChild(ja);
      kasten.appendChild(reihe);
      schleier.appendChild(kasten);
      document.body.appendChild(schleier);

      function schliesse(wert) {
        document.removeEventListener('keydown', taste);
        schleier.parentNode.removeChild(schleier);
        fertig(wert);
      }
      function taste(e) {
        if (e.key === 'Escape') schliesse(o.eingabe !== undefined ? null : false);
        if (e.key === 'Enter' && feld) schliesse(feld.value.trim() || null);
      }

      nein.addEventListener('click', function () {
        schliesse(o.eingabe !== undefined ? null : false);
      });
      ja.addEventListener('click', function () {
        schliesse(feld ? (feld.value.trim() || null) : true);
      });
      // Klick daneben bricht ab - wie man es von Dialogen kennt.
      schleier.addEventListener('click', function (e) {
        if (e.target === schleier) schliesse(o.eingabe !== undefined ? null : false);
      });
      document.addEventListener('keydown', taste);

      (feld || ja).focus();
      if (feld) feld.select();
    });
  }

  function frage(titel, text, ja, art) {
    return dialog({ titel: titel, text: text, ja: ja, art: art });
  }

  function hole(titel, text, vorgabe) {
    return dialog({ titel: titel, text: text, eingabe: vorgabe || '', ja: t('Übernehmen') });
  }

  function schicke(pfad, wert) {
    return fetch(pfad, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wert: wert })
    }).then(function (r) { return r.json(); });
  }

  /* ------------------------------------------------- nicht angemeldet */

  function baueAnmeldung() {
    var ziel = $('inhalt');
    ziel.innerHTML = '';
    $('untertitel').textContent = t(
      'Ein Tastendruck nach der Runde, den Rest macht der Server. ' +
      'Kein Abtippen, keine Screenshots im Chat.');

    /* --- 1. Anleitung ------------------------------------------- */
    var k = el('div', 'karte');
    k.appendChild(el('h2', null, t('In drei Schritten dabei')));

    var liste = el('ol', 'schritte');
    [
      ['Programm herunterladen',
       'Eine einzige Datei, 32 KB, keine Installation. Sie nimmt auf Tastendruck ' +
       'deinen Bildschirm auf und schickt das Bild hierher.'],
      /* Bewusst ohne technische Einzelheiten: was genau Steam uns
         verraet, interessiert hier niemanden und wirft nur Fragen auf.
         Wichtig ist, was der Zuschauer NICHT tun muss. */
      ['Mit Steam anmelden',
       'Du spielst Meccha ohnehin über Steam – ein Klick, fertig. ' +
       'Kein Passwort, keine Mailadresse, keine Anmeldung bei uns.'],
      ['Namen eintragen und Token einfügen',
       'Trag ein, wie du in der Rangliste im Spiel stehst, kopier den Token ' +
       'ins Programm – fertig. Ab dann reicht F9.']
    ].forEach(function (schritt) {
      var li = document.createElement('li');
      li.appendChild(el('b', null, t(schritt[0])));
      li.appendChild(el('span', 'leise', t(schritt[1])));
      liste.appendChild(li);
    });
    k.appendChild(liste);
    ziel.appendChild(k);

    /* --- 2. Was zu tun ist: beide Knoepfe in EINER Karte ---------
       Getrennt waeren es zwei kurze Karten, und die rechte Spalte
       liefe der linken davon. Zusammen sind es zwei etwa gleich hohe
       Bloecke nebeneinander. */
    var kd = el('div', 'karte');
    kd.appendChild(el('h2', null, t('Los geht es')));

    var dl = document.createElement('a');
    dl.className = 'laden';
    dl.href = '/client';
    dl.appendChild(el('span', 'gross', '⬇  ' + t('Programm herunterladen')));
    dl.appendChild(el('span', 'klein', t('ZIP · 21 KB · entpacken, starten, fertig')));
    kd.appendChild(dl);
    /* Chrome blockt eine unsignierte .exe von einer jungen Domain hart
       weg. Als ZIP kommt sie durch - dafuer muss man einmal entpacken,
       und das sagt man besser vorher als hinterher. */
    kd.appendChild(el('p', 'leise', t(
      'Als ZIP, damit der Browser den Download nicht blockiert. Entpacken und die .exe darin starten.')));

    kd.appendChild(el('div', 'hinweis', t(
      'Windows meldet „Der Computer wurde geschützt"? Auf „Weitere Informationen" ' +
      'klicken, dann „Trotzdem ausführen". Das ist bei unsignierten Programmen normal.')));

    kd.appendChild(el('div', 'trenner', t('und dann')));

    var a = document.createElement('a');
    a.className = 'steam-knopf';
    a.href = '/anmelden';
    a.textContent = t('Mit Steam anmelden');
    kd.appendChild(a);

    kd.appendChild(el('p', 'leise', t(
      'Danach siehst du hier deinen Token und kannst jederzeit nachsehen, was ' +
      'aus deinen eingeschickten Runden geworden ist.')));

    ziel.appendChild(kd);
  }

  /* ---------------------------------------------------- angemeldet */

  function baueKonto(k) {
    var ziel = $('inhalt');
    ziel.innerHTML = '';
    $('untertitel').textContent = tv('Angemeldet als {0}', [k.benutzername]);

    if (k.gesperrt) {
      var sperre = el('div', 'hinweis');
      sperre.appendChild(el('b', null, t('Dein Zugang ist gesperrt')));
      sperre.appendChild(document.createTextNode(tv(
        ' – {0}. Melde dich im Discord bei einem Admin oder Mod.',
        [k.sperrgrund || t('ohne Angabe')])));
      ziel.appendChild(sperre);
    }

    /* --- Ingame-Name ------------------------------------------- */
    var kn = el('div', 'karte');
    kn.appendChild(el('h2', null, t('Dein Name im Spiel')));
    kn.appendChild(el('p', 'leise', t(
      'Genau so, wie er in der Rangliste steht. Danach wird nur diese eine ' +
      'Zeile aus deinem Screenshot gewertet.')));

    var feld = document.createElement('input');
    feld.type = 'text';
    feld.value = k.ingameName || '';
    feld.placeholder = t('dein Name in der Rangliste');

    var gesperrtBis = k.namensSperreBis || 0;
    var jetzt = Date.now();
    var kannAendern = k.ingameName === '' || gesperrtBis <= jetzt;

    var knopf = el('button', 'haupt', k.ingameName ? t('Ändern') : t('Speichern'));
    if (!kannAendern) {
      feld.disabled = true;
      knopf.disabled = true;
      var tage = Math.ceil((gesperrtBis - jetzt) / 86400000);
      kn.appendChild(el('div', 'hinweis', tv(
        'Der Name lässt sich erst in {0} Tag(en) wieder ändern. ' +
        'Brauchst du es früher, melde dich im Discord bei einem Admin oder Mod.',
        [tage])));
    }

    knopf.addEventListener('click', function () {
      knopf.disabled = true;
      schicke('/api/konto-ingame', feld.value).then(function (a) {
        knopf.disabled = false;
        if (!a.ok) { melde(a.fehler, 9000); return; }
        melde('Gespeichert.');
        stand = a.konto;
        baueKonto(stand);
      });
    });

    var reihe = el('div', 'reihe');
    reihe.appendChild(feld);
    reihe.appendChild(knopf);
    kn.appendChild(reihe);
    ziel.appendChild(kn);

    /* --- Token ------------------------------------------------- */
    var kt = el('div', 'karte');
    kt.appendChild(el('h2', null, t('Dein Token')));

    if (!k.ingameName) {
      kt.appendChild(el('p', 'leise', t(
        'Trag zuerst deinen Namen im Spiel ein – ohne den gibt es keinen Token.')));
    } else if (!k.token) {
      kt.appendChild(el('p', 'leise', t('Noch kein Token vorhanden.')));
    } else {
      kt.appendChild(el('div', 'token', k.token));

      /* Der Hinweis gehört an den Token, nicht in den Seitenfuß: hier
         steht er da, wo man ihn kopiert und weitergeben könnte. */
      kt.appendChild(el('p', 'leise', t(
        'Der Token ist persönlich – mit ihm zählt jede Runde auf dein Konto. ' +
        'Gib ihn nicht weiter und zeig ihn nicht im Stream.')));

      var kopieren = el('button', 'haupt', t('Kopieren'));
      kopieren.addEventListener('click', function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(k.token).then(function () {
            melde(t('Kopiert. Im Programm unter „Token" einfügen.'));
          });
        } else {
          // Ohne Zwischenablage-Recht bleibt Markieren von Hand.
          melde(t('Markiere den Text und kopiere ihn mit Strg+C.'));
        }
      });

      var neu = el('button', null, t('Neuen erzeugen'));
      neu.style.marginLeft = '8px';
      neu.addEventListener('click', function () {
        frage(t('Neuen Token erzeugen?'),
          t('Der alte Token wird dabei ungültig – trag den neuen danach im ' +
            'Programm ein, sonst kommt nichts mehr an.'),
          t('Neuen erzeugen'), 'schlecht').then(function (ok) {
          if (!ok) return;
          fetch('/api/konto-token', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (a) {
              if (!a.ok) { melde(a.fehler, 9000, 'schlecht'); return; }
              melde(t('Neuer Token erzeugt – im Programm eintragen.'), 0, 'gut');
              stand = a.konto;
              baueKonto(stand);
            });
        });
      });

      kt.appendChild(kopieren);
      kt.appendChild(neu);

      var m = el('div', 'merkmal');
      m.appendChild(el('span', null, t('Runden werden geprüft')));
      m.appendChild(el('span', k.brauchtFreigabe ? 'warn' : 'ja',
        k.brauchtFreigabe ? t('ja – der Streamer gibt sie frei') : t('nein – zählen sofort')));
      kt.appendChild(m);
    }
    ziel.appendChild(kt);

    /* --- Anzeigename ------------------------------------------- */
    var kb = el('div', 'karte');
    kb.appendChild(el('h2', null, t('Dein Anzeigename')));
    kb.appendChild(el('p', 'leise', t(
      'Nur zur Anzeige – hat nichts damit zu tun, welche Zeile gewertet wird.')));

    var bfeld = document.createElement('input');
    bfeld.type = 'text';
    bfeld.value = k.benutzername;

    var bknopf = el('button', null, t('Ändern'));
    bknopf.addEventListener('click', function () {
      bknopf.disabled = true;
      schicke('/api/konto-name', bfeld.value).then(function (a) {
        bknopf.disabled = false;
        if (!a.ok) { melde(a.fehler, 9000); return; }
        melde('Gespeichert.');
        stand = a.konto;
        baueKonto(stand);
      });
    });

    var breihe = el('div', 'reihe');
    breihe.appendChild(bfeld);
    breihe.appendChild(bknopf);
    kb.appendChild(breihe);

    /* Konto löschen: findbar, aber nicht neben dem Abmelden – sonst
       trifft es irgendwann jemand, der nur aussteigen wollte. Deshalb
       eigener Abschnitt, gedämpfte Farbe, Rückfrage mit Klartext. */
    var weg = el('div', 'gefahr');
    weg.appendChild(el('div', 'titel', t('Konto löschen')));
    weg.appendChild(el('p', 'leise', t(
      'Dein Zugang gilt danach nicht mehr, und du verschwindest aus der ' +
      'Zuschauerliste. Deine bereits gewerteten Runden bleiben in der ' +
      'Punkteliste – sie gehören zum Turnier. Meldest du dich später ' +
      'wieder über Steam an, ist dein Konto zurück.')));

    var wegKnopf = el('button', 'gefahr-knopf', t('Konto löschen'));
    wegKnopf.addEventListener('click', function () {
      frage(t('Konto löschen?'),
        t('Dein Token gilt danach nicht mehr. Gewertete Runden bleiben in der ' +
          'Punkteliste. Meldest du dich wieder über Steam an, ist dein Konto zurück.'),
        t('Löschen'), 'schlecht').then(function (ok) {
        if (!ok) return;
        wegKnopf.disabled = true;
        fetch('/api/konto-loeschen', { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (a) {
            if (!a.ok) {
              melde(a.fehler || t('Hat nicht geklappt.'), 9000, 'schlecht');
              wegKnopf.disabled = false;
              return;
            }
            melde(t('Konto gelöscht. Du kannst dich jederzeit wieder anmelden.'), 9000, 'gut');
            stand = null;
            lade();
          });
      });
    });
    weg.appendChild(wegKnopf);
    kb.appendChild(weg);

    var ab = document.createElement('a');
    ab.href = '/abmelden';
    ab.className = 'leise';
    ab.style.display = 'inline-block';
    ab.style.marginTop = '14px';
    ab.textContent = t('Abmelden');
    kb.appendChild(ab);

    ziel.appendChild(kb);

    /* Mods und Admins kommen von hier aus zur Verwaltung - sie sollen
       sich keine Adresse merken müssen. Zuschauer sehen davon nichts. */
    if (k.rolle === 'mod' || k.rolle === 'admin') {
      var kv = el('div', 'karte');
      kv.appendChild(el('h2', null, t('Verwaltung')));
      kv.appendChild(el('p', 'leise', k.rolle === 'admin'
        ? t('Du bist Admin: Runden freigeben, Zugänge und Rollen verwalten.')
        : t('Du bist Mod: Runden freigeben und ablehnen.')));

      var zv = document.createElement('a');
      zv.className = 'laden';
      zv.href = '/freigabe';
      zv.appendChild(el('span', 'gross', t('Zum Dashboard')));
      kv.appendChild(zv);
      ziel.appendChild(kv);
    }

    var kr = baueRunden(letzteRunden);
    if (kr) ziel.appendChild(kr);

    /* Auch hier der Download: wer den Rechner wechselt oder eine alte
       Fassung hat, soll nicht erst abmelden müssen, um ihn zu finden. */
    var kd = el('div', 'karte');
    kd.appendChild(el('h2', null, t('Programm')));
    kd.appendChild(el('p', 'leise', t(
      'Immer die aktuelle Fassung. Meldet dein Programm „veraltet", hol sie dir hier neu.')));
    var dl = document.createElement('a');
    dl.className = 'laden';
    dl.href = '/client';
    dl.appendChild(el('span', 'gross', '⬇  Meccha-Ranked.zip'));
    kd.appendChild(dl);
    kd.appendChild(el('p', 'leise', t(
      'Als ZIP, damit der Browser den Download nicht blockiert. Entpacken und die .exe darin starten.')));
    ziel.appendChild(kd);
  }

  /* ------------------------------------------------- eigene Runden

     Was aus den eigenen Einreichungen geworden ist. Vorher endete es
     bei „eingereicht" – wurde etwas abgelehnt, erfuhr man es nie und
     schickte dasselbe nochmal.
  */

  function alter(zeit) {
    var min = Math.round((Date.now() - zeit) / 60000);
    if (min < 1) return t('gerade eben');
    if (min < 60) return tv('vor {0} min', [min]);
    var std = Math.round(min / 60);
    if (std < 48) return tv('vor {0} h', [std]);
    return tv('vor {0} Tagen', [Math.round(std / 24)]);
  }

  function baueRunden(runden) {
    var k = el('div', 'karte');
    k.appendChild(el('h2', null, t('Deine letzten Runden')));

    /* Ab wann man ueberhaupt in der Liste steht. Ohne diesen Satz
       wundert sich jemand nach drei Runden, warum er nirgends
       auftaucht - und fragt im Discord nach. */
    var fehlt = Math.max(0, wertung.voll - wertung.gewertet);
    var balken = el('div', 'balken');
    var voll = el('div', 'gefuellt');
    voll.style.width = Math.min(100, Math.round(
      (wertung.gewertet / Math.max(1, wertung.voll)) * 100)) + '%';
    balken.appendChild(voll);

    k.appendChild(el('p', null, fehlt > 0
      ? tv('Du bist Anwärter: {0} von {1} gewerteten Runden. ' +
           'Noch {2}, dann stehst du in der Wertung.',
           [wertung.gewertet, wertung.voll, fehlt])
      : tv('Du stehst in der Wertung – gerechnet wird der Schnitt deiner ' +
           'letzten {0} Runden.', [wertung.voll])));
    k.appendChild(balken);

    if (!runden || !runden.length) {
      k.appendChild(el('p', 'leise', t('Noch nichts eingeschickt.')));
      return k;
    }

    var ul = el('ul', 'runden');
    runden.forEach(function (r) {
      var li = document.createElement('li');
      li.appendChild(el('span', 'wert', r.punkte === null ? '–' : String(r.punkte)));

      var rechts = el('div', 'rechts');
      var wort = r.status === 'freigegeben' ? t('gewertet')
        : (r.status === 'abgelehnt' ? t('abgelehnt') : t('wartet auf Prüfung'));
      var klasse = r.status === 'freigegeben' ? 'frei'
        : (r.status === 'abgelehnt' ? 'abg' : 'off');

      rechts.appendChild(el('span', klasse, wort + ' · ' + alter(r.eingegangen)));
      if (r.grund) rechts.appendChild(el('span', 'grund', r.grund));
      li.appendChild(rechts);
      ul.appendChild(li);
    });

    k.appendChild(ul);
    return k;
  }

  /* ---------------------------------------------------- Rangliste

     Steht ganz oben und ohne Anmeldung. Wer die Seite aufruft, will
     zuerst wissen, wo er steht - alles andere kommt danach.
  */

  function zahl(n) {
    return n.toLocaleString(sprache === 'de' ? 'de-DE' : 'en-US',
      { maximumFractionDigits: 0 });
  }

  function baueRangliste(d) {
    var k = el('div', 'karte');

    var kopf = el('div', 'rang-titel');
    kopf.appendChild(el('h2', null, t('Rangliste')));
    kopf.style.margin = '0 0 12px';
    kopf.appendChild(el('span', 'leise', tv('Schnitt der letzten {0}', [d.fenster])));
    k.appendChild(kopf);

    if (!d.gewertet.length && !d.anwaerter.length) {
      k.appendChild(el('p', 'leise', t(
        'Noch keine Runden gewertet. Sei der Erste – unter „Dein Zugang" steht, wie es geht.')));
      return k;
    }

    var tab = document.createElement('table');
    tab.className = 'rang';

    var thead = document.createElement('thead');
    var kz = document.createElement('tr');
    ['', t('Spieler'), t('Schnitt'), ''].forEach(function (x, i) {
      var th = el('th', i === 2 ? 'schnitt' : null, x);
      if (i === 2) th.style.textAlign = 'right';
      kz.appendChild(th);
    });
    thead.appendChild(kz);
    tab.appendChild(thead);

    var koerper = document.createElement('tbody');
    d.gewertet.forEach(function (z) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', 'platz', String(z.platz)));
      tr.appendChild(el('td', 'wer', z.name));
      tr.appendChild(el('td', 'schnitt', zahl(z.schnitt)));
      tr.appendChild(el('td', 'aus', tv('{0} Runden', [z.gesamt])));
      koerper.appendChild(tr);
    });
    tab.appendChild(koerper);

    /* Anwärter stehen darunter, gedämpft: sie zählen noch nicht, sollen
       aber sehen, dass sie schon dabei sind. */
    if (d.anwaerter.length) {
      var an = document.createElement('tbody');
      an.className = 'anwaerter';
      d.anwaerter.forEach(function (z) {
        var tr = document.createElement('tr');
        tr.appendChild(el('td', 'platz', '–'));
        tr.appendChild(el('td', 'wer', z.name));
        tr.appendChild(el('td', 'schnitt', zahl(z.schnitt)));
        tr.appendChild(el('td', 'aus', tv('{0} von {1}', [z.imFenster, d.voll])));
        an.appendChild(tr);
      });
      tab.appendChild(an);
    }

    k.appendChild(tab);

    if (d.anwaerter.length) {
      k.appendChild(el('p', 'leise', tv(
        'Grau: noch Anwärter – ab {0} gewerteten Runden zählt der Schnitt.', [d.voll])));
    }
    return k;
  }

  function ladeRangliste() {
    fetch('/api/rangliste').then(function (r) { return r.json(); }).then(function (d) {
      var ziel = $('rangliste');
      ziel.innerHTML = '';
      if (d && d.ok) ziel.appendChild(baueRangliste(d));
    }).catch(function (e) {
      /* Die Seite laedt auch ohne Rangliste weiter - aber der Grund
         gehoert in die Konsole. Ein stiller catch hat hier einmal einen
         Namenskonflikt verdeckt, der die ganze Tabelle verschluckt hat. */
      console.error('[mc-ranked] Rangliste:', e);
    });
  }

  /* --------------------------------------------------------- Laden */

  function lade() {
    var fehler = new URLSearchParams(location.search).get('fehler');
    if (fehler) {
      melde(fehler, 9000);
      history.replaceState(null, '', '/konto');
    }

    ladeRangliste();

    fetch('/api/konto').then(function (r) { return r.json(); }).then(function (a) {
      if (!a.ok) { $('untertitel').textContent = t('Fehler beim Laden.'); return; }
      if (!a.angemeldet) { baueAnmeldung(); return; }
      stand = a.konto;
      letzteRunden = a.runden || [];
      wertung = a.wertung || { gewertet: 0, voll: 10 };
      baueKonto(stand);
    }).catch(function (e) {
      $('untertitel').textContent = t('Server nicht erreichbar.');
    });
  }

  /* Reiter. Die Rangliste ist die Startansicht - wer nur nachsehen
     will, wie er steht, soll nicht erst klicken muessen. */
  $('reiter').addEventListener('click', function (e) {
    var knopf = e.target.closest('button');
    if (!knopf) return;
    var id = knopf.getAttribute('data-tafel');

    Array.prototype.forEach.call($('reiter').getElementsByTagName('button'),
      function (b) {
        b.className = b.getAttribute('data-tafel') === id ? 'aktiv' : '';
      });
    Array.prototype.forEach.call(document.getElementsByClassName('tafel'),
      function (tf) {
        tf.className = tf.id === id ? 'tafel aktiv' : 'tafel';
      });
  });

  /* Sprachwahl verdrahten und die festen Texte einmal uebersetzen,
     bevor der Rest geladen wird. */
  $('sprachen').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) setzeSprache(b.getAttribute('data-sprache'));
  });
  document.documentElement.lang = sprache;
  zeichneSprache();

  lade();
})();
</script>
</body>
</html>`;
}

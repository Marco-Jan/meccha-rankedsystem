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
  .laden {
    margin-top:4px; color:var(--akzent);
    background:transparent; border:1px dashed var(--akzent);
  }
  .laden:hover { background:rgba(102,192,244,.1); }
  .laden .gross { font-family:var(--mono); font-size:15px; }

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
    <h1>Deine Runden zählen mit.</h1>
    <p class="unter" id="untertitel">wird geladen …</p>
  </div>
  <div class="ablauf">
    <div class="feld"><span class="gross">F9</span><span class="klein">im Spiel drücken</span></div>
    <span class="pfeil">→</span>
    <div class="feld"><span class="gross">OCR</span><span class="klein">Server liest ab</span></div>
    <span class="pfeil">→</span>
    <div class="feld"><span class="gross">+2 771</span><span class="klein">in der Rangliste</span></div>
  </div>
</div>
<div class="huelle">
  <div id="inhalt"></div>
  <div class="fuss">
    Fragen oder Probleme? Melde dich im Discord bei einem <b>Admin oder Mod</b>.
    ${discord ? `<a class="discord" href="${discord}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 18" width="19" height="15" aria-hidden="true"><path fill="currentColor"
        d="M20.3 1.6A19.8 19.8 0 0 0 15.4.2l-.3.5c1.7.4 2.9 1 4 1.7a15.7 15.7 0 0 0-11.9 0c1.1-.7 2.4-1.3 4-1.7L10.9.2A19.8 19.8 0 0 0 6 1.6C2.8 6.3 2 10.9 2.4 15.4a19.9 19.9 0 0 0 6 3l1.3-2c-.7-.2-1.4-.6-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.9 19.9 0 0 0 6-3c.5-5.2-.8-9.8-3.7-13.8ZM9.7 12.6c-1.2 0-2.1-1.1-2.1-2.4S8.5 7.7 9.7 7.7s2.1 1.1 2.1 2.4-.9 2.5-2.1 2.5Zm6.6 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.5 2.1-2.5 2.1 1.1 2.1 2.4-.9 2.5-2.1 2.5Z"/></svg>
      Discord öffnen
    </a>` : ''}
  </div>
</div>
<div id="meldung"></div>

<script>
(function () {
  'use strict';

  var stand = null;

  function $(id) { return document.getElementById(id); }

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
      var nein = el('button', null, o.abbrechen || 'Abbrechen');
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
    return dialog({ titel: titel, text: text, eingabe: vorgabe || '', ja: 'Übernehmen' });
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
    $('untertitel').textContent =
      'Ein Tastendruck nach der Runde, den Rest macht der Server. ' +
      'Kein Abtippen, keine Screenshots im Chat.';

    /* --- 1. Anleitung ------------------------------------------- */
    var k = el('div', 'karte');
    k.appendChild(el('h2', null, 'In drei Schritten dabei'));

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
    ].forEach(function (t) {
      var li = document.createElement('li');
      li.appendChild(el('b', null, t[0]));
      li.appendChild(el('span', 'leise', t[1]));
      liste.appendChild(li);
    });
    k.appendChild(liste);
    ziel.appendChild(k);

    /* --- 2. Was zu tun ist: beide Knoepfe in EINER Karte ---------
       Getrennt waeren es zwei kurze Karten, und die rechte Spalte
       liefe der linken davon. Zusammen sind es zwei etwa gleich hohe
       Bloecke nebeneinander. */
    var kd = el('div', 'karte');
    kd.appendChild(el('h2', null, 'Los geht es'));

    kd.appendChild(el('p', 'leise',
      'Hol dir immer hier die aktuelle Fassung – nicht aus einem alten ' +
      'Chatverlauf. Zieht der Server um, funktionieren ältere Programme nicht mehr.'));

    var dl = document.createElement('a');
    dl.className = 'laden';
    dl.href = '/client';
    dl.appendChild(el('span', 'gross', '⬇  Meccha-Ranked.exe'));
    kd.appendChild(dl);

    kd.appendChild(el('div', 'hinweis',
      'Windows warnt bei unbekannten Programmen: „Der Computer wurde geschützt". ' +
      'Klick auf „Weitere Informationen" und dann auf „Trotzdem ausführen". ' +
      'Das ist normal – die Datei ist nicht signiert, weil ein Zertifikat dafür ' +
      'jährlich Geld kostet.'));

    kd.appendChild(el('div', 'trenner', 'und dann'));

    var a = document.createElement('a');
    a.className = 'steam-knopf';
    a.href = '/anmelden';
    a.textContent = 'Mit Steam anmelden';
    kd.appendChild(a);

    kd.appendChild(el('p', 'leise',
      'Danach siehst du hier deinen Token und kannst jederzeit nachsehen, was ' +
      'aus deinen eingeschickten Runden geworden ist.'));

    ziel.appendChild(kd);
  }

  /* ---------------------------------------------------- angemeldet */

  function baueKonto(k) {
    var ziel = $('inhalt');
    ziel.innerHTML = '';
    $('untertitel').textContent = 'Angemeldet als ' + k.benutzername;

    if (k.gesperrt) {
      var sperre = el('div', 'hinweis');
      sperre.appendChild(el('b', null, 'Dein Zugang ist gesperrt'));
      sperre.appendChild(document.createTextNode(' – ' + (k.sperrgrund || 'ohne Angabe') +
        '. Melde dich im Discord bei einem Admin oder Mod.'));
      ziel.appendChild(sperre);
    }

    /* --- Ingame-Name ------------------------------------------- */
    var kn = el('div', 'karte');
    kn.appendChild(el('h2', null, 'Dein Name im Spiel'));
    kn.appendChild(el('p', 'leise',
      'Genau so, wie er in der Rangliste steht. Danach wird nur diese eine ' +
      'Zeile aus deinem Screenshot gewertet.'));

    var feld = document.createElement('input');
    feld.type = 'text';
    feld.value = k.ingameName || '';
    feld.placeholder = 'dein Name in der Rangliste';

    var gesperrtBis = k.namensSperreBis || 0;
    var jetzt = Date.now();
    var kannAendern = k.ingameName === '' || gesperrtBis <= jetzt;

    var knopf = el('button', 'haupt', k.ingameName ? 'Ändern' : 'Speichern');
    if (!kannAendern) {
      feld.disabled = true;
      knopf.disabled = true;
      var tage = Math.ceil((gesperrtBis - jetzt) / 86400000);
      kn.appendChild(el('div', 'hinweis',
        'Der Name lässt sich erst in ' + tage + ' Tag(en) wieder ändern. ' +
        'Brauchst du es früher, melde dich im Discord bei einem Admin oder Mod.'));
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
    kt.appendChild(el('h2', null, 'Dein Token'));

    if (!k.ingameName) {
      kt.appendChild(el('p', 'leise',
        'Trag zuerst deinen Namen im Spiel ein – ohne den gibt es keinen Token.'));
    } else if (!k.token) {
      kt.appendChild(el('p', 'leise', 'Noch kein Token vorhanden.'));
    } else {
      kt.appendChild(el('div', 'token', k.token));

      /* Der Hinweis gehört an den Token, nicht in den Seitenfuß: hier
         steht er da, wo man ihn kopiert und weitergeben könnte. */
      kt.appendChild(el('p', 'leise',
        'Der Token ist persönlich – mit ihm zählt jede Runde auf dein Konto. ' +
        'Gib ihn nicht weiter und zeig ihn nicht im Stream.'));

      var kopieren = el('button', 'haupt', 'Kopieren');
      kopieren.addEventListener('click', function () {
        if (navigator.clipboard) {
          navigator.clipboard.writeText(k.token).then(function () {
            melde('Kopiert. Im Programm unter „Token" einfügen.');
          });
        } else {
          // Ohne Zwischenablage-Recht bleibt Markieren von Hand.
          melde('Markiere den Text und kopiere ihn mit Strg+C.');
        }
      });

      var neu = el('button', null, 'Neuen erzeugen');
      neu.style.marginLeft = '8px';
      neu.addEventListener('click', function () {
        frage('Neuen Token erzeugen?',
          'Der alte Token wird dabei ungültig – trag den neuen danach im ' +
          'Programm ein, sonst kommt nichts mehr an.',
          'Neuen erzeugen', 'schlecht').then(function (ok) {
          if (!ok) return;
          fetch('/api/konto-token', { method: 'POST' })
            .then(function (r) { return r.json(); })
            .then(function (a) {
              if (!a.ok) { melde(a.fehler, 9000, 'schlecht'); return; }
              melde('Neuer Token erzeugt – im Programm eintragen.', 0, 'gut');
              stand = a.konto;
              baueKonto(stand);
            });
        });
      });

      kt.appendChild(kopieren);
      kt.appendChild(neu);

      var m = el('div', 'merkmal');
      m.appendChild(el('span', null, 'Runden werden geprüft'));
      m.appendChild(el('span', k.brauchtFreigabe ? 'warn' : 'ja',
        k.brauchtFreigabe ? 'ja – der Streamer gibt sie frei' : 'nein – zählen sofort'));
      kt.appendChild(m);
    }
    ziel.appendChild(kt);

    /* --- Anzeigename ------------------------------------------- */
    var kb = el('div', 'karte');
    kb.appendChild(el('h2', null, 'Dein Anzeigename'));
    kb.appendChild(el('p', 'leise',
      'Nur zur Anzeige – hat nichts damit zu tun, welche Zeile gewertet wird.'));

    var bfeld = document.createElement('input');
    bfeld.type = 'text';
    bfeld.value = k.benutzername;

    var bknopf = el('button', null, 'Ändern');
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
    weg.appendChild(el('div', 'titel', 'Konto löschen'));
    weg.appendChild(el('p', 'leise',
      'Dein Zugang gilt danach nicht mehr, und du verschwindest aus der ' +
      'Zuschauerliste. Deine bereits gewerteten Runden bleiben in der ' +
      'Punkteliste – sie gehören zum Turnier. Meldest du dich später ' +
      'wieder über Steam an, ist dein Konto zurück.'));

    var wegKnopf = el('button', 'gefahr-knopf', 'Konto löschen');
    wegKnopf.addEventListener('click', function () {
      frage('Konto löschen?',
        'Dein Token gilt danach nicht mehr. Gewertete Runden bleiben in der ' +
        'Punkteliste. Meldest du dich wieder über Steam an, ist dein Konto zurück.',
        'Löschen', 'schlecht').then(function (ok) {
        if (!ok) return;
        wegKnopf.disabled = true;
        fetch('/api/konto-loeschen', { method: 'POST' })
          .then(function (r) { return r.json(); })
          .then(function (a) {
            if (!a.ok) {
              melde(a.fehler || 'Hat nicht geklappt.', 9000, 'schlecht');
              wegKnopf.disabled = false;
              return;
            }
            melde('Konto gelöscht. Du kannst dich jederzeit wieder anmelden.', 9000, 'gut');
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
    ab.textContent = 'Abmelden';
    kb.appendChild(ab);

    ziel.appendChild(kb);

    var kr = baueRunden(letzteRunden);
    if (kr) ziel.appendChild(kr);

    /* Auch hier der Download: wer den Rechner wechselt oder eine alte
       Fassung hat, soll nicht erst abmelden müssen, um ihn zu finden. */
    var kd = el('div', 'karte');
    kd.appendChild(el('h2', null, 'Programm'));
    kd.appendChild(el('p', 'leise',
      'Immer die aktuelle Fassung. Meldet dein Programm „veraltet", hol sie dir hier neu.'));
    var dl = document.createElement('a');
    dl.className = 'laden';
    dl.href = '/client';
    dl.appendChild(el('span', 'gross', '⬇  Meccha-Ranked.exe'));
    kd.appendChild(dl);
    ziel.appendChild(kd);
  }

  /* ------------------------------------------------- eigene Runden

     Was aus den eigenen Einreichungen geworden ist. Vorher endete es
     bei „eingereicht" – wurde etwas abgelehnt, erfuhr man es nie und
     schickte dasselbe nochmal.
  */

  function alter(zeit) {
    var min = Math.round((Date.now() - zeit) / 60000);
    if (min < 1) return 'gerade eben';
    if (min < 60) return 'vor ' + min + ' min';
    var std = Math.round(min / 60);
    if (std < 48) return 'vor ' + std + ' h';
    return 'vor ' + Math.round(std / 24) + ' Tagen';
  }

  function baueRunden(runden) {
    var k = el('div', 'karte');
    k.appendChild(el('h2', null, 'Deine letzten Runden'));

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
      ? 'Du bist Anwärter: ' + wertung.gewertet + ' von ' + wertung.voll +
        ' gewerteten Runden. Noch ' + fehlt + ', dann stehst du in der Wertung.'
      : 'Du stehst in der Wertung – gerechnet wird der Schnitt deiner letzten ' +
        wertung.voll + ' Runden.'));
    k.appendChild(balken);

    if (!runden || !runden.length) {
      k.appendChild(el('p', 'leise', 'Noch nichts eingeschickt.'));
      return k;
    }

    var ul = el('ul', 'runden');
    runden.forEach(function (r) {
      var li = document.createElement('li');
      li.appendChild(el('span', 'wert', r.punkte === null ? '–' : String(r.punkte)));

      var rechts = el('div', 'rechts');
      var wort = r.status === 'freigegeben' ? 'gewertet'
        : (r.status === 'abgelehnt' ? 'abgelehnt' : 'wartet auf Prüfung');
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

  /* --------------------------------------------------------- Laden */

  function lade() {
    var fehler = new URLSearchParams(location.search).get('fehler');
    if (fehler) {
      melde(fehler, 9000);
      history.replaceState(null, '', '/konto');
    }

    fetch('/api/konto').then(function (r) { return r.json(); }).then(function (a) {
      if (!a.ok) { $('untertitel').textContent = 'Fehler beim Laden.'; return; }
      if (!a.angemeldet) { baueAnmeldung(); return; }
      stand = a.konto;
      letzteRunden = a.runden || [];
      wertung = a.wertung || { gewertet: 0, voll: 10 };
      baueKonto(stand);
    }).catch(function (e) {
      $('untertitel').textContent = 'Server nicht erreichbar.';
    });
  }

  lade();
})();
</script>
</body>
</html>`;
}

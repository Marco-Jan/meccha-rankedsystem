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

  /* Die oeffentliche Adresse. Ohne sie waeren canonical und og:url raten -
     lieber weglassen als etwas Falsches behaupten. */
  const url = (verteilung().server || '').replace(/\/+$/, '');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Meccha Ranked – MECCHA CHAMELEON Leaderboard</title>

<!-- ====================================================================
     Auffindbarkeit

     Die Seite hat genau einen Zweck: jemand sucht die Rangliste oder
     bekommt den Link aus dem Stream. Beides soll funktionieren - in der
     Suche mit einer brauchbaren Beschreibung, im Chat mit einer Vorschau
     statt einer nackten Adresse.

     Sprache: das ausgelieferte HTML ist deutsch, weil der deutsche Satz
     hier ueberall der Schluessel ist. Die Anzeige stellt sich beim Laden
     auf Englisch um und setzt dabei auch lang= und den Titel nach - siehe
     setzeSprache().
     ==================================================================== -->
<meta name="description" content="Live leaderboard for MECCHA CHAMELEON. Press F9 after a round, the server reads your score from the screenshot and adds it. Average of your last 10 rounds counts.">
<meta name="robots" content="index, follow">
<meta name="theme-color" content="#12141a">${url ? `
<link rel="canonical" href="${url}/">` : ''}

<meta property="og:type" content="website">
<meta property="og:site_name" content="Meccha Ranked">
<meta property="og:title" content="Meccha Ranked – MECCHA CHAMELEON Leaderboard">
<meta property="og:description" content="Press F9 after a round. The server reads your score and puts it on the leaderboard.">${url ? `
<meta property="og:url" content="${url}/">` : ''}
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="de_DE">
<meta property="og:locale:alternate" content="zh_CN">
<!-- Bewusst ohne og:image: Discord und X rendern kein SVG, und ein
     richtiges Vorschaubild waere eine PNG-Datei, die es noch nicht gibt.
     Ein Link auf ein fehlendes Bild sieht in der Vorschau schlechter aus
     als gar keines - dann zeigen sie Titel und Text. -->
<meta name="twitter:card" content="summary">

<!-- Das Zeichen in der Reiterleiste: eine Rangliste als drei Balken, das
     laengste in Akzentfarbe. Als SVG direkt eingebettet - eine eigene
     Datei waere eine zusaetzliche Anfrage fuer 300 Bytes. -->
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="7" fill="#12141a"/>' +
  '<rect x="7" y="20" width="18" height="4" rx="2" fill="#5a6474"/>' +
  '<rect x="7" y="13" width="12" height="4" rx="2" fill="#8b95a6"/>' +
  '<rect x="7" y="6" width="15" height="4" rx="2" fill="#f0b441"/>' +
  '</svg>'
)}">
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

  /* Der Download-Knopf im Kopf. Steam-Blau wie alle Hauptwege - Bernstein
     bleibt den Punkten vorbehalten. */
  .holen-reihe {
    display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:22px;
  }
  .holen {
    display:inline-flex; align-items:center; gap:11px;
    background:var(--akzent); color:#06121c;
    text-decoration:none; font-weight:700;
    padding:12px 22px; border-radius:10px;
  }
  .holen:hover { filter:brightness(1.08); }
  .holen-zeichen { font-size:19px; line-height:1; }
  .holen-worte { display:flex; flex-direction:column; gap:1px; }
  .holen-gross { font-size:15px; }
  .holen-klein { font-size:11.5px; font-weight:500; opacity:.72; }
  .holen-warum { font-size:13px; color:var(--leise); }
  .holen-warum:hover { color:var(--akzent); }

  /* Veraltete Fassung: Bernstein, derselbe Ton wie im Client, wo der
     Hinweiskasten gelb ist. Der Knopf wird nicht groesser und springt
     nicht - er wechselt die Farbe und traegt einen Punkt. Wer das nicht
     kennt, liest einfach die Zeile darunter. */
  .holen.neu { background:var(--zahl); }
  .holen.neu .holen-klein { opacity:.9; font-weight:700; }
  .holen.neu .holen-zeichen::after {
    content:"";
    display:inline-block; width:7px; height:7px; margin-left:-3px;
    vertical-align:top; border-radius:50%; background:#06121c;
  }

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

  /* Der Regelstreifen. Bernstein wie die Punktezahlen - er gehoert zum
     Wichtigsten auf der Seite, ohne wie eine Fehlermeldung (rot) oder ein
     Hinweis zum Wegklicken (grau) auszusehen. */
  .regel {
    display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    margin:6px 0 22px; padding:13px 16px; border-radius:11px;
    background:rgba(240,180,65,.08); border:1px solid rgba(240,180,65,.28);
    font-size:14.5px; line-height:1.5; color:var(--text);
  }
  .regel-schild {
    flex:none; padding:3px 9px; border-radius:6px;
    background:var(--akzent); color:#231a05;
    font:700 11px/1 var(--mono); letter-spacing:.12em;
  }
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

  /* Zwei Wege am Seitenende: Regeln und Programm. Als Kacheln statt als
     Textlinks - beides sind Dinge, die man SUCHT, und ein unterstrichenes
     Wort in einer Fusszeile findet niemand. */
  .wege {
    display:flex; gap:10px; flex-wrap:wrap;
    justify-content:center; margin:0 0 14px;
  }
  .weg {
    display:flex; flex-direction:column; gap:2px;
    background:var(--flaeche2); border:1px solid var(--kante);
    border-radius:9px; padding:10px 16px; min-width:150px;
    text-decoration:none; color:var(--text);
  }
  .weg:hover { border-color:var(--akzent); }
  .weg-gross { font-weight:600; font-size:14px; }
  .weg-klein { font-size:12px; color:var(--leise); }

  /* Der Verweis direkt am Regelstreifen - dort sucht man die Regel
     zuerst, also gehoert er dorthin und nicht nur nach unten. */
  .regel-mehr { white-space:nowrap; font-weight:600; text-decoration:none; }
  .regel-mehr:hover { text-decoration:underline; }

  /* Umschalter zwischen mehreren Ranglisten. Sieht aus wie die Reiter
     darunter, damit klar ist, dass beides dasselbe tut. */
  .umschalter {
    display:flex; gap:6px; flex-wrap:wrap; margin:0 0 12px;
  }
  .umschalter button {
    background:var(--flaeche2); color:var(--leise);
    border:1px solid var(--kante); border-radius:8px;
    padding:7px 14px; font-size:14px; cursor:pointer;
    font-family:inherit;
  }
  .umschalter button.aktiv {
    background:var(--flaeche); color:var(--text);
    border-color:var(--akzent);
  }

  /* Die Pruefsumme: umbrechbar, mit Luft zwischen den Zeichen - sie soll
     sich von Auge mit dem vergleichen lassen, was Get-FileHash ausgibt. */
  code.summe {
    display:block; margin:6px 0 8px;
    font-family:ui-monospace, Consolas, monospace; font-size:12px;
    background:var(--grund); border:1px solid var(--kante);
    border-radius:5px; padding:8px 10px;
    word-break:break-all; line-height:1.8; letter-spacing:.03em;
  }

  /* Auf dem Sprung. Bernstein, weil es um Punkte geht - nicht Steam-Blau,
     das gehoert den Knoepfen. */
  .sprung {
    border:1px solid var(--zahl); border-radius:9px;
    padding:11px 13px; margin:0 0 15px;
    background:color-mix(in srgb, var(--zahl) 8%, transparent);
  }
  .sprung-titel {
    font-size:12px; font-weight:700; letter-spacing:.06em;
    text-transform:uppercase; color:var(--zahl); margin-bottom:7px;
  }
  .sprung-zeile {
    display:flex; align-items:baseline; gap:10px; padding:3px 0;
  }
  .sprung-zeile .wer { font-weight:600; }
  .sprung-zeile .schnitt {
    color:var(--zahl); font-weight:700; font-variant-numeric:tabular-nums;
    margin-left:auto;
  }
  .sprung-zeile .leise { font-size:12px; min-width:88px; text-align:right; }
  .sprung > .leise { font-size:12px; margin-top:6px; }
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

  /* Der Warnkasten. Zugeklappt eine Zeile, aufgeklappt die ganze
     Erklaerung - wer die Warnung nicht bekommt, soll sie nicht lesen
     muessen, wer sie bekommt, findet sie an Ort und Stelle. */
  .warnkasten {
    margin:14px 0 0; padding:0 14px;
    border:1px solid rgba(240,180,65,.32); border-radius:10px;
    background:rgba(240,180,65,.06);
  }
  .warnkasten > summary {
    cursor:pointer; padding:11px 0; list-style:none;
    font-size:13.5px; font-weight:600; color:#f0b441;
  }
  .warnkasten > summary::-webkit-details-marker { display:none; }
  .warnkasten > summary:hover { color:#ffc95e; }
  .warnkasten[open] > summary { border-bottom:1px solid rgba(240,180,65,.2); }
  .warnkasten h3 {
    margin:14px 0 4px; font-size:12px; letter-spacing:.09em;
    text-transform:uppercase; color:#f0b441; opacity:.85;
  }
  .warnkasten p { margin:0 0 9px; font-size:13.5px; line-height:1.55; color:var(--leise); }
  .warnkasten[open] > p:last-child { padding-bottom:12px; }
  .warnkasten p:first-of-type { margin-top:12px; }

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

    <!-- Der Download gehört hierher und nicht unter die Rangliste.
         Dort wanderte er mit jedem neuen Spieler weiter nach unten, bis
         ihn niemand mehr sah - und er ist das Erste, was jemand braucht.

         Der große Knopf lädt direkt. Daneben klein der Weg zur Seite,
         die erklärt, warum Windows gleich warnen wird: wer das vorher
         gelesen hat, erschrickt nicht. -->
    <div class="holen-reihe">
      <a class="holen" id="holen-knopf" href="/client">
        <span class="holen-zeichen">⬇</span>
        <span class="holen-worte">
          <span class="holen-gross" data-t="Programm herunterladen">Programm herunterladen</span>
          <span class="holen-klein" id="holen-daten">ohne Installation</span>
        </span>
      </a>
      <a class="holen-warum" href="/download" data-t="Warum warnt mein Browser?">Warum warnt mein Browser?</a>
    </div>
  </div>
  <div class="rechts-oben">
    <div class="sprachen" id="sprachen">
      <button data-sprache="en">EN</button>
      <button data-sprache="de">DE</button>
      <button data-sprache="zh">中文</button>
      <button data-sprache="ja">日本語</button>
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
  <!-- Die Kernregel, gross und ueber beiden Reitern. Steht bewusst nicht
       im Kleingedruckten: wer es nicht weiss, wundert sich, warum seine
       Runde nicht zaehlt, und haelt es fuer einen Fehler. Die 6 wird beim
       Laden aus /api/status gesetzt - eine Zahl, eine Quelle. -->
  <div class="regel" id="regel">
    <span class="regel-schild" data-t="REGEL">REGEL</span>
    <span data-tp="Eine Runde zählt nur, wenn mindestens {0} Verstecker im Scoreboard stehen."
      >Eine Runde zählt nur, wenn mindestens 6 Verstecker im Scoreboard stehen.</span>
    <a class="regel-mehr" href="/regeln" data-t="Alle Regeln">Alle Regeln →</a>
  </div>
  <div class="tafel aktiv" id="t-rang"><div id="rangliste"></div></div>
  <div class="tafel" id="t-konto"><div id="inhalt"></div></div>
  <div class="fuss">
    <!-- Hier stand bis eben auch eine Kachel "Programm". Sie sah aus wie
         ein zweiter Download-Knopf, und genau das sollte sie nicht sein:
         der Knopf steht oben im Kopf, wo er nicht wegwandert. Uebrig
         bleibt der Weg zu den Regeln. -->
    <div class="wege">
      <a class="weg" href="/regeln">
        <span class="weg-gross" data-t="Regeln">Regeln</span>
        <span class="weg-klein" data-t="Wann eine Runde zählt">Wann eine Runde zählt</span>
      </a>
    </div>
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
      'Auf dem Sprung': 'On the verge',
      'Käme mit diesem Schnitt unter die ersten drei.':
        'Would reach the top three with this average.',
      'noch {0} Runden': '{0} rounds to go',
      'Alle Regeln nachlesen': 'Read all rules',
      'mehr': 'more',
      'Selbst nachsehen': 'Check for yourself',
      'Fingerabdruck wird geladen \u2026': 'Loading fingerprint \u2026',
      'SHA-256 der Datei:': 'SHA-256 of the file:',
      'Bei VirusTotal nachschlagen': 'Look it up on VirusTotal',
      'Findet VirusTotal nichts, hat die Datei noch niemand hochgeladen \u2013 das kannst du selbst tun, kostenlos.':
        'If VirusTotal finds nothing, nobody has uploaded the file yet \u2013 you can do that yourself, for free.',
      'Ausf\u00fchrlich mit Bildern': 'In detail, with screenshots',
      'Zurzeit läuft keine Wertung.': 'No leaderboard is running right now.',
      'Wann eine Runde zählt': 'When a round counts',
      'Herunterladen und einrichten': 'Download and set up',
      'Alle Regeln': 'All rules →',
      'Regeln': 'Rules',
      'Programm herunterladen': 'Download the app',
      'Warum warnt mein Browser?': 'Why does my browser warn me?',
      'Fassung {0}': 'version {0}',
      'vom {0}': 'built {0}',
      'Neue Fassung {0} – du hast {1}': 'New version {0} – you have {1}',
      'ohne Installation': 'no installation',
      'Hol dir zuerst das Programm – der Knopf steht oben.': 'First get the app – the button is at the top.',
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
      'REGEL': 'RULE',
      'Eine Runde zählt nur, wenn mindestens {0} Verstecker im Scoreboard stehen.':
        'A round only counts when at least {0} hiders are on the scoreboard.',
      '⚠  Windows warnt vor der Datei? Das ist normal – hier steht warum.':
        '⚠  Windows warns about the file? That is normal – here is why.',
      'Das Programm ist nicht digital signiert. Windows und der Browser können deshalb nicht nachsehen, wer es gebaut hat, und warnen vorsichtshalber. Das ist keine Aussage darüber, ob etwas schädlich ist – nur darüber, dass ein Nachweis fehlt.':
        'The app is not digitally signed. Windows and your browser therefore cannot check who built it, so they warn you as a precaution. That says nothing about whether anything is harmful – only that a proof of origin is missing.',
      'Eine solche Signatur muss man jährlich kaufen. Für ein kostenloses Zuschauer-Werkzeug lohnt sich das nicht, deshalb bleibt die Warnung.':
        'Such a signature has to be bought every year. For a free viewer tool that is not worth it, so the warning stays.',
      'Beim Herunterladen': 'While downloading',
      'Der Browser meldet „Verdächtiger Download blockiert" oder „wird selten heruntergeladen". Wähle im Download-Menü „Beibehalten" – mehr ist es nicht.':
        'Your browser says "Suspicious download blocked" or "not commonly downloaded". Choose "Keep" in the download menu – that is all there is to it.',
      'Beim ersten Start': 'On first launch',
      'Es erscheint ein blaues Fenster: „Der Computer wurde durch Windows geschützt". Klick auf „Weitere Informationen" und dann auf „Trotzdem ausführen". Das musst du nur einmal machen – danach startet es normal.':
        'A blue window appears: "Windows protected your PC". Click "More info", then "Run anyway". You only need to do this once – after that it starts normally.',
      'Du willst es selbst prüfen? Lad die Datei bei virustotal.com hoch, das ist kostenlos und lässt sie von über 60 Virenscannern ansehen.':
        'Want to check for yourself? Upload the file to virustotal.com – it is free and has over 60 antivirus engines look at it.',
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
      'Auf dem Sprung': '即将上榜',
      'Käme mit diesem Schnitt unter die ersten drei.':
        '按此均分可进前三。',
      'noch {0} Runden': '还差 {0} 局',
      'Alle Regeln nachlesen': '查看全部规则',
      'mehr': '更多',
      'Selbst nachsehen': '\u81ea\u5df1\u9a8c\u8bc1',
      'Fingerabdruck wird geladen \u2026': '\u6b63\u5728\u52a0\u8f7d\u6307\u7eb9 \u2026',
      'SHA-256 der Datei:': '\u6587\u4ef6\u7684 SHA-256\uff1a',
      'Bei VirusTotal nachschlagen': '\u5728 VirusTotal \u4e0a\u67e5\u770b',
      'Findet VirusTotal nichts, hat die Datei noch niemand hochgeladen \u2013 das kannst du selbst tun, kostenlos.':
        '\u5982\u679c VirusTotal \u6ca1\u6709\u7ed3\u679c\uff0c\u8bf4\u660e\u8fd8\u6ca1\u6709\u4eba\u4e0a\u4f20\u8fc7 \u2013 \u4f60\u53ef\u4ee5\u81ea\u5df1\u4e0a\u4f20\uff0c\u514d\u8d39\u3002',
      'Ausf\u00fchrlich mit Bildern': '\u8be6\u7ec6\u8bf4\u660e\uff08\u5e26\u622a\u56fe\uff09',
      'Zurzeit läuft keine Wertung.': '目前没有进行中的排行榜。',
      'Wann eine Runde zählt': '什么时候计分',
      'Herunterladen und einrichten': '下载并设置',
      'Alle Regeln': '全部规则 →',
      'Regeln': '规则',
      'Programm herunterladen': '下载客户端',
      'Warum warnt mein Browser?': '浏览器为什么提醒？',
      'Fassung {0}': '版本 {0}',
      'vom {0}': '构建于 {0}',
      'Neue Fassung {0} – du hast {1}': '新版本 {0} – 你的是 {1}',
      'ohne Installation': '无需安装',
      'Hol dir zuerst das Programm – der Knopf steht oben.': '先下载客户端 – 按钮在顶部。',
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
      'REGEL': '规则',
      'Eine Runde zählt nur, wenn mindestens {0} Verstecker im Scoreboard stehen.':
        '只有当记分板上至少有 {0} 名躲藏者时，该局才计入。',
      '⚠  Windows warnt vor der Datei? Das ist normal – hier steht warum.':
        '⚠  Windows 提示该文件有风险？这是正常现象 — 原因如下。',
      'Das Programm ist nicht digital signiert. Windows und der Browser können deshalb nicht nachsehen, wer es gebaut hat, und warnen vorsichtshalber. Das ist keine Aussage darüber, ob etwas schädlich ist – nur darüber, dass ein Nachweis fehlt.':
        '本程序没有数字签名，因此 Windows 和浏览器无法核实它的开发者，出于谨慎会发出警告。这并不表示程序有害，只是缺少来源证明。',
      'Eine solche Signatur muss man jährlich kaufen. Für ein kostenloses Zuschauer-Werkzeug lohnt sich das nicht, deshalb bleibt die Warnung.':
        '这种签名需要每年付费购买。对一个免费的观众工具来说并不划算，所以警告会一直存在。',
      'Beim Herunterladen': '下载时',
      'Der Browser meldet „Verdächtiger Download blockiert" oder „wird selten heruntergeladen". Wähle im Download-Menü „Beibehalten" – mehr ist es nicht.':
        '浏览器会提示“已拦截可疑下载”或“下载次数较少”。在下载菜单中选择“保留”即可 – 仅此而已。',
      'Beim ersten Start': '首次运行时',
      'Es erscheint ein blaues Fenster: „Der Computer wurde durch Windows geschützt". Klick auf „Weitere Informationen" und dann auf „Trotzdem ausführen". Das musst du nur einmal machen – danach startet es normal.':
        '会出现一个蓝色窗口：“Windows 已保护你的电脑”。请点击“更多信息”，然后选择“仍要运行”。这一步只需操作一次，之后即可正常启动。',
      'Du willst es selbst prüfen? Lad die Datei bei virustotal.com hoch, das ist kostenlos und lässt sie von über 60 Virenscannern ansehen.':
        '想自己验证？可将文件上传到 virustotal.com，该服务免费，会用 60 多款杀毒引擎进行检测。',
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
    },
    ja: {
      'Deine Runden zählen mit.':
        'あなたのラウンドが記録されます。',
      'im Spiel drücken':
        'ゲーム内で押す',
      'Server liest ab':
        'サーバーが読み取る',
      'Auf dem Sprung':
        'あと一歩',
      'Käme mit diesem Schnitt unter die ersten drei.':
        'この平均なら上位 3 位に入ります。',
      'noch {0} Runden':
        'あと {0} 戦',
      'Alle Regeln nachlesen':
        'ルールをすべて読む',
      'mehr':
        '詳細',
      'Selbst nachsehen':
        '自分で確認する',
      'Fingerabdruck wird geladen \u2026':
        'フィンガープリントを読み込み中 …',
      'SHA-256 der Datei:':
        'ファイルの SHA-256:',
      'Bei VirusTotal nachschlagen':
        'VirusTotal で確認する',
      'Findet VirusTotal nichts, hat die Datei noch niemand hochgeladen \u2013 das kannst du selbst tun, kostenlos.':
        'VirusTotal に結果がなければ、まだ誰もアップロードしていないだけです。自分で無料でアップロードできます。',
      'Ausf\u00fchrlich mit Bildern':
        '画像付きの詳しい説明',
      'Zurzeit läuft keine Wertung.':
        '現在進行中のランキングはありません。',
      'Wann eine Runde zählt':
        'ラウンドが記録される条件',
      'Herunterladen und einrichten':
        'ダウンロードと設定',
      'Alle Regeln':
        'すべてのルール →',
      'Regeln':
        'ルール',
      'Programm herunterladen':
        'クライアントをダウンロード',
      'Warum warnt mein Browser?':
        'ブラウザが警告するのはなぜ？',
      'Fassung {0}':
        'バージョン {0}',
      'vom {0}': '{0} 作成',
      'Neue Fassung {0} – du hast {1}': '新バージョン {0} – お使いのバージョンは {1}',
      'ohne Installation': 'インストール不要',
      'Hol dir zuerst das Programm – der Knopf steht oben.':
        'まずクライアントを入手してください。ボタンは上にあります。',
      'in der Rangliste':
        'ランキングに',
      'Fragen oder Probleme? Melde dich im Discord bei einem':
        '質問や問題がありますか？Discord で',
      'Admin oder Mod':
        '管理者またはモデレーター',
      'Discord öffnen':
        'Discord を開く',
      'Ein Tastendruck nach der Runde, den Rest macht der Server. Kein Abtippen, keine Screenshots im Chat.':
        'ラウンド後にキーを 1 回押すだけ。あとはサーバーが処理します。手入力もチャットへの画像投稿も不要です。',
      'In drei Schritten dabei':
        '3 ステップで参加',
      'Programm herunterladen':
        'クライアントをダウンロード',
      'Eine einzige Datei, 32 KB, keine Installation. Sie nimmt auf Tastendruck deinen Bildschirm auf und schickt das Bild hierher.':
        'ファイル 1 つ、32 KB、インストール不要。キーを押すと画面を撮影し、その画像をここに送ります。',
      'Mit Steam anmelden':
        'Steam でログイン',
      'Du spielst Meccha ohnehin über Steam – ein Klick, fertig. Kein Passwort, keine Mailadresse, keine Anmeldung bei uns.':
        'Meccha はどのみち Steam で遊びます。クリック 1 回で完了です。パスワードもメールアドレスも、こちらでの登録も不要です。',
      'Namen eintragen und Token einfügen':
        '名前を登録してトークンを貼り付け',
      'Trag ein, wie du in der Rangliste im Spiel stehst, kopier den Token ins Programm – fertig. Ab dann reicht F9.':
        'ゲーム内ランキングでの表示名を登録し、トークンをクライアントに貼り付けるだけ。あとは F9 で十分です。',
      'Los geht es':
        'はじめかた',
      'REGEL':
        'ルール',
      'Eine Runde zählt nur, wenn mindestens {0} Verstecker im Scoreboard stehen.':
        'スコアボードに隠れる側が {0} 人以上いる場合にのみ記録されます。',
      '⚠  Windows warnt vor der Datei? Das ist normal – hier steht warum.':
        '⚠  Windows がファイルを警告しますか？よくあることです – 理由はこちら。',
      'Das Programm ist nicht digital signiert. Windows und der Browser können deshalb nicht nachsehen, wer es gebaut hat, und warnen vorsichtshalber. Das ist keine Aussage darüber, ob etwas schädlich ist – nur darüber, dass ein Nachweis fehlt.':
        'このクライアントにはデジタル署名がありません。そのため Windows やブラウザは作成者を確認できず、念のため警告します。危険かどうかを示すものではなく、証明がないというだけです。',
      'Eine solche Signatur muss man jährlich kaufen. Für ein kostenloses Zuschauer-Werkzeug lohnt sich das nicht, deshalb bleibt die Warnung.':
        '署名は毎年購入する必要があります。無料の視聴者向けツールには見合わないため、警告はそのままです。',
      'Beim Herunterladen':
        'ダウンロードするとき',
      'Der Browser meldet „Verdächtiger Download blockiert" oder „wird selten heruntergeladen". Wähle im Download-Menü „Beibehalten" – mehr ist es nicht.':
        'ブラウザが「不審なダウンロードをブロックしました」または「ダウンロード数が少ない」と表示します。ダウンロードメニューで「保存」を選んでください。それだけです。',
      'Beim ersten Start':
        '初回起動のとき',
      'Es erscheint ein blaues Fenster: „Der Computer wurde durch Windows geschützt". Klick auf „Weitere Informationen" und dann auf „Trotzdem ausführen". Das musst du nur einmal machen – danach startet es normal.':
        '青い画面が表示されます:「WindowsによってPCが保護されました」。「詳細情報」をクリックし、「実行」を選んでください。これは初回だけで、以降は普通に起動します。',
      'Du willst es selbst prüfen? Lad die Datei bei virustotal.com hoch, das ist kostenlos und lässt sie von über 60 Virenscannern ansehen.':
        '自分で確認したいですか？virustotal.com にファイルをアップロードすれば、60 以上のウイルス対策ソフトが無料で検査します。',
      'Windows meldet „Der Computer wurde geschützt"? Auf „Weitere Informationen" klicken, dann „Trotzdem ausführen". Das ist bei unsignierten Programmen normal.':
        '「WindowsによってPCが保護されました」と出たら、「詳細情報」→「実行」を選んでください。署名のないプログラムではよくあることです。',
      'und dann':
        'そのあと',
      'Danach siehst du hier deinen Token und kannst jederzeit nachsehen, was aus deinen eingeschickten Runden geworden ist.':
        'その後はここでトークンを確認でき、送信したラウンドがどうなったかもいつでも見られます。',
      'Angemeldet als {0}':
        '{0} としてログイン中',
      'Dein Zugang ist gesperrt':
        'あなたのアクセスは停止されています',
      ' – {0}. Melde dich im Discord bei einem Admin oder Mod.':
        ' – {0}。Discord で管理者またはモデレーターに連絡してください。',
      'ohne Angabe':
        '理由なし',
      'Dein Name im Spiel':
        'ゲーム内の名前',
      'Genau so, wie er in der Rangliste steht. Danach wird nur diese eine Zeile aus deinem Screenshot gewertet.':
        'ランキングに表示されているとおりに入力してください。以降はスクリーンショットのその行だけが記録されます。',
      'dein Name in der Rangliste':
        'ランキングでのあなたの名前',
      'Ändern':
        '変更',
      'Speichern':
        '保存',
      'Der Name lässt sich erst in {0} Tag(en) wieder ändern. Brauchst du es früher, melde dich im Discord bei einem Admin oder Mod.':
        '名前はあと {0} 日は変更できません。それより早く必要な場合は、Discord で管理者またはモデレーターに連絡してください。',
      'Gespeichert.':
        '保存しました。',
      'Dein Token':
        'あなたのトークン',
      'Trag zuerst deinen Namen im Spiel ein – ohne den gibt es keinen Token.':
        '先にゲーム内の名前を登録してください。それがないとトークンは発行されません。',
      'Noch kein Token vorhanden.':
        'まだトークンがありません。',
      'Der Token ist persönlich – mit ihm zählt jede Runde auf dein Konto. Gib ihn nicht weiter und zeig ihn nicht im Stream.':
        'トークンは個人用です。これによってすべてのラウンドがあなたのアカウントに記録されます。他人に渡したり、配信に映したりしないでください。',
      'Kopieren':
        'コピー',
      'Kopiert. Im Programm unter „Token" einfügen.':
        'コピーしました。クライアントの「トークン」欄に貼り付けてください。',
      'Markiere den Text und kopiere ihn mit Strg+C.':
        'テキストを選択し、Ctrl+C でコピーしてください。',
      'Neuen erzeugen':
        '新しく発行',
      'Neuen Token erzeugen?':
        '新しいトークンを発行しますか？',
      'Der alte Token wird dabei ungültig – trag den neuen danach im Programm ein, sonst kommt nichts mehr an.':
        '古いトークンは無効になります。新しいものをクライアントに入力しないと、何も届かなくなります。',
      'Neuer Token erzeugt – im Programm eintragen.':
        '新しいトークンを発行しました。クライアントに入力してください。',
      'Runden werden geprüft':
        'ラウンドの確認',
      'ja – der Streamer gibt sie frei':
        'あり – 配信者が承認します',
      'nein – zählen sofort':
        'なし – すぐに記録されます',
      'Dein Anzeigename':
        '表示名',
      'Nur zur Anzeige – hat nichts damit zu tun, welche Zeile gewertet wird.':
        '表示専用です。どの行が記録されるかとは関係ありません。',
      'Abmelden':
        'ログアウト',
      'Konto löschen':
        'アカウントを削除',
      'Dein Zugang gilt danach nicht mehr, und du verschwindest aus der Zuschauerliste. Deine bereits gewerteten Runden bleiben in der Punkteliste – sie gehören zum Turnier. Meldest du dich später wieder über Steam an, ist dein Konto zurück.':
        'アクセスは無効になり、視聴者一覧からも消えます。すでに記録されたラウンドはランキングに残ります。あとで再び Steam でログインすれば、アカウントは元に戻ります。',
      'Konto löschen?':
        'アカウントを削除しますか？',
      'Dein Token gilt danach nicht mehr. Gewertete Runden bleiben in der Punkteliste. Meldest du dich wieder über Steam an, ist dein Konto zurück.':
        'トークンは無効になります。記録済みのラウンドはランキングに残ります。再び Steam でログインすれば、アカウントは元に戻ります。',
      'Löschen':
        '削除',
      'Konto gelöscht. Du kannst dich jederzeit wieder anmelden.':
        'アカウントを削除しました。いつでも再登録できます。',
      'Hat nicht geklappt.':
        'うまくいきませんでした。',
      'Verwaltung':
        '管理',
      'Du bist Admin: Runden freigeben, Zugänge und Rollen verwalten.':
        'あなたは管理者です: ラウンドの承認、アクセスと権限の管理ができます。',
      'Du bist Mod: Runden freigeben und ablehnen.':
        'あなたはモデレーターです: ラウンドの承認と却下ができます。',
      'Zum Dashboard':
        'ダッシュボードへ',
      'Programm':
        'クライアント',
      'Immer die aktuelle Fassung. Meldet dein Programm „veraltet", hol sie dir hier neu.':
        '常に最新版です。クライアントが「古い」と表示したら、ここで取得し直してください。',
      'Deine letzten Runden':
        '最近のラウンド',
      'Du bist Anwärter: {0} von {1} gewerteten Runden. Noch {2}, dann stehst du in der Wertung.':
        '現在は候補者です: {1} 戦中 {0} 戦。あと {2} 戦でランキングに入ります。',
      'Du stehst in der Wertung – gerechnet wird der Schnitt deiner letzten {0} Runden.':
        'ランキングに入っています。直近 {0} 戦の平均で計算されます。',
      'Noch nichts eingeschickt.':
        'まだ何も送信されていません。',
      'gewertet':
        '記録済み',
      'abgelehnt':
        '却下',
      'wartet auf Prüfung':
        '確認待ち',
      'Rangliste':
        'ランキング',
      'Dein Zugang':
        'アクセス情報',
      'Schnitt der letzten {0}':
        '直近 {0} 戦の平均',
      'Noch keine Runden gewertet. Sei der Erste – unter „Dein Zugang" steht, wie es geht.':
        'まだ記録されたラウンドはありません。最初の 1 人になりましょう。方法は「アクセス情報」にあります。',
      'Spieler':
        'プレイヤー',
      'Schnitt':
        '平均',
      '{0} Runden':
        '{0} 戦',
      '{0} von {1}':
        '{1} 戦中 {0} 戦',
      'Grau: noch Anwärter – ab {0} gewerteten Runden zählt der Schnitt.':
        'グレー: まだ候補者です。{0} 戦から平均が有効になります。',
      'gerade eben':
        'たった今',
      'vor {0} min':
        '{0} 分前',
      'vor {0} h':
        '{0} 時間前',
      'vor {0} Tagen':
        '{0} 日前',
      'Abbrechen':
        'キャンセル',
      'Übernehmen':
        '適用',
      'Fehler beim Laden.':
        '読み込みに失敗しました。',
      'Server nicht erreichbar.':
        'サーバーに接続できません。'
    }
  };

  var sprache = (function () {
    try {
      var gemerkt = localStorage.getItem('mc_sprache');
      if (gemerkt && (gemerkt === 'de' || gemerkt === 'en' ||
                      gemerkt === 'zh' || gemerkt === 'ja')) return gemerkt;

      /* Noch nichts gewaehlt: aus der Browsersprache raten. Englisch
         bleibt die Vorgabe - die Zuschauer kommen aus dem Stream. */
      var kurz = (navigator.language || '').slice(0, 2);
      if (kurz === 'ja' || kurz === 'zh' || kurz === 'de') return kurz;
    } catch (e) { /* privater Modus */ }
    return 'en';
  })();

  /* Die Mindestzahl Verstecker. Vorbelegt mit 6, damit der Streifen auch
     dann etwas Sinnvolles zeigt, wenn /api/status noch nicht geantwortet
     hat - der echte Wert kommt vom Server und ueberschreibt sie. */
  var minSpieler = 6;

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
    /* data-tp: derselbe Weg, aber mit {0} fuer die Mindestzahl. Sie steht
       in minSpieler und wird bei jedem Sprachwechsel neu eingesetzt. */
    Array.prototype.forEach.call(document.querySelectorAll('[data-tp]'), function (e) {
      e.textContent = tv(e.getAttribute('data-tp'), [minSpieler]);
    });
    Array.prototype.forEach.call(
      document.querySelectorAll('#sprachen button'), function (b) {
        b.className = b.getAttribute('data-sprache') === sprache ? 'aktiv' : '';
      });
    /* Die Zeile unter dem Download-Knopf wird von Hand gesetzt und traegt
       kein data-t - ohne das bliebe sie beim Sprachwechsel stehen. Der
       Stand ist gemerkt, das kostet keinen neuen Abruf. */
    if (typeof zeigeClientKnopf === 'function') zeigeClientKnopf();
  }


  function el(tag, klasse, text) {
    var e = document.createElement(tag);
    if (klasse) e.className = klasse;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /* Der Kasten zu den Windows-Warnungen.

     Zwei verschiedene Warnungen treffen den Zuschauer nacheinander: der
     Browser beim Laden, SmartScreen beim ersten Start. Beide sehen aus,
     als waere etwas faul, und beide haben denselben harmlosen Grund -
     das Programm ist nicht signiert. Ohne Erklaerung bricht genau hier
     ein Teil der Leute ab und meldet sich nie wieder.

     Aufklappbar statt dauerhaft offen: wer die Warnung nicht bekommt,
     soll keine halbe Seite Text daruebersehen muessen. Wer sie bekommt,
     findet die Antwort an der Stelle, an der er gerade steht. */
  /* ------------------------------------------- welche Fassung es gibt

     Was der Server gerade ausliefert: Groesse, Fassungsnummer, Baudatum
     und Pruefsumme. Zweimal gebraucht - unter dem Knopf im Kopf und im
     Kasten "Selbst nachsehen" - deshalb einmal geholt und gemerkt.

     Vorher hing der Abruf im Warnkasten, und der wird nur auf der
     ABGEMELDETEN Seite gebaut. Wer angemeldet war, sah unter dem Knopf
     also ewig "ohne Installation" und nie eine Nummer. */
  var clientInfo = null;
  var clientWartet = [];

  function mitClientinfo(fertig) {
    if (clientInfo) { fertig(clientInfo); return; }
    clientWartet.push(fertig);
    if (clientWartet.length > 1) return; // Abruf laeuft schon

    var loese = function (c) {
      clientInfo = c;
      var warten = clientWartet;
      clientWartet = [];
      for (var i = 0; i < warten.length; i++) warten[i](c);
    };

    fetch('/api/client').then(function (r) { return r.json(); }).then(function (c) {
      loese(c && c.ok ? c : { ok: false });
    }).catch(function () { loese({ ok: false }); });
  }

  /** Tag.Monat.Jahr - die Uhrzeit hilft hier niemandem. */
  function datumKurz(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var zwei = function (n) { return (n < 10 ? '0' : '') + n; };
    return zwei(d.getDate()) + '.' + zwei(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  /**
   * Beschriftet den Download-Knopf im Kopf.
   *
   * Zwei Faelle. Wer noch nie gesendet hat, sieht schlicht, was
   * bereitliegt. Wer schon gesendet hat, dessen Fassung kennt der
   * Server - dann steht hier nicht nur, was es GIBT, sondern ob es
   * neuer ist als das, was er HAT. Das ist der Unterschied zwischen
   * einer Angabe und einer Auskunft.
   */
  function zeigeClientKnopf() {
    mitClientinfo(function (c) {
      var daten = $('holen-daten');
      var knopf = $('holen-knopf');
      if (!daten) return;

      if (!c.ok) { daten.textContent = t('ohne Installation'); return; }

      var meine = stand && stand.clientVersion;
      var veraltet = !!(meine && c.version && meine !== c.version);
      if (knopf) knopf.className = veraltet ? 'holen neu' : 'holen';

      if (veraltet) {
        daten.textContent = tv('Neue Fassung {0} – du hast {1}', [c.version, meine]);
        return;
      }

      var teile = [Math.round(c.groesse / 1024) + ' KB'];
      if (c.version) teile.push(tv('Fassung {0}', [c.version]));
      if (c.gebaut) teile.push(tv('vom {0}', [datumKurz(c.gebaut)]));
      daten.textContent = teile.join('  ·  ');
    });
  }

  function warnungsKasten() {
    var d = document.createElement('details');
    d.className = 'warnkasten';

    var z = document.createElement('summary');
    z.textContent = t('⚠  Windows warnt vor der Datei? Das ist normal – hier steht warum.');
    d.appendChild(z);

    d.appendChild(el('p', null, t(
      'Das Programm ist nicht digital signiert. Windows und der Browser können ' +
      'deshalb nicht nachsehen, wer es gebaut hat, und warnen vorsichtshalber. ' +
      'Das ist keine Aussage darüber, ob etwas schädlich ist – nur darüber, dass ' +
      'ein Nachweis fehlt.')));

    d.appendChild(el('p', null, t(
      'Eine solche Signatur muss man jährlich kaufen. Für ein kostenloses ' +
      'Zuschauer-Werkzeug lohnt sich das nicht, deshalb bleibt die Warnung.')));

    d.appendChild(el('h3', null, t('Beim Herunterladen')));
    d.appendChild(el('p', null, t(
      'Der Browser meldet „Verdächtiger Download blockiert" oder „wird selten ' +
      'heruntergeladen". Wähle im Download-Menü „Beibehalten" – mehr ist es nicht.')));

    d.appendChild(el('h3', null, t('Beim ersten Start')));
    d.appendChild(el('p', null, t(
      'Es erscheint ein blaues Fenster: „Der Computer wurde durch Windows ' +
      'geschützt". Klick auf „Weitere Informationen" und dann auf „Trotzdem ' +
      'ausführen". Das musst du nur einmal machen – danach startet es normal.')));

    /* Die Pruefsumme ist das Stueck, das aus "glaub mir" ein "sieh
       selbst nach" macht. Sie kommt vom Server (/api/client) und wird
       dort aus der ausgelieferten Datei berechnet - eine fest
       hinterlegte waere nach dem naechsten Bauen falsch, und eine
       falsche Pruefsumme ist schlimmer als keine: sie laesst die echte
       Datei manipuliert aussehen. */
    d.appendChild(el('h3', null, t('Selbst nachsehen')));

    var pruef = el('p', 'leise', t('Fingerabdruck wird geladen …'));
    d.appendChild(pruef);

    mitClientinfo(function (c) {
      if (!c.ok) { pruef.remove(); return; }
      pruef.innerHTML = '';

      pruef.appendChild(el('span', null, t('SHA-256 der Datei:')));
      var code = el('code', 'summe', c.sha256);
      pruef.appendChild(code);

      var vt = document.createElement('a');
      vt.href = 'https://www.virustotal.com/gui/file/' + c.sha256;
      vt.target = '_blank';
      vt.rel = 'noopener nofollow';
      vt.textContent = t('Bei VirusTotal nachschlagen');
      pruef.appendChild(vt);

      pruef.appendChild(el('span', 'leise', ' ' + t(
        'Findet VirusTotal nichts, hat die Datei noch niemand hochgeladen – ' +
        'das kannst du selbst tun, kostenlos.')));
    });

    var mehr = document.createElement('p');
    var a = document.createElement('a');
    a.href = '/download';
    a.textContent = t('Ausführlich mit Bildern');
    mehr.appendChild(a);
    d.appendChild(mehr);

    return d;
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

    /* Der Download-Knopf steht oben im Kopf und ist von hier aus zu
       sehen - ihn hier zu wiederholen waere kein zweiter Weg, sondern
       die Frage, welcher der richtige ist. Also nur der Verweis. */
    kd.appendChild(el('p', null, t(
        'Hol dir zuerst das Programm – der Knopf steht oben.')));

    kd.appendChild(warnungsKasten());

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

    /* Hier stand bis zum 20.08.2026 noch einmal der Download samt
       Warnungskasten. Beides gibt es jetzt oben im Kopf - dort steht es
       immer sichtbar, statt unter einer Rangliste zu verschwinden, die
       mit jedem Spieler laenger wird. Zweimal derselbe Knopf auf einer
       Seite ist keine Hilfe, sondern eine Frage, welcher der richtige
       ist. */
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

  /* Welche Listen es gibt und welche gerade gezeigt wird. Als Zustand
     nebenan, damit der Umschalter nur den Inhalt neu zeichnet und nicht
     die ganze Seite - sonst spraenge man beim Klicken nach oben. */
  var ranglisten = [];
  var ranglistenKopf = { fenster: 10, voll: 10 };
  var gewaehlteListe = 0;

  /* Welche Liste angesehen wird - als KENNUNG, nicht als Position.

     Beim Aktualisieren kommen die Listen neu vom Server, und ihre
     Reihenfolge haengt am Anlagedatum und daran, welche aktiv sind.
     Merkte man sich die Position, saehe man nach fuenfzehn Sekunden
     ploetzlich eine andere Liste - ohne etwas geklickt zu haben. */
  var gewaehlteKennung = null;

  /* Der Kasten, in dem die gewaehlte Liste steht.
     Als Variable und nicht ueber eine id: er entsteht erst beim Laden,
     und ein Zugriff per id auf ein Element, das im HTML gar nicht steht,
     waere genau die Art Fehler, die erst im Browser des Zuschauers
     auffaellt - als leere Seite ohne Meldung. */
  var rangInhalt = null;

  function baueUmschalter() {
    var leiste = el('div', 'umschalter');
    ranglisten.forEach(function (l, i) {
      var b = document.createElement('button');
      b.textContent = l.name;
      b.className = i === gewaehlteListe ? 'aktiv' : '';
      b.addEventListener('click', function () {
        gewaehlteListe = i;
        gewaehlteKennung = l.id;
        Array.prototype.forEach.call(leiste.children, function (x, j) {
          x.className = j === i ? 'aktiv' : '';
        });
        zeigeRangliste(i);
      });
      leiste.appendChild(b);
    });
    return leiste;
  }

  function zeigeRangliste(i) {
    if (!rangInhalt || !ranglisten[i]) return;
    gewaehlteKennung = ranglisten[i].id;
    rangInhalt.innerHTML = '';
    rangInhalt.appendChild(baueRangliste(ranglisten[i], ranglistenKopf));
  }

  function baueRangliste(d, kopfDaten) {
    var k = el('div', 'karte');

    var kopf = el('div', 'rang-titel');
    kopf.appendChild(el('h2', null, d.name || t('Rangliste')));
    kopf.style.margin = '0 0 12px';
    kopf.appendChild(el('span', 'leise',
      tv('Schnitt der letzten {0}', [kopfDaten.fenster])));
    k.appendChild(kopf);

    if (!d.gewertet.length && !d.anwaerter.length) {
      k.appendChild(el('p', 'leise', t(
        'Noch keine Runden gewertet. Sei der Erste – unter „Dein Zugang" steht, wie es geht.')));
      return k;
    }

    /* AUF DEM SPRUNG - ganz oben, vor der Tabelle.

       Wer noch Anwärter ist, steht ganz unten: hinter allen Gewerteten,
       auch wenn er besser spielt als sie alle. Für die Wertung ist das
       richtig — verglichen wird nur über zehn Runden. Für die Motivation
       ist es genau verkehrt: der Beste der Neuen sieht sich am Ende einer
       Liste, in der er eigentlich vorne stünde, und hat keinen Grund
       weiterzumachen.

       Wer hier auftaucht, entscheidet der Server (rangliste.ts): ab fünf
       Einträgen, und nur wenn der Schnitt für die ersten drei reichen
       würde. */
    var sprung = d.aufDemSprung || [];
    if (sprung.length) {
      var kasten = el('div', 'sprung');
      kasten.appendChild(el('div', 'sprung-titel', t('Auf dem Sprung')));

      sprung.forEach(function (z) {
        var zeile = el('div', 'sprung-zeile');
        zeile.appendChild(el('span', 'wer', z.name));
        zeile.appendChild(el('span', 'schnitt', zahl(z.schnitt)));
        zeile.appendChild(el('span', 'leise',
          tv('noch {0} Runden', [Math.max(0, kopfDaten.voll - z.imFenster)])));
        kasten.appendChild(zeile);
      });

      kasten.appendChild(el('div', 'leise',
        t('Käme mit diesem Schnitt unter die ersten drei.')));
      k.appendChild(kasten);
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
        tr.appendChild(el('td', 'aus', tv('{0} von {1}', [z.imFenster, kopfDaten.voll])));
        an.appendChild(tr);
      });
      tab.appendChild(an);
    }

    k.appendChild(tab);

    if (d.anwaerter.length) {
      k.appendChild(el('p', 'leise', tv(
        'Grau: noch Anwärter – ab {0} gewerteten Runden zählt der Schnitt.', [kopfDaten.voll])));
    }
    return k;
  }

  function ladeRangliste() {
    fetch('/api/rangliste').then(function (r) { return r.json(); }).then(function (d) {
      var ziel = $('rangliste');
      ziel.innerHTML = '';
      if (!d || !d.ok) return;

      /* Seit es mehrere Ranglisten geben kann, liefert der Server sie
         alle - aber nur die AKTIVEN. Eine abgeschlossene Saison gehoert
         ins Dashboard, nicht auf die Startseite. */
      ranglisten = d.listen || [];
      ranglistenKopf = { fenster: d.fenster, voll: d.voll };

      /* Die zuvor angesehene Liste wiederfinden. Gibt es sie nicht mehr -
         abgeschaltet etwa -, faellt es auf die erste zurueck. */
      gewaehlteListe = 0;
      if (gewaehlteKennung) {
        for (var gi = 0; gi < ranglisten.length; gi++) {
          if (ranglisten[gi].id === gewaehlteKennung) { gewaehlteListe = gi; break; }
        }
      }

      if (ranglisten.length === 0) {
        ziel.appendChild(el('p', 'leise', t('Zurzeit läuft keine Wertung.')));
        return;
      }

      /* Bei genau einer Liste keinen Umschalter zeigen. Eine einzelne
         Schaltflaeche, die nichts umschaltet, ist nur eine Frage, die
         sich niemand stellt. */
      if (ranglisten.length > 1) ziel.appendChild(baueUmschalter());

      rangInhalt = el('div');
      ziel.appendChild(rangInhalt);
      zeigeRangliste(gewaehlteListe);
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

    /* Die echte Mindestzahl vom Server holen und den Regelstreifen damit
       neu beschriften. Klappt es nicht, bleibt die vorbelegte 6 stehen -
       besser eine plausible Zahl als eine leere Luecke. */
    fetch('/api/status').then(function (r) { return r.json(); }).then(function (s) {
      if (s && typeof s.minSpieler === 'number') {
        minSpieler = s.minSpieler;
        zeichneSprache();
      }
    }).catch(function () { /* Regel bleibt bei 6 */ });

    ladeRangliste();

    /* Sofort, ohne auf das Konto zu warten - die Angaben unter dem Knopf
       gelten auch fuer Abgemeldete. Sobald das Konto da ist, wird neu
       beschriftet: dann steht die eigene Fassung zum Vergleich bereit. */
    zeigeClientKnopf();

    fetch('/api/konto').then(function (r) { return r.json(); }).then(function (a) {
      if (!a.ok) { $('untertitel').textContent = t('Fehler beim Laden.'); return; }
      if (!a.angemeldet) { baueAnmeldung(); return; }
      stand = a.konto;
      letzteRunden = a.runden || [];
      wertung = a.wertung || { gewertet: 0, voll: 10 };
      baueKonto(stand);
      zeigeClientKnopf();
    }).catch(function (e) {
      $('untertitel').textContent = t('Server nicht erreichbar.');
    });
  }

  /* ------------------------------------------------- von selbst frisch

     Die Rangliste ist der Grund, warum jemand die Seite offen HAELT -
     waehrend des Streams liegt sie auf dem zweiten Bildschirm. Ohne
     diesen Takt stand dort der Stand von vor einer Stunde, und wer
     gerade eine Runde eingeschickt hat, haette neu laden muessen, um
     sie zu sehen.

     Fuenfzehn Sekunden, wie im Dashboard. Ein WebSocket waere hier mehr
     Aufwand als Gewinn: die Rangliste aendert sich im Minutentakt, nicht
     im Sekundentakt, und eine offene Verbindung durch nginx will
     zusaetzlich eingerichtet sein.

     ZWEI DINGE, DIE DABEI NICHT PASSIEREN DUERFEN:

       Der Umschalter darf nicht zurueckspringen. Deshalb merkt sich die
       Seite die KENNUNG der angesehenen Liste, nicht ihre Position.

       Bei geschlossenem Reiter wird nicht geladen. Wer die Seite in
       einem Hintergrundtab vergisst, soll den Server nicht stundenlang
       befragen.
  */
  var TAKT_MS = 15000;

  setInterval(function () {
    if (document.hidden) return;
    ladeRangliste();
  }, TAKT_MS);

  /* Beim Zurueckkehren sofort nachsehen, statt bis zum naechsten Takt zu
     warten - wer den Tab wieder aufmacht, will den aktuellen Stand und
     nicht den von vorhin. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) ladeRangliste();
  });

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

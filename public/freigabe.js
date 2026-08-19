/* =========================================================================
   VERWALTUNG - Freigabe, Status und Zugaenge.

   Klassisches Script ohne Modul und ohne Framework - wie die Overlays im
   Turnier-Projekt. Laeuft damit ohne Bauschritt.

   Der Admin-Schluessel kommt aus der URL (?key=...) und wird an jede
   Anfrage weitergereicht, wie beim Turnier-Admin auch.
   ========================================================================= */

(function () {
  'use strict';

  var schluessel = new URLSearchParams(location.search).get('key') || '';

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
    melde.t = setTimeout(function () { m.style.display = 'none'; }, dauer || 4000);
  }

  function zeit(ms) {
    if (!ms) return '–';
    return new Date(ms).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  function anfrage(pfad, optionen) {
    var trenner = pfad.indexOf('?') >= 0 ? '&' : '?';
    return fetch(pfad + trenner + 'key=' + encodeURIComponent(schluessel), optionen)
      .then(function (r) {
        return r.json().then(function (j) { return { code: r.status, body: j }; });
      });
  }

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

  /* ------------------------------------------------------------ Reiter

     Eine Seite mit fuenf Abschnitten untereinander wurde zu lang: die
     Freigabe stand oben, alles andere weit darunter. Die Statuskacheln
     bleiben ueber den Reitern stehen - sie gelten fuer alles.
  */

  function reiterEinrichten() {
    var leiste = $('reiter');
    leiste.addEventListener('click', function (e) {
      var knopf = e.target.closest('button');
      if (!knopf) return;
      zeigeTafel(knopf.getAttribute('data-tafel'));
    });
  }

  function zeigeTafel(id) {
    var knoepfe = $('reiter').getElementsByTagName('button');
    Array.prototype.forEach.call(knoepfe, function (b) {
      b.className = b.getAttribute('data-tafel') === id ? 'aktiv' : '';
    });
    var tafeln = document.getElementsByClassName('tafel');
    Array.prototype.forEach.call(tafeln, function (t) {
      t.className = t.id === id ? 'tafel aktiv' : 'tafel';
    });
    // In der Adresse merken, damit ein Neuladen nicht zurueckspringt.
    try {
      var u = new URL(location.href);
      u.searchParams.set('tafel', id);
      history.replaceState(null, '', u.toString());
    } catch (e) { /* egal */ }
  }

  /* ------------------------------------------------------------ Status */

  /** "vor 3 min" statt eines Zeitstempels - kürzer und sofort verständlich. */
  function alter(zeit) {
    if (!zeit) return 'nie';
    var min = Math.round((Date.now() - zeit) / 60000);
    if (min < 1) return 'gerade eben';
    if (min < 60) return 'vor ' + min + ' min';
    var std = Math.round(min / 60);
    if (std < 48) return 'vor ' + std + ' h';
    return 'vor ' + Math.round(std / 24) + ' Tagen';
  }

  function kachel(wert, bez, warnung) {
    var k = el('div', 'kachel' + (warnung ? ' warnung' : ''));
    k.appendChild(el('div', 'wert', wert));
    k.appendChild(el('div', 'bez', bez));
    // Die Beschriftung ist auf zwei Zeilen gekappt - hier steht sie ganz.
    k.title = wert + ' – ' + bez;
    return k;
  }

  function ladeStatus() {
    anfrage('/api/uebersicht').then(function (a) {
      var ziel = $('status');
      ziel.innerHTML = '';
      if (!a.body.ok) {
        ziel.appendChild(kachel('gesperrt', a.body.fehler, true));
        return;
      }
      var t = a.body.turnier;

      /* Der Turnier-Status zuerst und notfalls rot: dass der Server nicht
         erreichbar ist, war beim Testen die haeufigste Ursache dafuer,
         dass scheinbar nichts passiert. */
      ziel.appendChild(t.erreichbar
        ? kachel(t.spiel, 'Turnier erreichbar')
        : kachel('nicht erreichbar', t.fehler || 'Turnier-Server', true));

      /* Ist turnier weg, arbeitet der Server mit der zuletzt gespiegelten
         Kartei weiter. Das muss dastehen - sonst sieht die Zuordnung aus
         wie immer, obwohl sie auf einem alten Stand beruht und ein neu
         angelegter Spieler darin fehlt. */
      if (t.ausSpiegel) {
        ziel.appendChild(kachel(alter(t.gespiegeltAm), 'Kartei gespiegelt', true));
      }

      ziel.appendChild(kachel(String(t.eintraege), 'Einträge in der Liste'));
      ziel.appendChild(kachel(String(t.kartei), 'Personen in der Kartei'));

      /* Was noch auf turnier wartet. Anklickbar, damit man nicht auf den
         Minutentakt warten muss, wenn turnier gerade zurückkommt. */
      var n = a.body.nachtrag || { wartend: 0 };
      if (n.wartend > 0) {
        var k = kachel(String(n.wartend), 'warten auf Eintrag – klicken', true);
        k.style.cursor = 'pointer';
        k.title = n.letzterFehler || '';
        k.addEventListener('click', function () {
          anfrage('/api/nachtrag-jetzt', { method: 'POST' }).then(function (b) {
            melde(b.body.erledigt > 0
              ? b.body.erledigt + ' nachgetragen, ' + b.body.offen + ' noch offen'
              : 'Geht noch nicht: ' + (b.body.fehler || 'unbekannt'), 8000);
            ladeStatus();
          });
        });
        ziel.appendChild(k);
      }
      /* Der Zaehler im Reiter, damit man offene Runden auch dann sieht,
         wenn gerade ein anderer Reiter offen ist. */
      var offenZahl = $('r-offen');
      offenZahl.textContent = String(a.body.freigabe.offen);
      offenZahl.className = a.body.freigabe.offen > 0 ? 'zahl warn' : 'zahl';

      ziel.appendChild(kachel(String(a.body.freigabe.offen), 'offen',
        a.body.freigabe.offen > 0));
      ziel.appendChild(kachel(String(a.body.freigabe.freigegeben), 'freigegeben'));
      ziel.appendChild(kachel(String(a.body.tokens), 'Zugänge'));

      var l = kachel(a.body.leser.split(' ')[0], 'Leser');
      l.title = a.body.leser;
      ziel.appendChild(l);

      zeigeLetzte(t);
    }).catch(function (e) {
      $('status').textContent = 'Server nicht erreichbar: ' + e.message;
    });
  }

  /**
   * Was tatsächlich in der Punkteliste steht.
   *
   * Die Gegenprobe zu „freigegeben": zwischen deinem Klick und der Zeile
   * dort liegt der Turnier-Server, und wenn der gerade weg ist, wartet
   * der Eintrag nur. Hier siehst du, was wirklich angekommen ist, ohne
   * ins Turnier-Admin wechseln zu müssen.
   */
  function zeigeLetzte(t) {
    var koerper = $('letzte').tBodies[0];
    var eintraege = t.letzte || [];
    koerper.innerHTML = '';

    $('letzte-leer').style.display = eintraege.length ? 'none' : 'block';
    $('letzte-zaehler').textContent = eintraege.length
      ? (t.ausSpiegel ? 'Stand vom letzten Kontakt – turnier ist gerade weg' : t.spiel)
      : '';

    eintraege.forEach(function (e) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', null, e.name));
      tr.appendChild(el('td', 'p', String(e.punkte)));
      tr.appendChild(el('td', 'zeit', zeit(e.zeit)));
      koerper.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------ Runden */

  function baueZeilen(zeilen) {
    var t = el('table');
    zeilen.forEach(function (z) {
      var tr = document.createElement('tr');
      if (z.punkte === null) tr.className = 'unlesbar';
      else if (z.unsicher) tr.className = 'unsicher';

      tr.appendChild(el('td', null, z.rohName));
      var p = el('td', 'p', z.punkte === null ? 'nicht lesbar' : z.rohPunkte);
      tr.appendChild(p);
      t.appendChild(tr);
    });
    return t;
  }

  /**
   * Der Verdachtsblock - roter als die uebrigen Hinweise.
   *
   * Getrennt vom gelben Warnblock, weil er etwas anderes bedeutet: die
   * gelben Hinweise sagen "sieh genau hin", dieser sagt "diese Runde
   * waere sonst durchgelaufen und wurde deshalb angehalten".
   */
  function baueVerdacht(r) {
    var gruende = (r.verdacht || []).slice();
    if (r.vorgeschichte) gruende.push(r.vorgeschichte);
    if (!gruende.length) return null;

    var d = el('div', 'verdacht');
    d.appendChild(el('b', null, '⚑ Geflaggt – zur Prüfung angehalten'));
    var ul = el('ul');
    gruende.forEach(function (g) { ul.appendChild(el('li', null, g)); });
    d.appendChild(ul);
    return d;
  }

  function baueWarnung(r) {
    var gruende = (r.bildAuffaellig || []).slice();
    if (r.inhaltsgleich > 0) {
      gruende.push('Es gibt ' + r.inhaltsgleich + ' weitere Runde(n) mit denselben Zeilen');
    }
    if (!gruende.length) return null;

    var d = el('div', 'warnung');
    /* Ausdruecklich sagen, dass Hinsehen nicht reicht: eine bearbeitete
       Zahl ist im Bild nicht zu erkennen - beim Test war die Faelschung
       optisch perfekt. */
    d.appendChild(el('b', null, 'Bitte genau prüfen (im Bild ist das NICHT zu sehen)'));
    var ul = el('ul');
    gruende.forEach(function (g) { ul.appendChild(el('li', null, g)); });
    d.appendChild(ul);
    return d;
  }

  /**
   * Was diese Person zuletzt eingereicht hat - direkt unter den Zeilen.
   *
   * Die Frage beim Entscheiden ist selten „ist das Bild echt", sondern
   * „passt diese Zahl zu dem, was der sonst spielt". Dafür musste man
   * bisher die Historie durchsuchen.
   */
  function baueVerlauf(r) {
    var v = r.verlauf || [];
    if (!v.length) return null;

    var d = el('div', 'verlauf');
    d.appendChild(el('div', 'titel', 'Zuletzt von ' + r.absender));

    var ul = el('ul');
    v.forEach(function (e) {
      var li = document.createElement('li');
      li.appendChild(el('span', 'wert', String(e.punkte)));

      var klasse = e.status === 'freigegeben' ? 'frei'
        : (e.status === 'abgelehnt' ? 'abg' : 'off');
      var wort = e.status === 'freigegeben' ? 'gewertet'
        : (e.status === 'abgelehnt' ? 'abgelehnt' : 'offen');
      li.appendChild(el('span', klasse, wort + ' · ' + alter(e.eingegangen)));
      ul.appendChild(li);
    });
    d.appendChild(ul);
    return d;
  }

  /*
     Ablehnungsgründe zum Anklicken.

     Der Grund geht seit Neuestem an den Zuschauer zurück – er soll also
     etwas taugen. Vorgaben halten ihn einheitlich und ersparen das
     Tippen; „Anderer Grund" bleibt für alles, was nicht passt.
  */
  var GRUENDE = [
    'Bild wirkt bearbeitet',
    'Zahlen nicht sicher lesbar',
    'Falsche Runde oder falscher Ausschnitt',
    'Diese Partie zählt schon',
    'Punktzahl passt nicht zum Spielverlauf'
  ];

  function frageGrund(r, knoepfe) {
    knoepfe.innerHTML = '';

    var wahl = document.createElement('select');
    GRUENDE.forEach(function (g) {
      var o = document.createElement('option');
      o.value = g;
      o.textContent = g;
      wahl.appendChild(o);
    });
    var frei = document.createElement('option');
    frei.value = '';
    frei.textContent = 'Anderer Grund …';
    wahl.appendChild(frei);

    var ok = el('button', 'schlecht', 'Ablehnen');
    ok.addEventListener('click', function () {
      var grund = wahl.value;
      if (!grund) {
        hole('Warum abgelehnt?',
          'Der Zuschauer bekommt diesen Text zu lesen.', '').then(function (eigen) {
          if (!eigen) return;
          entscheide(r.id, 'abgelehnt', knoepfe, eigen);
        });
        return;
      }
      entscheide(r.id, 'abgelehnt', knoepfe, grund);
    });

    var zurueck = el('button', null, 'Abbrechen');
    zurueck.addEventListener('click', function () { lade(); });

    knoepfe.appendChild(el('span', 'leise', 'Grund (sieht der Zuschauer):'));
    knoepfe.appendChild(wahl);
    knoepfe.appendChild(ok);
    knoepfe.appendChild(zurueck);
    wahl.focus();
  }

  /**
   * Womit verglichen wurde – mit Bild, wenn es noch da ist.
   *
   * „3. Mal mit exakt 11 714 Punkten" ist eine Behauptung. Prüfen lässt
   * sie sich erst, wenn die alten Bilder danebenliegen: dieselbe Lobby?
   * dieselben Mitspieler? dieselbe Zahl an anderer Stelle?
   */
  function baueVergleiche(r) {
    var v = r.vergleiche || [];
    if (!v.length) return null;

    var d = el('div', 'vergleiche');
    d.appendChild(el('div', 'titel', 'Verglichen mit'));

    var reihe = el('div', 'streifen');
    v.forEach(function (x) {
      var k = el('div', 'vgl');

      if (x.bildDa) {
        var img = document.createElement('img');
        img.src = '/api/bild?id=' + encodeURIComponent(x.id) +
                  '&key=' + encodeURIComponent(schluessel);
        img.alt = 'Runde von ' + x.absender;
        img.title = 'Anklicken – größer ansehen';
        img.addEventListener('click', function () { window.open(img.src, '_blank'); });
        k.appendChild(img);
      } else {
        k.appendChild(el('div', 'kein-bild', 'Bild gelöscht'));
      }

      k.appendChild(el('div', 'wert', x.punkte === null ? '–' : String(x.punkte)));
      var wort = x.status === 'freigegeben' ? 'gewertet'
        : (x.status === 'abgelehnt' ? 'abgelehnt' : 'offen');
      k.appendChild(el('div', 'leise', x.absender));
      k.appendChild(el('div', 'leise', wort + ' · ' + alter(x.eingegangen)));
      reihe.appendChild(k);
    });

    d.appendChild(reihe);
    return d;
  }

  function baueRunde(r) {
    var karte = el('div', 'runde');
    var warnung = baueWarnung(r);
    var verdacht = baueVerdacht(r);
    if (warnung) karte.className += ' auffaellig';
    if (verdacht) karte.className += ' geflaggt';

    var kopf = el('div', 'runde-kopf');
    kopf.appendChild(el('span', 'absender', r.absender));
    kopf.appendChild(el('span', 'leise', zeit(r.eingegangen)));
    karte.appendChild(kopf);
    // Zuerst der Verdacht, dann die uebrigen Hinweise - er wiegt schwerer.
    if (verdacht) karte.appendChild(verdacht);
    if (warnung) karte.appendChild(warnung);

    var inhalt = el('div', 'inhalt');
    var bild = el('div', 'bild');
    if (r.bildGeloescht) {
      bild.appendChild(el('div', 'weg', 'Bild wurde nach Ablauf der Frist gelöscht'));
    } else {
      var img = document.createElement('img');
      img.src = '/api/bild?id=' + encodeURIComponent(r.id) + '&key=' + encodeURIComponent(schluessel);
      img.alt = 'Screenshot von ' + r.absender;
      img.addEventListener('click', function () { window.open(img.src, '_blank'); });
      bild.appendChild(img);
    }
    inhalt.appendChild(bild);

    var z = el('div', 'zeilen');
    z.appendChild(baueZeilen(r.zeilen));
    var vgl = baueVergleiche(r);
    if (vgl) z.appendChild(vgl);
    var v = baueVerlauf(r);
    if (v) z.appendChild(v);
    inhalt.appendChild(z);
    karte.appendChild(inhalt);

    var knoepfe = el('div', 'knoepfe');
    var ja = el('button', 'gut', 'Freigeben');
    ja.addEventListener('click', function () { entscheide(r.id, 'freigegeben', knoepfe); });
    var nein = el('button', 'schlecht', 'Ablehnen');
    nein.addEventListener('click', function () { frageGrund(r, knoepfe); });
    knoepfe.appendChild(ja);
    knoepfe.appendChild(nein);
    karte.appendChild(knoepfe);
    return karte;
  }

  function entscheide(id, status, knoepfe, grund) {
    // Sperren: ein zweiter Klick waehrend der Anfrage wuerde sonst eine
    // zweite Entscheidung schicken.
    Array.prototype.forEach.call(knoepfe.children, function (b) { b.disabled = true; });

    anfrage('/api/entscheiden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id, status: status, grund: grund })
    }).then(function (a) {
      if (!a.body.ok) {
        melde('Fehler: ' + a.body.fehler, 8000);
        Array.prototype.forEach.call(knoepfe.children, function (b) { b.disabled = false; });
        return;
      }
      melde(status === 'freigegeben'
        ? a.body.geschrieben + ' Einträge geschrieben' +
          /* Ist turnier gerade weg, sind sie nicht verloren, sondern
             vorgemerkt. Das muss hier stehen, sonst liest sich
             "0 Einträge geschrieben" wie ein Fehlschlag. */
          (a.body.gemerkt ? ', ' + a.body.gemerkt + ' warten auf den Turnier-Server' : '') +
          (a.body.offen ? ', ' + a.body.offen + ' nicht zugeordnet' : '')
        : 'Abgelehnt.');
      lade();
    }).catch(function (e) {
      melde('Fehler: ' + e.message, 8000);
      Array.prototype.forEach.call(knoepfe.children, function (b) { b.disabled = false; });
    });
  }

  /* ------------------------------------------------------------ Tokens */

  function ladeTokens() {
    anfrage('/api/tokens').then(function (a) {
      var koerper = $('tokens').querySelector('tbody');
      koerper.innerHTML = '';
      if (!a.body.ok) return;

      a.body.tokens.forEach(function (t) {
        var tr = document.createElement('tr');
        tr.appendChild(el('td', null, t.name));
        tr.appendChild(el('td', null, t.ingameName || '–'));
        tr.appendChild(el('td', null, t.ganzeLobby ? 'ganze Lobby' : 'eigene Zeile'));
        tr.appendChild(el('td', t.brauchtFreigabe ? '' : 'warn',
          t.brauchtFreigabe ? 'ja' : 'nein'));
        tr.appendChild(el('td', 'leise', zeit(t.letzteNutzung)));

        var td = document.createElement('td');
        if (t.gesperrt) {
          td.appendChild(el('span', 'nein', 'gesperrt'));
          td.title = t.sperrgrund || '';
        } else {
          var zeigen = el('button', null, 'Token');
          zeigen.addEventListener('click', function () {
            hole('Zugang für ' + t.name,
              'Diesen Token weitergeben – er ist persönlich.', t.token);
          });
          var sperren = el('button', 'schlecht', 'Sperren');
          sperren.style.marginLeft = '6px';
          sperren.addEventListener('click', function () {
            hole('Zugang von ' + t.name + ' sperren',
              'Warum? Der Grund steht später in der Übersicht – und der ' +
              'Zugang gilt sofort nicht mehr.',
              'bearbeitete Screenshots').then(function (grund) {
              if (!grund) return;
              anfrage('/api/token-sperren', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: t.token, grund: grund })
              }).then(function () { melde('Gesperrt.', 0, 'schlecht'); ladeTokens(); });
            });
          });
          td.appendChild(zeigen);
          td.appendChild(sperren);
        }
        tr.appendChild(td);
        koerper.appendChild(tr);
      });
    });
  }

  function neuerToken() {
    var daten = {
      name: $('t-name').value.trim(),
      ingame: $('t-ingame').value.trim(),
      ganzeLobby: $('t-lobby').checked,
      ohneFreigabe: $('t-ohne').checked
    };
    if (!daten.name) { melde('Ein Name fehlt.'); return; }

    anfrage('/api/token-neu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(daten)
    }).then(function (a) {
      if (!a.body.ok) { melde('Fehler: ' + a.body.fehler, 8000); return; }
      $('t-name').value = '';
      $('t-ingame').value = '';
      hole('Zugang für ' + a.body.name,
        'Diesen Token weitergeben – er ist persönlich.', a.body.token);
      ladeTokens();
      ladeStatus();
    });
  }

  /* ------------------------------------------------------------ Konten */

  function ladeKonten() {
    anfrage('/api/konten').then(function (a) {
      var koerper = $('konten').querySelector('tbody');
      koerper.innerHTML = '';
      if (!a.body.ok) return;

      $('konten-leer').style.display = a.body.konten.length ? 'none' : 'block';

      a.body.konten.forEach(function (k) {
        var tr = document.createElement('tr');
        tr.appendChild(el('td', null, k.benutzername));

        /* Ingame-Name direkt bearbeitbar: das ist der Grund, warum
           dieser Bereich ueberhaupt existiert. Aendert jemand seinen
           Namen im Spiel, machst du es hier in zwei Sekunden - er
           muesste sonst 30 Tage warten. */
        var tdName = document.createElement('td');
        var feld = document.createElement('input');
        feld.type = 'text';
        feld.value = k.ingameName || '';
        feld.placeholder = 'noch keiner';
        feld.style.width = '150px';
        feld.style.padding = '4px 8px';
        feld.addEventListener('change', function () {
          anfrage('/api/konto-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: k.id, ingame: feld.value })
          }).then(function (b) {
            if (!b.body.ok) { melde('Fehler: ' + b.body.fehler, 8000); ladeKonten(); return; }
            melde('Ingame-Name geändert.');
            ladeKonten();
          });
        });
        tdName.appendChild(feld);
        if (k.nutzerSperreTage > 0) {
          var sp = el('div', 'leise', 'für ihn noch ' + k.nutzerSperreTage + ' Tag(e) gesperrt');
          sp.style.fontSize = '11px';
          tdName.appendChild(sp);
        }
        tr.appendChild(tdName);

        var tdF = document.createElement('td');
        var schalter = document.createElement('input');
        schalter.type = 'checkbox';
        schalter.checked = !k.brauchtFreigabe;
        schalter.title = 'Angehakt: Runden zählen sofort, ohne dein Zutun';
        schalter.addEventListener('change', function () {
          anfrage('/api/konto-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: k.id, ohneFreigabe: schalter.checked })
          }).then(function (b) {
            if (!b.body.ok) { melde('Fehler: ' + b.body.fehler, 8000); ladeKonten(); return; }
            melde(schalter.checked
              ? 'Runden zählen jetzt ohne Freigabe.'
              : 'Runden brauchen wieder Freigabe.');
            ladeKonten();
          });
        });
        var lbl = document.createElement('label');
        lbl.style.fontSize = '13px';
        lbl.appendChild(schalter);
        lbl.appendChild(document.createTextNode(' ohne Freigabe'));
        tdF.appendChild(lbl);
        tr.appendChild(tdF);

        tr.appendChild(el('td', 'leise', zeit(k.letzteAnmeldung)));
        tr.appendChild(el('td', k.gesperrt ? 'nein' : 'leise',
          k.gesperrt ? 'Token gesperrt' : (k.hatToken ? '' : 'kein Token')));

        /* Löschen ist WEICH: das Konto verschwindet aus der Liste, sein
           Zugang gilt nicht mehr – aber die Historie bleibt und der
           Ingame-Name bleibt belegt. Meldet sich die Person erneut über
           Steam an, ist sie wieder da. Wer draußen bleiben soll, dessen
           Token wird gesperrt; das ist etwas anderes. */
        var tdW = document.createElement('td');
        var weg = el('button', null, k.geloescht ? 'Zurückholen' : 'Löschen');
        weg.style.padding = '5px 11px';
        weg.style.fontSize = '13px';
        if (!k.geloescht) weg.className = 'schlecht';
        weg.addEventListener('click', function () {
          var weiter = k.geloescht
            ? Promise.resolve(true)
            : frage('Konto von ' + k.benutzername + ' löschen?',
                'Der Zugang gilt dann nicht mehr. Die eingeschickten Runden ' +
                'bleiben erhalten, und meldet er sich neu über Steam an, ist ' +
                'er wieder da.', 'Löschen', 'schlecht');

          weiter.then(function (ok) {
          if (!ok) return;
          anfrage('/api/konto-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: k.id,
              aktion: k.geloescht ? 'wiederherstellen' : 'loeschen'
            })
          }).then(function (b) {
            if (!b.body.ok) { melde('Fehler: ' + b.body.fehler, 8000); return; }
            melde(k.geloescht ? 'Konto zurückgeholt.' : 'Konto gelöscht.',
              0, k.geloescht ? 'gut' : 'schlecht');
            ladeKonten();
            ladeStatus();
          });
          });
        });
        tdW.appendChild(weg);
        tr.appendChild(tdW);

        if (k.geloescht) {
          tr.style.opacity = '.5';
          tr.title = 'Gelöscht am ' + zeit(k.geloescht);
        }

        koerper.appendChild(tr);
      });
    });
  }

  /* --------------------------------------------------------- Erledigte */

  function baueErledigt(liste) {
    var t = $('erledigt');
    t.innerHTML = '';
    if (!liste.length) {
      t.appendChild(el('tr', null)).appendChild(el('td', 'leise', 'Noch nichts entschieden.'));
      return;
    }
    liste.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', r.status === 'freigegeben' ? 'ja' : 'nein',
        r.status === 'freigegeben' ? 'freigegeben' : 'abgelehnt'));
      tr.appendChild(el('td', null, r.absender));
      tr.appendChild(el('td', 'leise', r.zeilen.length + ' Zeilen'));
      tr.appendChild(el('td', 'leise', 'durch ' + (r.bearbeitetVon || '?')));
      tr.appendChild(el('td', 'leise', r.grund || ''));
      t.appendChild(tr);
    });
  }

  /* --------------------------------------------------------------- Laden */

  function lade() {
    ladeStatus();
    ladeKonten();
    ladeTokens();
    anfrage('/api/offene').then(function (a) {
      if (!a.body.ok) { $('zaehler').textContent = a.body.fehler; return; }

      var ziel = $('offen');
      ziel.innerHTML = '';
      a.body.offen.forEach(function (r) { ziel.appendChild(baueRunde(r)); });
      $('leer').style.display = a.body.offen.length ? 'none' : 'block';
      $('zaehler').textContent = a.body.offen.length ? '(' + a.body.offen.length + ')' : '';
      baueErledigt(a.body.erledigt);
    }).catch(function (e) {
      $('zaehler').textContent = 'Server nicht erreichbar';
    });
  }

  $('t-neu').addEventListener('click', neuerToken);
  reiterEinrichten();

  // Beim Neuladen den Reiter wiederherstellen, auf dem man war.
  var gemerkt = new URLSearchParams(location.search).get('tafel');
  if (gemerkt && document.getElementById(gemerkt)) zeigeTafel(gemerkt);

  lade();
  // Alle 15 Sekunden nachsehen - neue Einreichungen sollen von selbst
  // auftauchen, ohne dass jemand die Seite neu laedt.
  setInterval(lade, 15000);
})();

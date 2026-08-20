import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const OEFFENTLICH = path.join(HIER, '..', 'public');

const html = readFileSync(path.join(OEFFENTLICH, 'freigabe.html'), 'utf8');
const js = readFileSync(path.join(OEFFENTLICH, 'freigabe.js'), 'utf8');

/* =========================================================================
   Das Dashboard besteht aus zwei losen Dateien - ein Tippfehler in einer
   Element-Kennung faellt sonst niemandem auf, sondern erst im Browser,
   und dort nur als Abschnitt, der leer bleibt. Genau das laesst sich
   ohne Browser pruefen.

   Die Endpunkte, die es aufruft, prueft freigabe-api.test.ts gegen den
   echten Server.
   ========================================================================= */

describe('Dashboard - Geruest', () => {
  test('ist eine vollstaendige HTML-Seite', () => {
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="de">/);
    assert.match(html, /<\/html>\s*$/);
  });

  test('bringt Aussehen und Verhalten ohne fremde Quellen mit', () => {
    // Der Server soll ohne Netz auskommen - er laeuft neben dem Spiel.
    assert.doesNotMatch(html, /<link[^>]+stylesheet/);
    assert.match(html, /<script src="freigabe\.js">/);
  });

  test('ist gueltiges JavaScript', () => {
    // new Function uebersetzt, fuehrt aber nichts aus.
    assert.doesNotThrow(() => new Function(js));
  });

  test('laeuft gekapselt ab', () => {
    assert.match(js, /\(function \(\)/);
  });
});

describe('Dashboard - Kennungen', () => {
  test('spricht nur Elemente an, die es gibt', () => {
    for (const m of js.matchAll(/\$\('([^']+)'\)/g)) {
      assert.match(html, new RegExp('id="' + m[1]! + '"'), 'kein Element mit id ' + m[1]);
    }
  });

  test('jeder Reiter hat seine Tafel', () => {
    const reiter = [...html.matchAll(/data-tafel="([^"]+)"/g)].map((m) => m[1]!);
    assert.ok(reiter.length >= 4, 'es sollten mehrere Reiter sein, gefunden: ' + reiter.length);

    for (const id of reiter) {
      assert.match(html, new RegExp('class="tafel[^"]*" id="' + id + '"'),
        'zum Reiter ' + id + ' fehlt die Tafel');
    }
  });

  test('genau ein Reiter ist am Anfang offen', () => {
    const aktive = html.match(/class="tafel aktiv"/g) ?? [];
    assert.equal(aktive.length, 1);
  });

  test('setzt fremde Namen nie als HTML ein', () => {
    /* Absender, Ingame-Namen und Ablehnungsgruende kommen von aussen.
       Sie gehen ueber textContent - innerHTML darf nur zum Leeren dienen. */
    for (const m of js.matchAll(/innerHTML\s*=\s*([^;]+);/g)) {
      assert.equal(m[1]!.trim(), "''", 'innerHTML darf nur leeren, hier: ' + m[1]);
    }
  });
});

describe('Dashboard - Sprachen', () => {
  test('bringt Englisch und Chinesisch mit', () => {
    assert.match(js, /en: \{/);
    assert.match(js, /zh: \{/);
    assert.match(js, /Waiting for review/);
    assert.match(js, /等待审核/);
  });

  test('faengt auf Englisch an', () => {
    assert.match(js, /return 'en';/);
  });

  test('hat drei Knoepfe zum Umschalten', () => {
    for (const s of ['en', 'de', 'zh']) {
      assert.match(html, new RegExp('data-sprache="' + s + '"'));
    }
  });

  test('keine Variable verdeckt die Uebersetzungsfunktion', () => {
    /* var t = ... wuerde t() in der ganzen Funktion unbrauchbar machen -
       genau das hat auf der Kontoseite einmal die Rangliste verschluckt,
       und der stille catch hat es verdeckt. */
    assert.doesNotMatch(js, /var t = /);
    assert.doesNotMatch(js, /function \(t\)/);
  });
});

describe('Dashboard - was angezeigt werden muss', () => {
  test('zeigt den Verdacht getrennt von den uebrigen Hinweisen', () => {
    // Gelb heisst "sieh genau hin", rot heisst "wurde angehalten".
    assert.match(js, /function baueVerdacht/);
    assert.match(js, /function baueWarnung/);
    assert.match(html, /\.verdacht \{/);
  });

  test('zeigt den Verlauf der Person auf der Karte', () => {
    assert.match(js, /function baueVerlauf/);
    assert.match(js, /r\.verlauf/);
  });

  test('zeigt, was wirklich in der Rangliste steht', () => {
    assert.match(js, /function zeigeLetzte/);
    assert.match(js, /w\.letzte/);
  });

  test('warnt, wenn niemand mit Ingame-Namen angemeldet ist', () => {
    /* Ohne die kann keine Zeile zugeordnet werden, und alles landet in
       der Rueckfrage. Das ist seit dem Umbau die haeufigste Ursache
       dafuer, dass scheinbar nichts passiert - frueher stand hier die
       Frage, ob der Turnier-Server erreichbar ist. */
    assert.match(js, /Spieler mit Ingame-Name/);
    assert.match(js, /w\.spieler === 0/);
  });

  test('gehoert nicht in Suchmaschinen', () => {
    /* robots.txt steuert nur, ob gelesen wird. Verlinkt jemand die
       Adresse woanders, landet sie trotzdem im Index - das hier nicht. */
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  });

  test('man kommt wieder heraus', () => {
    /* Ohne Rueckweg fuehrt aus der Verwaltung nur die Adresszeile oder
       der Zurueck-Knopf des Browsers - beides findet niemand, der hier
       zum ersten Mal steht. */
    assert.match(html, /class="zurueck" href="\/"/);
    assert.match(js, /Zur Rangliste/);
  });

  test('haelt lange Listen im Rahmen', () => {
    const rollen = html.match(/class="rollen"/g) ?? [];
    assert.ok(rollen.length >= 3, 'die langen Listen sollten scrollen, gefunden: ' + rollen.length);
    assert.match(html, /\.rollen \{[^}]*overflow-y:\s*auto/);
  });
});

describe('Dashboard - die Bildergalerie', () => {
  test('hat einen eigenen Reiter', () => {
    assert.match(html, /data-tafel="t-bilder"/);
    assert.match(html, /id="t-bilder"/);
  });

  test('filtert nach Status und Spieler', () => {
    assert.match(html, /id="g-status"/);
    assert.match(html, /id="g-spieler"/);
    assert.match(js, /function ladeGalerie/);
  });

  test('holt fuer die Kacheln den AUSSCHNITT, nicht das Original', () => {
    /* Ein Original wiegt rund 2 MB. Bei dreissig Kacheln waeren das
       60 MB fuer eine Seite - und zu sehen waere nichts Zusaetzliches,
       denn auf dem Ausschnitt steht alles, was zaehlt. */
    assert.match(js, /art=ausschnitt/);
  });

  test('laedt die Bilder erst beim Oeffnen des Reiters', () => {
    // Wer nie hinsieht, soll auch nie Bilder laden.
    assert.match(js, /if \(id === 't-bilder'\) ladeGalerie\(\)/);
  });

  test('das Vollbild laesst sich mit den Pfeiltasten durchblaettern', () => {
    /* Beim Durchsehen einer Reihe will niemand zwanzigmal auf einen
       kleinen Knopf zielen. */
    assert.match(js, /ArrowRight/);
    assert.match(js, /ArrowLeft/);
    assert.match(js, /Escape/);
  });
});

describe('Dashboard - Uebersetzungen sind vollstaendig', () => {
  /*
     Dieselbe Wache wie beim Client, aus demselben Grund: t() gibt den
     deutschen Satz zurueck, wenn ein Eintrag fehlt. Richtige
     Rueckfallebene - aber niemand bemerkt es.

     Beim Bau der Galerie ist genau das passiert, gleich zweimal: erst
     fehlten die Eintraege ganz, dann waren sie doppelt kodiert
     ("gelöscht" statt "gelöscht") und trafen den Schluessel nicht mehr.
     Beides waere ohne diesen Test durchgegangen.
  */
  const schluesselAus = (quelle: string, muster: RegExp): string[] => {
    const raus: string[] = [];
    let t: RegExpExecArray | null;
    while ((t = muster.exec(quelle)) !== null) raus.push(t[1]!);
    return raus;
  };

  test('jeder Satz aus freigabe.js steht in der Tabelle', () => {
    const alle = [
      ...schluesselAus(js, /\bt\('((?:[^'\\]|\\.)*)'\)/g),
      ...schluesselAus(js, /\btv\('((?:[^'\\]|\\.)*)'/g)
    ];
    assert.ok(alle.length > 30, 'die Suche muss etwas finden, sonst prueft sie nichts');

    const fehlen = [...new Set(alle)].filter((k) => !js.includes("'" + k + "':"));
    assert.deepEqual(fehlen, [],
      'ohne Eintrag in WOERTER bleibt der Satz auf Deutsch stehen');
  });

  test('jedes data-t aus dem HTML steht in der Tabelle', () => {
    const alle = schluesselAus(html, /data-t="([^"]+)"/g);
    assert.ok(alle.length > 20);

    const fehlen = [...new Set(alle)].filter((k) => !js.includes("'" + k + "':"));
    assert.deepEqual(fehlen, []);
  });

  test('nichts ist doppelt kodiert', () => {
    /* Ein Zeichen, dessen UTF-8-Bytes als Latin-1 gelesen wurden, sieht
       im Editor kaputt aus - trifft aber vor allem seinen Schluessel
       nicht mehr, und dann bleibt die Zeile still auf Deutsch. */
    const verdaechtig = js.split('\n')
      .map((z, i) => ({ z, nr: i + 1 }))
      .filter(({ z }) => /Ã.|â..|Ã¼|Ã¶|Ã¤|ÃŸ/.test(z));

    assert.deepEqual(verdaechtig.map((v) => v.nr), [],
      'doppelt kodierte Zeilen: ' + verdaechtig.map((v) => v.z.trim().slice(0, 60)).join(' | '));
  });
});

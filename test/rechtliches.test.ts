import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { impressumSeite, datenschutzSeite, BETREIBER } from '../src/rechtliches-seite.js';
import { kontoSeite } from '../src/konto-seite.js';

/* =========================================================================
   IMPRESSUM UND DATENSCHUTZ

   Der Wert dieser Tests liegt nicht darin, dass die Seiten existieren -
   das sieht man. Er liegt darin, dass sie nichts BEHAUPTEN, was der
   Server nicht tut.

   Eine Datenschutzerklaerung mit einer erfundenen Loeschfrist ist
   schlimmer als gar keine: sie klingt verbindlich und ist falsch. Die
   Zahlen darin kommen deshalb aus dem Code, und hier wird nachgesehen,
   ob das so bleibt.
   ========================================================================= */

const impressum = impressumSeite();
const datenschutz = datenschutzSeite();

describe('Impressum', () => {
  test('nennt Namen und ladungsfaehige Anschrift', () => {
    for (const stueck of [BETREIBER.name, BETREIBER.strasse, BETREIBER.ort, BETREIBER.land]) {
      assert.ok(impressum.includes(stueck), 'es fehlt: ' + stueck);
    }
  });

  test('nennt eine Mailadresse, und zwar erreichbar', () => {
    /* Verschleiert wird sie - aber lesbar muss sie bleiben. Ein
       Impressum, dessen Adresse niemand entziffern kann, erfuellt
       seinen Zweck nicht. */
    const [vorn, hinten] = BETREIBER.mail.split('@');
    assert.ok(impressum.includes(vorn!));
    assert.ok(impressum.includes(hinten!));
    assert.match(impressum, /mailto:/);
  });

  test('stellt klar, dass es nichts mit dem Spiel zu tun hat', () => {
    /* Ohne das liest sich die Seite wie ein offizielles Angebot zum
       Spiel. Das ist sie nicht, und der Irrtum waere teuer. */
    assert.match(impressum, /keine Verbindung|nicht.*unterst/i);
    assert.match(impressum, /MECCHA CHAMELEON/);
    assert.match(impressum, /Valve|Steam/);
  });

  test('sagt, dass nichts verkauft wird', () => {
    assert.match(impressum, /nicht gewerblich|kostenlos/);
  });
});

describe('Datenschutz', () => {
  test('nennt denselben Verantwortlichen wie das Impressum', () => {
    // Zwei Anschriften, die auseinanderlaufen, sind ein Fehler fuer sich.
    assert.ok(datenschutz.includes(BETREIBER.name));
    assert.ok(datenschutz.includes(BETREIBER.strasse));
  });

  test('die Loeschfrist kommt aus der Einstellung, nicht aus der Luft', () => {
    /* DER Test, um den es hier geht. Wer MC_BILD_STUNDEN aendert, darf
       nicht eine Seite zuruecklassen, die weiter 72 Stunden verspricht. */
    const stunden = Number(process.env.MC_BILD_STUNDEN || 72);
    assert.ok(datenschutz.includes(String(stunden)),
      'die Seite nennt nicht die eingestellten ' + stunden + ' Stunden');
  });

  test('sagt ehrlich, was DAUERHAFT bleibt', () => {
    /* Runden und Ausschnitte werden nie geloescht - aufraeumen(30) wird
       nirgends aufgerufen. Das zu verschweigen und stattdessen eine
       Frist zu nennen, waere die eine Luege, die hier wirklich schadet. */
    assert.match(datenschutz, /dauerhaft/);
  });

  test('nennt die Rechtsgrundlagen und die Betroffenenrechte', () => {
    assert.match(datenschutz, /DSGVO/);
    assert.match(datenschutz, /Auskunft/);
    assert.match(datenschutz, /L[öo]schung/);
    assert.match(datenschutz, /Beschwerde/);
    assert.match(datenschutz, /Datenschutzbeh[öo]rde/);
  });

  test('sagt, dass das Programm nur auf Tastendruck aufnimmt', () => {
    /* Die Frage, die sich jeder stellt, der ein Programm laufen laesst,
       das Bildschirmfotos macht. Sie gehoert beantwortet, nicht
       umschifft. */
    assert.match(datenschutz, /nur dann|kein Mitschnitt/);
    assert.match(datenschutz, /Hintergrund/);
  });

  test('verspricht keine Werbung und keine Tracker', () => {
    assert.match(datenschutz, /keine Werbung/);
    assert.match(datenschutz, /Tracker|Analysedienste/);
  });

  test('sagt, dass das Steam-Passwort hier nie ankommt', () => {
    assert.match(datenschutz, /Passwort/);
  });
});

describe('Beide Seiten', () => {
  test('sind von der Rangliste aus verlinkt', () => {
    /* Pflichtangaben, die man nicht findet, sind keine. */
    const seite = kontoSeite();
    assert.match(seite, /href="\/impressum"/);
    assert.match(seite, /href="\/datenschutz"/);
  });

  test('verlinken einander und den Weg zurueck', () => {
    for (const s of [impressum, datenschutz]) {
      assert.match(s, /href="\/impressum"/);
      assert.match(s, /href="\/datenschutz"/);
      assert.match(s, /href="\/"/);
    }
  });

  test('stehen NICHT auf noindex', () => {
    /* Anders als die Download-Seite: Pflichtangaben sollen auffindbar
       sein, auch ueber eine Suchmaschine. */
    for (const s of [impressum, datenschutz]) {
      assert.doesNotMatch(s, /noindex/);
    }
  });

  test('kommen ohne fremde Server aus', () => {
    /* Eine Datenschutzseite, die zum Anzeigen Schriften von Google
       nachlaedt, widerlegt sich beim Aufschlagen selbst. */
    for (const s of [impressum, datenschutz]) {
      const fremd = s.match(/https?:\/\/[^"' ]+/g) ?? [];
      for (const url of fremd) {
        assert.ok(
          /dsb\.gv\.at|meccha-ranked\.com/.test(url),
          'unerwartete fremde Adresse: ' + url
        );
      }
    }
  });
});

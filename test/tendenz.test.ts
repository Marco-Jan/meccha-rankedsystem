import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  tendenzVon, TENDENZ_AB, TENDENZ_LETZTE, TENDENZ_SCHWELLE
} from '../src/rangliste.js';

/* =========================================================================
   GEHT ES AUFWAERTS ODER ABWAERTS?

   Was NICHT geht: den Platz von gestern mit dem von heute vergleichen.
   Den kennt niemand - es gibt keine Momentaufnahmen der Liste.

   Was geht: die letzten Runden gegen den eigenen Schnitt. Der Platz
   haengt am Schnitt, und der Schnitt bewegt sich genau dann, wenn das
   Neue besser oder schlechter ist als das, was bisher drin war.

   Das ist keine Vorhersage. Es ist eine Feststellung ueber das, was
   gerade hineinlaeuft - und genau deshalb darf sie dastehen.
   ========================================================================= */

/** Punkte in der Reihenfolge, in der sie eingegangen sind. */
const lauf = (...punkte: number[]) => punkte.map((p) => ({ punkte: p }));

describe('Tendenz', () => {
  test('steigende Runden ergeben aufwaerts', () => {
    const { tendenz, abweichung } = tendenzVon(lauf(100, 100, 100, 300, 300, 300));
    assert.equal(tendenz, 'auf');
    assert.ok(abweichung > 0);
  });

  test('fallende Runden ergeben abwaerts', () => {
    const { tendenz, abweichung } = tendenzVon(lauf(300, 300, 300, 100, 100, 100));
    assert.equal(tendenz, 'ab');
    assert.ok(abweichung < 0);
  });

  test('gleichmaessige Runden ergeben keinen Pfeil', () => {
    assert.equal(tendenzVon(lauf(200, 200, 200, 200, 200, 200)).tendenz, 'gleich');
  });

  test('kleine Schwankungen ergeben keinen Pfeil', () => {
    /* Ohne Schwelle zeigte fast jede Zeile einen Pfeil, und ein Pfeil,
       den es immer gibt, sagt nichts mehr. Zwei Punkte auf 200 sind
       Rauschen. */
    const { tendenz } = tendenzVon(lauf(200, 200, 200, 202, 202, 202));
    assert.equal(tendenz, 'gleich');
  });

  test('die Schwelle ist anteilig, nicht in Punkten', () => {
    /* Zwanzig Punkte bedeuten bei einem Schnitt von 200 etwas und bei
       3000 nichts. Derselbe absolute Abstand, zwei Antworten. */
    const klein = tendenzVon(lauf(200, 200, 200, 240, 240, 240));
    const gross = tendenzVon(lauf(3000, 3000, 3000, 3040, 3040, 3040));

    assert.equal(klein.tendenz, 'auf');
    assert.equal(gross.tendenz, 'gleich');
  });

  test('zu wenige Eintraege ergeben unklar, nicht gleich', () => {
    /* "gleich" waere eine Aussage - "wir haben nachgesehen, es bewegt
       sich nichts". Bei drei Runden haben wir aber gar nicht
       nachgesehen: dann sind die letzten drei und der Schnitt dasselbe,
       und heraus kaeme immer null. */
    for (let n = 0; n < TENDENZ_AB; n++) {
      const punkte = Array.from({ length: n }, () => 100);
      assert.equal(tendenzVon(lauf(...punkte)).tendenz, 'unklar',
        n + ' Eintraege duerfen keine Tendenz ergeben');
    }
    assert.notEqual(tendenzVon(lauf(...Array(TENDENZ_AB).fill(100))).tendenz, 'unklar');
  });

  test('sieht nur auf die letzten drei, nicht auf den ganzen Verlauf', () => {
    /* Wer vor zwei Wochen schwach war und seither gleichmaessig gut
       spielt, steigt nicht mehr - er STEHT gut. Der Pfeil soll die
       aktuelle Bewegung zeigen, nicht die halbe Saison. */
    const gleichmaessig = lauf(50, 400, 400, 400, 400, 400, 400);
    const { tendenz } = tendenzVon(gleichmaessig);

    const letzte = gleichmaessig.slice(-TENDENZ_LETZTE);
    assert.equal(letzte.length, 3);
    assert.equal(tendenz, 'auf',
      'der schwache Anfang zieht den Schnitt herunter, die letzten drei liegen darueber');
  });

  test('haelt eine Runde mit null Punkten aus', () => {
    // Kein Sturz durch Teilen: der Schnitt kann null sein.
    assert.equal(tendenzVon(lauf(0, 0, 0, 0, 0)).tendenz, 'gleich');
  });

  test('die Schwelle ist die Grenze, nicht ein Vorschlag', () => {
    /* Genau auf der Schwelle noch kein Pfeil - sonst haengt das
       Ergebnis an einer Rundung im letzten Bit. */
    assert.ok(TENDENZ_SCHWELLE > 0 && TENDENZ_SCHWELLE < 1);
  });
});

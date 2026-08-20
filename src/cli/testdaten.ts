/* =========================================================================
   TESTDATEN - eine gefuellte Rangliste zum Ansehen.

   Eine leere Rangliste sagt nichts darueber, ob die Anzeige taugt: ob
   die Platzierung stimmt, ob "Auf dem Sprung" erscheint, ob der
   Umschalter zwischen zwei Listen funktioniert, ob der CSV-Export
   brauchbar aussieht. Dafuer braucht es Leute mit unterschiedlich
   vielen Runden.

   Aufruf:
       npm run testdaten            anlegen
       npm run testdaten -- --weg   wieder entfernen

   -------------------------------------------------------------------------
   ALLES LAESST SICH ZURUECKNEHMEN

   Die erfundenen Konten tragen eine feste Kennzeichnung (steamId faengt
   mit PROBE_STEAM_PRAEFIX an). --weg loescht genau diese und ihre
   Eintraege - nichts sonst.

   Das ist der ganze Grund, warum es ein Werkzeug ist und kein Skript,
   das man einmal laufen laesst: Testdaten, die man nicht mehr los wird,
   stehen irgendwann in der echten Saison.
   ========================================================================= */

import path from 'node:path';

import { DATEN_DIR } from '../config.js';
import { ladeWertungAusOrdner } from '../wertung.js';

/*
   Erfundene SteamIDs beginnen mit dieser Ziffernfolge.

   Echte SteamID64 fangen mit 7656119 an - diese hier also mit
   Sicherheit nicht, und sie koennen niemals mit einem echten Konto
   kollidieren. Wer sich wirklich anmeldet, bekommt eine andere.
*/
const PROBE_STEAM_PRAEFIX = '99999';

/** Die Namen stammen aus echten Screenshots - so liest es sich vertraut. */
const LEUTE: ReadonlyArray<{ name: string; runden: number; von: number; bis: number }> = [
  // In der Wertung: zehn und mehr Runden
  { name: 'Nori', runden: 14, von: 900, bis: 1500 },
  { name: 'Zironic', runden: 12, von: 850, bis: 1460 },
  { name: 'Matilder', runden: 11, von: 700, bis: 1380 },
  { name: 'Hupferli', runden: 10, von: 600, bis: 1350 },
  { name: 'alaraaaa', runden: 10, von: 400, bis: 1200 },

  /* Auf dem Sprung: genug Runden fuer die Vorschau, und ein Schnitt,
     der fuer die ersten drei reichen wuerde. Genau der Fall, den der
     Block oben zeigen soll. */
  { name: 'Honey', runden: 7, von: 1100, bis: 1600 },
  { name: 'DungaD', runden: 5, von: 1000, bis: 1500 },

  // Anwaerter ohne Aussicht - sie fuellen die untere Haelfte
  { name: 'Hoeje', runden: 6, von: 100, bis: 400 },
  { name: 'Fabiki', runden: 3, von: 80, bis: 300 },
  { name: 'MiniAngiul', runden: 1, von: 28, bis: 28 }
];

/*
   Vorhersagbare Zufallszahlen.

   Math.random() waere hier laestig: bei jedem Aufruf saehe die Rangliste
   anders aus, und "stimmt die Platzierung" liesse sich nicht zweimal
   gleich pruefen. Ein einfacher Generator mit festem Startwert liefert
   immer dieselbe Streuung.
*/
function wuerfel(startwert: number): () => number {
  let z = startwert;
  return () => {
    z = (z * 1103515245 + 12345) % 2147483648;
    return z / 2147483648;
  };
}

function main(): void {
  const weg = process.argv.includes('--weg');
  const { konten, rangliste, listen } = ladeWertungAusOrdner(DATEN_DIR);

  console.log('');
  console.log('  Daten: ' + DATEN_DIR);

  /* ------------------------------------------------------------- weg */
  if (weg) {
    const probe = konten.alle().filter((k) => k.steamId.startsWith(PROBE_STEAM_PRAEFIX));
    if (probe.length === 0) {
      console.log('  Keine Testdaten gefunden - nichts zu tun.');
      console.log('');
      return;
    }

    let eintraege = 0;
    for (const k of probe) {
      for (const l of listen.alle()) {
        for (const e of rangliste.eintraegeVon(l.id, k.id)) {
          rangliste.entfernen(e.id);
          eintraege++;
        }
      }
      konten.loeschen(k.id);
    }
    rangliste.jetztSpeichern();

    console.log('  ' + probe.length + ' Testkonten und ' + eintraege + ' Eintraege entfernt.');
    console.log('');
    return;
  }

  /* --------------------------------------------------------- anlegen */
  const ziel = listen.aktive();
  if (ziel.length === 0) {
    console.log('  FEHLER: keine aktive Rangliste. Leg im Dashboard eine an.');
    process.exitCode = 1;
    return;
  }
  console.log('  Listen: ' + ziel.map((l) => l.name).join(', '));
  console.log('');

  const zufall = wuerfel(4711);
  let neueKonten = 0;
  let neueEintraege = 0;

  LEUTE.forEach((p, i) => {
    const steamId = PROBE_STEAM_PRAEFIX + String(100000000000 + i).slice(0, 12);

    const an = konten.anmelden(steamId, p.name);
    if (!an.ok) {
      console.log('  ' + p.name + ': ' + an.fehler);
      return;
    }
    const konto = an.wert.konto;

    /* vomStreamer = true umgeht die Namenssperre. Bei erfundenen Konten
       ist sie nur im Weg - sie schuetzt davor, dass jemand den Namen je
       nach Punktestand wechselt, und das tut hier niemand. */
    const g = konten.setzeIngameName(konto.id, p.name, true);
    if (!g.ok) {
      console.log('  ' + p.name + ': ' + g.fehler);
      return;
    }
    neueKonten++;

    /* Die Zeitstempel liegen auseinander, aelteste zuerst - sonst faellt
       bei mehr als zehn Runden nicht auf, WELCHE aus dem Fenster
       herausrutscht. */
    const start = Date.now() - p.runden * 3 * 60 * 60 * 1000;

    for (let n = 0; n < p.runden; n++) {
      const punkte = Math.round(p.von + zufall() * (p.bis - p.von));
      for (const l of ziel) {
        rangliste.eintragen(l.id, konto.id, punkte, start + n * 3 * 60 * 60 * 1000);
        neueEintraege++;
      }
    }

    console.log('  ' + p.name.padEnd(14) + p.runden + ' Runden');
  });

  rangliste.jetztSpeichern();

  console.log('');
  console.log('  ' + neueKonten + ' Konten, ' + neueEintraege + ' Eintraege angelegt.');
  console.log('  Wieder weg mit:  npm run testdaten -- --weg');
  console.log('');
}

main();

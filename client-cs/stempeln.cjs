/* Haelt fest, welche Client-Quellen unter welcher Fassungsnummer
   ausgeliefert wurden.

   Der Anlass: Der Client bekam alle japanischen Texte, wurde neu gebaut
   und hiess weiter 0.5.0. Damit meldet der Server dieselbe Zahl, die in
   der alten .exe steht - der Hinweis "es gibt eine neue Fassung" bleibt
   aus, und niemand kann den beiden Dateien ansehen, welche er hat.

   Aufgerufen von BAUEN.bat und ueber `npm run client-stempel`. */
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const QUELLEN = ['Kern.cs', 'Sprache.cs', 'Fenster.cs', 'Angaben.cs'];
const stempelDatei = path.join(__dirname, 'fassung.json');

/** Liest JSON und wirft die BOM weg, die Windows-Editoren gern setzen. */
function liesJson(datei) {
  let roh = fs.readFileSync(datei, 'utf8');
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);
  return JSON.parse(roh);
}

/* Der Dateiname geht mit in den Hash: sonst faellt nicht auf, wenn
   Inhalt von einer Datei in die andere wandert. */
function quellenHash(ordner) {
  const h = crypto.createHash('sha256');
  for (const name of QUELLEN) {
    h.update(name);
    h.update(fs.readFileSync(path.join(ordner, name)));
  }
  return h.digest('hex');
}

function stempelLesen() {
  try {
    return liesJson(stempelDatei);
  } catch {
    return { version: '', quellen: '' };
  }
}

if (require.main === module) {
  const verteilung = liesJson(
    path.join(__dirname, '..', 'config', 'verteilung.json')
  );
  const version = String(verteilung.clientVersion || '').trim();
  const hash = quellenHash(__dirname);
  const alt = stempelLesen();

  /* --nochmal: dieselbe Nummer bewusst neu stempeln.
     Fuer den Fall, dass ein Bau schiefging und der Code gleich danach
     korrigiert wurde - die Fassung war nie ausgeliefert, also hat sie
     auch niemand. Sie dafuer hochzuzaehlen waere nicht nur unnoetig: bei
     Windows waechst der Ruf einer Datei ueber ihre Verbreitung, und jede
     neue Nummer faengt bei null an. Weniger Nummern sind besser.

     Bewusst ein eigener Schalter und keine Automatik: die Frage "wurde
     diese Fassung schon ausgeliefert" kann nur ein Mensch beantworten. */
  const nochmal = process.argv.includes('--nochmal');

  /* Der eine Fall, der wirklich schadet: die Quellen sind andere, die
     Nummer ist dieselbe wie beim letzten ausgelieferten Bau. */
  if (!nochmal && hash !== alt.quellen && version === alt.version) {
    console.error('');
    console.error('  Die Client-Quellen haben sich geaendert, aber');
    console.error('  clientVersion steht immer noch auf ' + version + '.');
    console.error('');
    console.error('  Zaehle sie in config/verteilung.json hoch. Sonst');
    console.error('  meldet der Server dieselbe Nummer, die in der alten');
    console.error('  .exe steht, und niemand erfaehrt vom neuen Client.');
    console.error('');
    process.exit(1);
  }

  fs.writeFileSync(
    stempelDatei,
    JSON.stringify(
      {
        _hinweis:
          'Von client-cs/stempeln.cjs geschrieben. Haelt fest, welche ' +
          'Quellen als welche Fassung ausgeliefert wurden. Nicht von Hand ' +
          'aendern - dann faellt eine vergessene Nummer nicht mehr auf.',
        version,
        /* Das Datum kommt aus dem Bau, nicht aus der Aenderungszeit der
           .exe: die zeigt nach einem scp den Zeitpunkt des Hochladens.
           Hier steht, wann die Fassung wirklich entstanden ist. */
        gebaut: new Date().toISOString(),
        quellen: hash,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  console.log('  Fassung gestempelt: ' + version);
}

module.exports = { QUELLEN, quellenHash, stempelLesen, liesJson };

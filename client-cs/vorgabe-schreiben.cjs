/* Schreibt die Serveradresse aus config/verteilung.json nach Kern.cs.

   Damit ist ein Serverumzug eine Aenderung an EINER JSON-Datei plus
   Neubau - nicht am Code. Wird von BAUEN.bat aufgerufen. */
'use strict';
const fs = require('fs');
const path = require('path');

const projekt = path.join(__dirname, '..');
const quelle = path.join(projekt, 'config', 'verteilung.json');
const ziel = path.join(__dirname, 'Kern.cs');

let server;
let version;
try {
  let roh = fs.readFileSync(quelle, 'utf8');
  if (roh.charCodeAt(0) === 0xfeff) roh = roh.slice(1);
  const d = JSON.parse(roh);
  server = String(d.server || '').trim().replace(/\/+$/, '');
  if (!server) throw new Error('server ist leer');
  version = String(d.clientVersion || '').trim();
} catch (err) {
  console.error('  ' + err.message);
  process.exit(1);
}

const code = fs.readFileSync(ziel, 'utf8');
let neu = code.replace(
  /public const string VorgabeServer = "[^"]*";/,
  'public const string VorgabeServer = "' + server + '";'
);

if (neu === code && !code.includes('"' + server + '"')) {
  console.error('  Stelle in Kern.cs nicht gefunden');
  process.exit(1);
}

/* Die Fassung steht ebenfalls in verteilung.json - so meldet der Server
   dieselbe Zahl, die in der ausgelieferten .exe steht. */
if (version) {
  neu = neu.replace(
    /public const string Version = "[^"]*";/,
    'public const string Version = "' + version + '";'
  );
}

fs.writeFileSync(ziel, neu, 'utf8');

/* Dieselbe Nummer auch in die Dateieigenschaften der .exe.

   Windows will vier Stellen; wir zaehlen in drei, also haengt eine 0 an.
   Von Hand gepflegt waeren es zwei Orte fuer dieselbe Zahl, und der
   zweite waere nach dem ersten Vergessen falsch - ausgerechnet dort, wo
   ein misstrauischer Nutzer nachsieht. */
if (version) {
  const angaben = path.join(__dirname, 'Angaben.cs');
  try {
    let a = fs.readFileSync(angaben, 'utf8');
    a = a
      .replace(/AssemblyVersion\("[^"]*"\)/, 'AssemblyVersion("' + version + '.0")')
      .replace(/AssemblyFileVersion\("[^"]*"\)/, 'AssemblyFileVersion("' + version + '.0")');
    fs.writeFileSync(angaben, a, 'utf8');
  } catch (err) {
    console.error('  Angaben.cs nicht angepasst: ' + err.message);
  }
}
console.log('  Serveradresse: ' + server + (version ? '   Fassung: ' + version : ''));

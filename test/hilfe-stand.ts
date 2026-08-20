import type { Spieler } from '../src/namen.js';
import type { Wertungsstand } from '../src/wertung.js';

/**
 * Ein Wertungsstand fuer Tests.
 *
 * Die meisten Servertests interessieren sich nur dafuer, WER zugeordnet
 * werden kann - nicht fuer Schnitt und Platzierung. Statt in jedem Test
 * ein vollstaendiges Objekt zu bauen, steht hier eine Vorgabe, von der
 * einzelne Felder ueberschrieben werden koennen.
 */
export function standMit(
  spieler: readonly Spieler[],
  extra: Partial<Wertungsstand> = {}
): Wertungsstand {
  return {
    spieler,
    fenster: 10,
    voll: 10,
    eintraege: 0,
    /* Eine aktive Liste, damit Tests nicht in den Sonderfall "gar keine"
       laufen - den kann es im Betrieb nicht geben, weil sorgeFuerEine()
       beim Start eine anlegt. */
    listen: [{
      id: 'l_test', name: 'Testliste', aktiv: true, eintraege: 0,
      gewertet: [], anwaerter: [], aufDemSprung: [], letzte: []
    }],
    ...extra
  };
}

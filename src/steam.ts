/* =========================================================================
   ANMELDUNG ÜBER STEAM

   Steam nutzt OpenID 2.0. Das Verfahren ist alt, aber genau deshalb
   angenehm: es braucht KEINE Registrierung, keinen Schluessel und kein
   Geheimnis. Man leitet den Nutzer zu Steam weiter, Steam schickt ihn
   zurueck, und man fragt bei Steam nach, ob die Rueckkehr echt war.

   Warum Steam und nicht Google oder Mail: Meccha Chameleon laeuft ueber
   Steam. Jeder Mitspieler hat also zwangslaeufig ein Konto - es gibt
   keine Huerde. Google braeuchte ein Cloud-Projekt und zwingend HTTPS,
   ein Mailversand einen externen Dienst samt DNS-Eintraegen.

   Der Ablauf:

     1. anmeldeUrl()      Nutzer wird zu Steam geschickt
     2. Steam fragt ihn   "Anmeldung bei ... erlauben?"
     3. Steam leitet zurueck, mit openid.* in der Adresse
     4. pruefeRueckkehr() fragt bei Steam nach, ob das echt war

   Schritt 4 ist der wichtige. Die Rueckleitung allein beweist nichts -
   jeder koennte sich eine Adresse mit fremder SteamID basteln. Erst die
   Rueckfrage bei Steam macht daraus einen Beweis.
   ========================================================================= */

export const STEAM_ANMELDUNG = 'https://steamcommunity.com/openid/login';

/**
 * Baut die Adresse, zu der der Nutzer geschickt wird.
 *
 * rueckAdresse ist die vollstaendige Adresse unseres Servers, bei der
 * Steam den Nutzer wieder abliefert. bereich ist die Wurzel derselben
 * Anwendung - Steam prueft, dass die Rueckadresse darin liegt.
 */
export function anmeldeUrl(rueckAdresse: string, bereich: string): string {
  const p = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': rueckAdresse,
    'openid.realm': bereich,
    // Die beiden Werte bedeuten "wir wollen keinen bestimmten Nutzer,
    // Steam soll selbst herausfinden, wer angemeldet ist".
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select'
  });
  return STEAM_ANMELDUNG + '?' + p.toString();
}

/** Zieht die SteamID64 aus der Kennung, die Steam zurueckschickt. */
export function steamIdAus(claimedId: string): string | null {
  const m = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/.exec(
    String(claimedId ?? '').trim()
  );
  return m ? m[1]! : null;
}

export type Pruefung =
  | { readonly ok: true; readonly steamId: string }
  | { readonly ok: false; readonly fehler: string };

/**
 * Prueft eine Rueckkehr von Steam.
 *
 * Die uebergebenen Werte sind die openid.*-Angaben aus der Adresse. Sie
 * gehen unveraendert an Steam zurueck, nur mit mode=check_authentication
 * statt id_res. Steam antwortet mit is_valid:true oder false.
 *
 * abfrage ist herausgezogen, damit die Tests ohne Netz laufen.
 */
export async function pruefeRueckkehr(
  werte: URLSearchParams,
  abfrage: (koerper: URLSearchParams) => Promise<string> = frageSteam
): Promise<Pruefung> {

  if (werte.get('openid.mode') !== 'id_res') {
    // Kommt auch vor, wenn der Nutzer bei Steam abbricht.
    return { ok: false, fehler: 'Die Anmeldung wurde abgebrochen.' };
  }

  const claimed = werte.get('openid.claimed_id') ?? '';
  const steamId = steamIdAus(claimed);
  if (!steamId) {
    return { ok: false, fehler: 'Steam hat keine gueltige Kennung geschickt.' };
  }

  /*
     Alles zurueckschicken, was Steam gesendet hat - nur der Modus wird
     getauscht. Einzelne Felder wegzulassen wuerde die Pruefung
     ungueltig machen, denn die Signatur deckt sie mit ab.
  */
  const koerper = new URLSearchParams();
  werte.forEach((wert, name) => {
    if (name.startsWith('openid.')) koerper.set(name, wert);
  });
  koerper.set('openid.mode', 'check_authentication');

  let antwort: string;
  try {
    antwort = await abfrage(koerper);
  } catch (err) {
    return { ok: false, fehler: 'Steam nicht erreichbar: ' + (err as Error).message };
  }

  /*
     Steam antwortet als Zeilen der Form  name:wert. Wir suchen
     is_valid:true - alles andere heisst, dass die Rueckleitung
     gefaelscht oder abgelaufen war.
  */
  const gueltig = antwort
    .split(/\r?\n/)
    .some((z) => z.trim() === 'is_valid:true');

  if (!gueltig) {
    return { ok: false, fehler: 'Steam hat die Anmeldung nicht bestaetigt.' };
  }
  return { ok: true, steamId };
}

async function frageSteam(koerper: URLSearchParams): Promise<string> {
  const res = await fetch(STEAM_ANMELDUNG, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: koerper.toString(),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

/* ==========================================================================
   ANZEIGENAME VON STEAM

   OpenID liefert nur die Kennung, keinen Namen. Den gibt es ueber die
   Steam-Web-API, und die braucht einen Schluessel - kostenlos und in
   einer Minute angelegt unter steamcommunity.com/dev/apikey.

   Ohne Schluessel funktioniert alles weiter, der Nutzer traegt seinen
   Anzeigenamen dann selbst ein. Deshalb ist das hier bewusst
   fehlertolerant: schlaegt der Abruf fehl, gibt es null statt einer
   Ausnahme. Ein fehlender Anzeigename darf niemanden an der Anmeldung
   hindern.
   ========================================================================== */

export const STEAM_API_KEY = process.env.MC_STEAM_API_KEY || '';

export async function holeSteamNamen(
  steamId: string,
  schluessel = STEAM_API_KEY
): Promise<string | null> {

  if (!schluessel || !/^\d{17}$/.test(steamId)) return null;

  try {
    const url = 'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/' +
      '?key=' + encodeURIComponent(schluessel) +
      '&steamids=' + encodeURIComponent(steamId);

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;

    const daten = await res.json() as {
      response?: { players?: Array<{ personaname?: string }> };
    };
    const name = daten.response?.players?.[0]?.personaname;
    return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
  } catch {
    // Netz weg, Schluessel falsch, Steam langsam - alles kein Grund,
    // die Anmeldung scheitern zu lassen.
    return null;
  }
}

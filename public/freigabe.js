/* =========================================================================
   VERWALTUNG - Freigabe, Status und Zugaenge.

   Klassisches Script ohne Modul und ohne Framework - wie die Overlays im
   Turnier-Projekt. Laeuft damit ohne Bauschritt.

   Der Admin-Schluessel kommt aus der URL (?key=...) und wird an jede
   Anfrage weitergereicht, wie beim Turnier-Admin auch.
   ========================================================================= */

(function () {
  'use strict';

  /* Der Schlüssel ist nur noch der Notausgang: normalerweise entscheidet
     die Rolle des angemeldeten Kontos, und dann bleibt er leer. */
  var schluessel = new URLSearchParams(location.search).get('key') || '';

  /* Was wir dürfen - kommt vom Server. 'keine' heißt: nicht angemeldet
     oder gewöhnlicher Zuschauer. */
  var stufe = 'keine';

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------ Sprache

     Wie auf der Kontoseite: der deutsche Satz ist der Schlüssel, Englisch
     ist die Vorgabe. Fehlt eine Übersetzung, steht dort deutscher Text —
     sichtbar, statt einer leeren Stelle.
  */

  var WOERTER = {
    en: {
      'Meccha Ranked · Verwaltung': 'Meccha Ranked · Administration',
      'Was heute reinkam.': 'What came in today.',
      'Freigabe': 'Review',
      'Punkteliste': 'Score list',
      'Zuschauer': 'Viewers',
      'Zugänge': 'Access',
      'Entschieden': 'Decided',

      'Wartet auf Freigabe': 'Waiting for review',
      'Nichts offen.': 'Nothing open.',
      'Zuletzt in der Punkteliste': 'Recently in the score list',
      'Noch nichts eingetragen.': 'Nothing entered yet.',
      'Angemeldete Zuschauer': 'Registered viewers',
      'Zugänge ohne Konto': 'Access without account',
      'Zuletzt entschieden': 'Recently decided',
      'Noch nichts entschieden.': 'Nothing decided yet.',

      'Spieler mit Ingame-Name': 'Players with in-game name',
      'Einträge in der Wertung': 'Entries in the ranking',
      'in der Wertung': 'ranked',
      'Anwärter': 'Contenders',
      '{0} Einträge insgesamt': '{0} entries in total',
      'nicht erreichbar': 'unreachable',
      'offen': 'open',
      'freigegeben': 'approved',
      'Leser': 'Reader',
      'gesperrt': 'locked',

      'Anmeldung nötig': 'Sign-in required',
      'Die Verwaltung ist Admins und Mods vorbehalten. Melde dich mit demselben Steam-Konto an, das als Admin eingetragen ist.':
        'Administration is for admins and mods. Sign in with the same Steam account that is set as admin.',
      'Mit Steam anmelden': 'Sign in with Steam',
      'Keine Berechtigung': 'No permission',
      'Du bist angemeldet, aber für die Verwaltung fehlt dir die Rolle. Ein Admin kann dich im Dashboard zum Mod machen.':
        'You are signed in, but you do not have a role for administration. An admin can make you a mod in the dashboard.',

      'Bitte genau prüfen (im Bild ist das NICHT zu sehen)':
        'Check carefully (this is NOT visible in the image)',
      '⚑ Geflaggt – zur Prüfung angehalten': '⚑ Flagged – held for review',
      'Es gibt {0} weitere Runde(n) mit denselben Zeilen':
        'There are {0} more round(s) with the same rows',
      'Verglichen mit': 'Compared with',
      'Bild gelöscht': 'Image deleted',
      'Anklicken – größer ansehen': 'Click to view larger',
      'Zuletzt von {0}': 'Recently from {0}',
      'Bild wurde nach Ablauf der Frist gelöscht': 'Image deleted after the retention period',
      'Screenshot von {0}': 'Screenshot from {0}',
      'nicht lesbar': 'unreadable',
      'gewertet': 'counted',
      'abgelehnt': 'rejected',
      'wartet': 'waiting',

      'Freigeben': 'Approve',
      'Ablehnen': 'Reject',
      'Abbrechen': 'Cancel',
      'Grund (sieht der Zuschauer):': 'Reason (the viewer sees this):',
      'Bild wirkt bearbeitet': 'Image appears edited',
      'Zahlen nicht sicher lesbar': 'Numbers not clearly readable',
      'Falsche Runde oder falscher Ausschnitt': 'Wrong round or wrong crop',
      'Diese Partie zählt schon': 'This match already counts',
      'Punktzahl passt nicht zum Spielverlauf': 'Score does not match the game',
      'Anderer Grund …': 'Other reason …',
      'Warum abgelehnt?': 'Why rejected?',
      'Der Zuschauer bekommt diesen Text zu lesen.': 'The viewer will read this text.',
      '{0} Einträge geschrieben': '{0} entries written',
      ', {0} nicht zugeordnet': ', {0} unmatched',
      'Abgelehnt.': 'Rejected.',
      'Fehler: {0}': 'Error: {0}',

      'Anzeigename': 'Display name',
      'im Spiel': 'in game',
      'Rolle': 'Role',
      'zuletzt da': 'last seen',
      'Zugang': 'Access',
      'Name': 'Name',
      'wertet': 'counts',
      'zuletzt': 'last',
      'Spieler': 'Player',
      'Punkte': 'Points',
      'wann': 'when',

      'noch keiner': 'none yet',
      'für ihn noch {0} Tag(e) gesperrt': 'locked for {0} more day(s) for them',
      'ohne Freigabe': 'without review',
      'Angehakt: Runden zählen sofort, ohne dein Zutun':
        'Checked: rounds count immediately, without your action',
      'Runden zählen jetzt ohne Freigabe.': 'Rounds now count without review.',
      'Runden brauchen wieder Freigabe.': 'Rounds need review again.',
      'Ingame-Name geändert.': 'In-game name changed.',
      'Token gesperrt': 'Token blocked',
      '← Zur Rangliste': '← Back to leaderboard',
      'kein Token': 'no token',
      'Löschen': 'Delete',
      'Zurückholen': 'Restore',
      'Konto von {0} löschen?': 'Delete account of {0}?',
      'Der Zugang gilt dann nicht mehr. Die eingeschickten Runden bleiben erhalten, und meldet er sich neu über Steam an, ist er wieder da.':
        'Their access stops working. Submitted rounds remain, and if they sign in with Steam again, they are back.',
      'Konto gelöscht.': 'Account deleted.',
      'Konto zurückgeholt.': 'Account restored.',
      '{0} ist jetzt {1}.': '{0} is now {1}.',
      'Zuschauer, Mod oder Admin': 'viewer, mod or admin',

      'ganze Lobby': 'whole lobby',
      'nur eigene': 'own row only',
      'ja': 'yes',
      'nein': 'no',
      'Zugang anlegen': 'Create access',
      'Name (für dich)': 'Name (for you)',
      'Name im Spiel': 'Name in game',
      'Ein Name fehlt.': 'A name is missing.',
      'Zugang für {0}': 'Access for {0}',
      'Diesen Token weitergeben – er ist persönlich.':
        'Pass on this token – it is personal.',
      'zeigen': 'show',
      'sperren': 'block',
      'Zugang von {0} sperren': 'Block access of {0}',
      'Warum? Der Grund steht später in der Übersicht – und der Zugang gilt sofort nicht mehr.':
        'Why? The reason appears in the overview later – and the access stops working immediately.',
      'bearbeitete Screenshots': 'edited screenshots',
      'Gesperrt.': 'Blocked.',

      'Geht noch nicht: {0}': 'Not yet: {0}',
      'Server nicht erreichbar: {0}': 'Server unreachable: {0}',

      'gerade eben': 'just now',
      'vor {0} min': '{0} min ago',
      'vor {0} h': '{0} h ago',
      'vor {0} Tagen': '{0} days ago',
      'nie': 'never'
    },

    zh: {
      'Meccha Ranked · Verwaltung': 'Meccha Ranked · 管理',
      'Was heute reinkam.': '今天收到了什么。',
      'Freigabe': '审核',
      'Punkteliste': '分数表',
      'Zuschauer': '观众',
      'Zugänge': '访问权限',
      'Entschieden': '已处理',

      'Wartet auf Freigabe': '等待审核',
      'Nichts offen.': '没有待处理项。',
      'Zuletzt in der Punkteliste': '分数表最新记录',
      'Noch nichts eingetragen.': '尚无记录。',
      'Angemeldete Zuschauer': '已注册观众',
      'Zugänge ohne Konto': '无账号的访问令牌',
      'Zuletzt entschieden': '最近处理',
      'Noch nichts entschieden.': '尚未处理任何对局。',

      'Spieler mit Ingame-Name': '已填游戏内名称的玩家',
      'Einträge in der Wertung': '排名条目',
      'in der Wertung': '已计入排名',
      'Anwärter': '候补',
      '{0} Einträge insgesamt': '共 {0} 条',
      'nicht erreichbar': '无法连接',
      'offen': '待处理',
      'freigegeben': '已批准',
      'Leser': '识别方式',
      'gesperrt': '已锁定',

      'Anmeldung nötig': '需要登录',
      'Die Verwaltung ist Admins und Mods vorbehalten. Melde dich mit demselben Steam-Konto an, das als Admin eingetragen ist.':
        '管理面板仅限管理员和版主使用。请使用被设为管理员的那个 Steam 账号登录。',
      'Mit Steam anmelden': '使用 Steam 登录',
      'Keine Berechtigung': '没有权限',
      'Du bist angemeldet, aber für die Verwaltung fehlt dir die Rolle. Ein Admin kann dich im Dashboard zum Mod machen.':
        '你已登录，但没有管理权限。管理员可以在面板中把你设为版主。',

      'Bitte genau prüfen (im Bild ist das NICHT zu sehen)':
        '请仔细核对（图片上看不出来）',
      '⚑ Geflaggt – zur Prüfung angehalten': '⚑ 已标记 — 已拦截待审核',
      'Es gibt {0} weitere Runde(n) mit denselben Zeilen':
        '另有 {0} 局包含完全相同的行',
      'Verglichen mit': '对比对象',
      'Bild gelöscht': '图片已删除',
      'Anklicken – größer ansehen': '点击查看大图',
      'Zuletzt von {0}': '{0} 最近的提交',
      'Bild wurde nach Ablauf der Frist gelöscht': '图片已过保留期并被删除',
      'Screenshot von {0}': '{0} 的截图',
      'nicht lesbar': '无法识别',
      'gewertet': '已计入',
      'abgelehnt': '已拒绝',
      'wartet': '等待中',

      'Freigeben': '批准',
      'Ablehnen': '拒绝',
      'Abbrechen': '取消',
      'Grund (sieht der Zuschauer):': '原因（观众可见）：',
      'Bild wirkt bearbeitet': '图片疑似被修改',
      'Zahlen nicht sicher lesbar': '数字无法可靠识别',
      'Falsche Runde oder falscher Ausschnitt': '对局错误或截取范围错误',
      'Diese Partie zählt schon': '该场对局已计入',
      'Punktzahl passt nicht zum Spielverlauf': '分数与对局过程不符',
      'Anderer Grund …': '其他原因 …',
      'Warum abgelehnt?': '拒绝原因？',
      'Der Zuschauer bekommt diesen Text zu lesen.': '观众会看到这段文字。',
      '{0} Einträge geschrieben': '已写入 {0} 条记录',
      ', {0} nicht zugeordnet': '，{0} 条未匹配',
      'Abgelehnt.': '已拒绝。',
      'Fehler: {0}': '错误：{0}',

      'Anzeigename': '显示名称',
      'im Spiel': '游戏内名称',
      'Rolle': '角色',
      'zuletzt da': '最后活动',
      'Zugang': '访问',
      'Name': '名称',
      'wertet': '计入范围',
      'zuletzt': '最近',
      'Spieler': '玩家',
      'Punkte': '分数',
      'wann': '时间',

      'noch keiner': '尚未填写',
      'für ihn noch {0} Tag(e) gesperrt': '对他还需等待 {0} 天',
      'ohne Freigabe': '免审核',
      'Angehakt: Runden zählen sofort, ohne dein Zutun':
        '勾选后：对局立即计入，无需你操作',
      'Runden zählen jetzt ohne Freigabe.': '对局现在免审核直接计入。',
      'Runden brauchen wieder Freigabe.': '对局重新需要审核。',
      'Ingame-Name geändert.': '游戏内名称已修改。',
      'Token gesperrt': '令牌已封禁',
      '← Zur Rangliste': '← 返回排行榜',
      'kein Token': '无令牌',
      'Löschen': '删除',
      'Zurückholen': '恢复',
      'Konto von {0} löschen?': '删除 {0} 的账号？',
      'Der Zugang gilt dann nicht mehr. Die eingeschickten Runden bleiben erhalten, und meldet er sich neu über Steam an, ist er wieder da.':
        '其访问将失效。已提交的对局仍保留；若他重新用 Steam 登录，账号即可恢复。',
      'Konto gelöscht.': '账号已删除。',
      'Konto zurückgeholt.': '账号已恢复。',
      '{0} ist jetzt {1}.': '{0} 现在是 {1}。',
      'Zuschauer, Mod oder Admin': '观众、版主或管理员',

      'ganze Lobby': '整个房间',
      'nur eigene': '仅本人一行',
      'ja': '是',
      'nein': '否',
      'Zugang anlegen': '创建访问令牌',
      'Name (für dich)': '名称（供你辨认）',
      'Name im Spiel': '游戏内名称',
      'Ein Name fehlt.': '缺少名称。',
      'Zugang für {0}': '{0} 的访问令牌',
      'Diesen Token weitergeben – er ist persönlich.': '把此令牌交给他 — 令牌属于个人。',
      'zeigen': '显示',
      'sperren': '封禁',
      'Zugang von {0} sperren': '封禁 {0} 的访问',
      'Warum? Der Grund steht später in der Übersicht – und der Zugang gilt sofort nicht mehr.':
        '原因？稍后会显示在概览中 — 访问将立即失效。',
      'bearbeitete Screenshots': '修改过的截图',
      'Gesperrt.': '已封禁。',

      'Geht noch nicht: {0}': '暂时不行：{0}',
      'Server nicht erreichbar: {0}': '无法连接服务器：{0}',

      'gerade eben': '刚刚',
      'vor {0} min': '{0} 分钟前',
      'vor {0} h': '{0} 小时前',
      'vor {0} Tagen': '{0} 天前',
      'nie': '从未'
    }
  };

  var sprache = (function () {
    try {
      var gemerkt = localStorage.getItem('mc_sprache');
      if (gemerkt === 'de' || gemerkt === 'en' || gemerkt === 'zh') return gemerkt;
    } catch (e) { /* privater Modus */ }
    return 'en';
  })();

  function t(text) {
    if (sprache === 'de') return text;
    var w = WOERTER[sprache];
    return (w && w[text] !== undefined) ? w[text] : text;
  }

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
    ladeStatus();
    ladeKonten();
    ladeTokens();
  }

  function zeichneSprache() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (e) {
      e.textContent = t(e.getAttribute('data-t'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tp]'), function (e) {
      e.placeholder = t(e.getAttribute('data-tp'));
    });
    Array.prototype.forEach.call(
      document.querySelectorAll('#sprachen button'), function (b) {
        b.className = b.getAttribute('data-sprache') === sprache ? 'aktiv' : '';
      });
  }


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
    /* Ohne Schlüssel geht die Anfrage schlicht mit dem Sitzungs-Cookie
       raus - der Browser hängt ihn von selbst an. */
    var ziel = pfad;
    if (schluessel) {
      ziel += (pfad.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(schluessel);
    }
    return fetch(ziel, optionen).then(function (r) {
      return r.json().then(function (j) { return { code: r.status, body: j }; });
    });
  }

  /**
   * Zeigt statt des Dashboards die Anmeldung.
   *
   * Zwei Fälle, die man auseinanderhalten muss: nicht angemeldet (dann
   * hilft der Steam-Knopf) und angemeldet, aber ohne Rolle (dann hilft
   * nur jemand, der Rollen vergeben darf).
   */
  function zeigeAnmeldung(angemeldet) {
    document.getElementById('reiter').style.display = 'none';
    var tafeln = document.getElementsByClassName('tafel');
    Array.prototype.forEach.call(tafeln, function (tf) { tf.className = 'tafel'; });

    var ziel = $('status');
    ziel.innerHTML = '';

    var k = el('div', 'block');
    k.style.maxWidth = '520px';

    if (angemeldet) {
      k.appendChild(el('h2', null, t('Keine Berechtigung')));
      k.appendChild(el('p', 'leise', t(
        'Du bist angemeldet, aber für die Verwaltung fehlt dir die Rolle. ' +
        'Ein Admin kann dich im Dashboard zum Mod machen.')));
    } else {
      k.appendChild(el('h2', null, t('Anmeldung nötig')));
      k.appendChild(el('p', 'leise', t(
        'Die Verwaltung ist Admins und Mods vorbehalten. Melde dich mit ' +
        'demselben Steam-Konto an, das als Admin eingetragen ist.')));

      var a = document.createElement('a');
      a.href = '/anmelden';
      a.className = 'haupt';
      a.textContent = t('Mit Steam anmelden');
      a.style.cssText = 'display:inline-block;margin-top:14px;padding:12px 18px;' +
        'border:1px solid var(--akzent);color:var(--akzent);border-radius:9px;' +
        'text-decoration:none;font-weight:600';
      k.appendChild(a);
    }
    ziel.appendChild(k);
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
    Array.prototype.forEach.call(tafeln, function (tf) {
      tf.className = tf.id === id ? 'tafel aktiv' : 'tafel';
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
    if (!zeit) return t('nie');
    var min = Math.round((Date.now() - zeit) / 60000);
    if (min < 1) return t('gerade eben');
    if (min < 60) return tv('vor {0} min', [min]);
    var std = Math.round(min / 60);
    if (std < 48) return tv('vor {0} h', [std]);
    return tv('vor {0} Tagen', [Math.round(std / 24)]);
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

      if (a.code === 401) { zeigeAnmeldung(false); return; }
      if (a.code === 403) { zeigeAnmeldung(true); return; }
      if (!a.body.ok) {
        ziel.appendChild(kachel(t('gesperrt'), a.body.fehler, true));
        return;
      }

      /* Ein Mod sieht die Reiter für Konten und Zugänge gar nicht erst -
         die Endpunkte dahinter würden ihn ohnehin abweisen. */
      stufe = a.body.stufe || 'mod';
      document.getElementById('reiter').style.display = '';
      Array.prototype.forEach.call(
        document.querySelectorAll('#reiter button[data-tafel]'), function (b) {
          var nurAdmin = b.getAttribute('data-tafel') === 't-zuschauer' ||
                         b.getAttribute('data-tafel') === 't-zugaenge';
          b.style.display = (nurAdmin && stufe !== 'admin') ? 'none' : '';
        });

      var w = a.body.wertung;

      /* Hier stand frueher der Turnier-Status - "erreichbar ja/nein" war
         beim Testen die haeufigste Ursache dafuer, dass scheinbar nichts
         passiert. Seit die Wertung im eigenen Haus liegt, kann das nicht
         mehr schiefgehen; an seine Stelle tritt die Frage, die jetzt die
         haeufigste Ursache ist: steht ueberhaupt jemand mit Ingame-Namen
         da, dem sich eine Zeile zuordnen laesst? */
      ziel.appendChild(kachel(String(w.spieler), t('Spieler mit Ingame-Name'),
        w.spieler === 0));

      ziel.appendChild(kachel(String(w.eintraege), t('Einträge in der Wertung')));
      ziel.appendChild(kachel(String(w.gewertet), t('in der Wertung')));
      ziel.appendChild(kachel(String(w.anwaerter), t('Anwärter')));
      /* Der Zaehler im Reiter, damit man offene Runden auch dann sieht,
         wenn gerade ein anderer Reiter offen ist. */
      var offenZahl = $('r-offen');
      offenZahl.textContent = String(a.body.freigabe.offen);
      offenZahl.className = a.body.freigabe.offen > 0 ? 'zahl warn' : 'zahl';

      ziel.appendChild(kachel(String(a.body.freigabe.offen), t('offen'),
        a.body.freigabe.offen > 0));
      ziel.appendChild(kachel(String(a.body.freigabe.freigegeben), t('freigegeben')));
      ziel.appendChild(kachel(String(a.body.tokens), t('Zugänge')));

      var l = kachel(a.body.leser.split(' ')[0], t('Leser'));
      l.title = a.body.leser;
      ziel.appendChild(l);

      zeigeLetzte(w);
    }).catch(function (e) {
      $('status').textContent = tv('Server nicht erreichbar: {0}', [e.message]);
    });
  }

  /**
   * Was tatsächlich in der Rangliste steht.
   *
   * Die Gegenprobe zu „freigegeben": hier siehst du, was wirklich
   * angekommen ist, statt nur zu wissen, dass du geklickt hast.
   */
  function zeigeLetzte(w) {
    var koerper = $('letzte').tBodies[0];
    var eintraege = w.letzte || [];
    koerper.innerHTML = '';

    $('letzte-leer').style.display = eintraege.length ? 'none' : 'block';
    $('letzte-zaehler').textContent = eintraege.length
      ? tv('{0} Einträge insgesamt', [w.eintraege])
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
    var tab = el('table');
    zeilen.forEach(function (z) {
      var tr = document.createElement('tr');
      if (z.punkte === null) tr.className = 'unlesbar';
      else if (z.unsicher) tr.className = 'unsicher';

      tr.appendChild(el('td', null, z.rohName));
      var p = el('td', 'p', z.punkte === null ? t('nicht lesbar') : z.rohPunkte);
      tr.appendChild(p);
      tab.appendChild(tr);
    });
    return tab;
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
    d.appendChild(el('b', null, t('⚑ Geflaggt – zur Prüfung angehalten')));
    var ul = el('ul');
    gruende.forEach(function (g) { ul.appendChild(el('li', null, g)); });
    d.appendChild(ul);
    return d;
  }

  function baueWarnung(r) {
    var gruende = (r.bildAuffaellig || []).slice();
    if (r.inhaltsgleich > 0) {
      gruende.push(tv('Es gibt {0} weitere Runde(n) mit denselben Zeilen', [r.inhaltsgleich]));
    }
    if (!gruende.length) return null;

    var d = el('div', 'warnung');
    /* Ausdruecklich sagen, dass Hinsehen nicht reicht: eine bearbeitete
       Zahl ist im Bild nicht zu erkennen - beim Test war die Faelschung
       optisch perfekt. */
    d.appendChild(el('b', null, t('Bitte genau prüfen (im Bild ist das NICHT zu sehen)')));
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
    d.appendChild(el('div', 'titel', tv('Zuletzt von {0}', [r.absender])));

    var ul = el('ul');
    v.forEach(function (e) {
      var li = document.createElement('li');
      li.appendChild(el('span', 'wert', String(e.punkte)));

      var klasse = e.status === 'freigegeben' ? 'frei'
        : (e.status === 'abgelehnt' ? 'abg' : 'off');
      var wort = e.status === 'freigegeben' ? t('gewertet')
        : (e.status === 'abgelehnt' ? t('abgelehnt') : t('offen'));
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
      o.textContent = t(g);
      wahl.appendChild(o);
    });
    var frei = document.createElement('option');
    frei.value = '';
    frei.textContent = t('Anderer Grund …');
    wahl.appendChild(frei);

    var ok = el('button', 'schlecht', t('Ablehnen'));
    ok.addEventListener('click', function () {
      var grund = wahl.value;
      if (!grund) {
        hole(t('Warum abgelehnt?'),
          t('Der Zuschauer bekommt diesen Text zu lesen.'), '').then(function (eigen) {
          if (!eigen) return;
          entscheide(r.id, 'abgelehnt', knoepfe, eigen);
        });
        return;
      }
      entscheide(r.id, 'abgelehnt', knoepfe, grund);
    });

    var zurueck = el('button', null, t('Abbrechen'));
    zurueck.addEventListener('click', function () { lade(); });

    knoepfe.appendChild(el('span', 'leise', t('Grund (sieht der Zuschauer):')));
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
    d.appendChild(el('div', 'titel', t('Verglichen mit')));

    var reihe = el('div', 'streifen');
    v.forEach(function (x) {
      var k = el('div', 'vgl');

      if (x.bildDa) {
        var img = document.createElement('img');
        img.src = '/api/bild?id=' + encodeURIComponent(x.id) +
                  '&key=' + encodeURIComponent(schluessel);
        img.alt = 'Runde von ' + x.absender;
        img.title = t('Anklicken – größer ansehen');
        img.addEventListener('click', function () { window.open(img.src, '_blank'); });
        k.appendChild(img);
      } else {
        k.appendChild(el('div', 'kein-bild', t('Bild gelöscht')));
      }

      k.appendChild(el('div', 'wert', x.punkte === null ? '–' : String(x.punkte)));
      var wort = x.status === 'freigegeben' ? t('gewertet')
        : (x.status === 'abgelehnt' ? t('abgelehnt') : t('offen'));
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
      bild.appendChild(el('div', 'weg', t('Bild wurde nach Ablauf der Frist gelöscht')));
    } else {
      var img = document.createElement('img');
      img.src = '/api/bild?id=' + encodeURIComponent(r.id) + '&key=' + encodeURIComponent(schluessel);
      img.alt = tv('Screenshot von {0}', [r.absender]);
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
    var ja = el('button', 'gut', t('Freigeben'));
    ja.addEventListener('click', function () { entscheide(r.id, 'freigegeben', knoepfe); });
    var nein = el('button', 'schlecht', t('Ablehnen'));
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
        melde(tv('Fehler: {0}', [a.body.fehler]), 8000, 'schlecht');
        Array.prototype.forEach.call(knoepfe.children, function (b) { b.disabled = false; });
        return;
      }
      melde(status === 'freigegeben'
        ? tv('{0} Einträge geschrieben', [a.body.geschrieben]) +
          /* Was nicht zugeordnet werden konnte, gehört dazu - sonst liest
             sich "0 Einträge geschrieben" wie ein Fehlschlag, obwohl in
             Wahrheit nur niemand aus der Zeile bekannt war. */
          (a.body.offen ? tv(', {0} nicht zugeordnet', [a.body.offen]) : '')
        : t('Abgelehnt.'));
      lade();
    }).catch(function (e) {
      melde(tv('Fehler: {0}', [e.message]), 8000, 'schlecht');
      Array.prototype.forEach.call(knoepfe.children, function (b) { b.disabled = false; });
    });
  }

  /* ------------------------------------------------------------ Tokens */

  function ladeTokens() {
    anfrage('/api/tokens').then(function (a) {
      var koerper = $('tokens').querySelector('tbody');
      koerper.innerHTML = '';
      if (!a.body.ok) return;

      a.body.tokens.forEach(function (tk) {
        var tr = document.createElement('tr');
        tr.appendChild(el('td', null, tk.name));
        tr.appendChild(el('td', null, tk.ingameName || '–'));
        tr.appendChild(el('td', null, tk.ganzeLobby ? t('ganze Lobby') : t('nur eigene')));
        tr.appendChild(el('td', tk.brauchtFreigabe ? '' : 'warn',
          tk.brauchtFreigabe ? t('ja') : t('nein')));
        tr.appendChild(el('td', 'leise', zeit(tk.letzteNutzung)));

        var td = document.createElement('td');
        if (tk.gesperrt) {
          td.appendChild(el('span', 'nein', 'gesperrt'));
          td.title = tk.sperrgrund || '';
        } else {
          var zeigen = el('button', null, 'Token');
          zeigen.addEventListener('click', function () {
            hole(tv('Zugang für {0}', [tk.name]),
              t('Diesen Token weitergeben – er ist persönlich.'), tk.token);
          });
          var sperren = el('button', 'schlecht', 'Sperren');
          sperren.style.marginLeft = '6px';
          sperren.addEventListener('click', function () {
            hole(tv('Zugang von {0} sperren', [tk.name]),
              t('Warum? Der Grund steht später in der Übersicht – und der ' +
                'Zugang gilt sofort nicht mehr.'),
              t('bearbeitete Screenshots')).then(function (grund) {
              if (!grund) return;
              anfrage('/api/token-sperren', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tk.token, grund: grund })
              }).then(function () { melde(t('Gesperrt.'), 0, 'schlecht'); ladeTokens(); });
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
      hole(tv('Zugang für {0}', [a.body.name]),
        t('Diesen Token weitergeben – er ist persönlich.'), a.body.token);
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
        feld.placeholder = t('noch keiner');
        feld.style.width = '150px';
        feld.style.padding = '4px 8px';
        feld.addEventListener('change', function () {
          anfrage('/api/konto-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: k.id, ingame: feld.value })
          }).then(function (b) {
            if (!b.body.ok) { melde(tv('Fehler: {0}', [b.body.fehler]), 8000, 'schlecht'); ladeKonten(); return; }
            melde(t('Ingame-Name geändert.'), 0, 'gut');
            ladeKonten();
          });
        });
        tdName.appendChild(feld);
        if (k.nutzerSperreTage > 0) {
          var sp = el('div', 'leise',
            tv('für ihn noch {0} Tag(e) gesperrt', [k.nutzerSperreTage]));
          sp.style.fontSize = '11px';
          tdName.appendChild(sp);
        }
        tr.appendChild(tdName);

        var tdF = document.createElement('td');
        var schalter = document.createElement('input');
        schalter.type = 'checkbox';
        schalter.checked = !k.brauchtFreigabe;
        schalter.title = t('Angehakt: Runden zählen sofort, ohne dein Zutun');
        schalter.addEventListener('change', function () {
          anfrage('/api/konto-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: k.id, ohneFreigabe: schalter.checked })
          }).then(function (b) {
            if (!b.body.ok) { melde(tv('Fehler: {0}', [b.body.fehler]), 8000, 'schlecht'); ladeKonten(); return; }
            melde(schalter.checked
              ? t('Runden zählen jetzt ohne Freigabe.')
              : t('Runden brauchen wieder Freigabe.'), 0, 'gut');
            ladeKonten();
          });
        });
        var lbl = document.createElement('label');
        lbl.style.fontSize = '13px';
        lbl.appendChild(schalter);
        lbl.appendChild(document.createTextNode(' ' + t('ohne Freigabe')));
        tdF.appendChild(lbl);
        tr.appendChild(tdF);

        /* Rolle vergeben. Nur Admins sehen diese Spalte überhaupt -
           der Reiter ist für Mods ausgeblendet. */
        var tdR = document.createElement('td');
        var rolle = document.createElement('select');
        [['zuschauer', 'Zuschauer'], ['mod', 'Mod'], ['admin', 'Admin']]
          .forEach(function (r) {
            var o = document.createElement('option');
            o.value = r[0];
            o.textContent = t(r[1]);
            if (k.rolle === r[0]) o.selected = true;
            rolle.appendChild(o);
          });
        rolle.style.padding = '4px 8px';
        rolle.style.fontSize = '13px';
        rolle.addEventListener('change', function () {
          anfrage('/api/konto-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: k.id, aktion: 'rolle', rolle: rolle.value })
          }).then(function (b) {
            if (!b.body.ok) { melde(tv('Fehler: {0}', [b.body.fehler]), 9000, 'schlecht'); ladeKonten(); return; }
            melde(tv('{0} ist jetzt {1}.', [k.benutzername, t(rolle.value)]), 0, 'gut');
            ladeKonten();
          });
        });
        tdR.appendChild(rolle);
        tr.appendChild(tdR);

        tr.appendChild(el('td', 'leise', zeit(k.letzteAnmeldung)));
        tr.appendChild(el('td', k.gesperrt ? 'nein' : 'leise',
          k.gesperrt ? t('Token gesperrt') : (k.hatToken ? '' : t('kein Token'))));

        /* Löschen ist WEICH: das Konto verschwindet aus der Liste, sein
           Zugang gilt nicht mehr – aber die Historie bleibt und der
           Ingame-Name bleibt belegt. Meldet sich die Person erneut über
           Steam an, ist sie wieder da. Wer draußen bleiben soll, dessen
           Token wird gesperrt; das ist etwas anderes. */
        var tdW = document.createElement('td');
        var weg = el('button', null, k.geloescht ? t('Zurückholen') : t('Löschen'));
        weg.style.padding = '5px 11px';
        weg.style.fontSize = '13px';
        if (!k.geloescht) weg.className = 'schlecht';
        weg.addEventListener('click', function () {
          var weiter = k.geloescht
            ? Promise.resolve(true)
            : frage(tv('Konto von {0} löschen?', [k.benutzername]),
                t('Der Zugang gilt dann nicht mehr. Die eingeschickten Runden ' +
                  'bleiben erhalten, und meldet er sich neu über Steam an, ist ' +
                  'er wieder da.'), t('Löschen'), 'schlecht');

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
            if (!b.body.ok) { melde(tv('Fehler: {0}', [b.body.fehler]), 8000, 'schlecht'); return; }
            melde(k.geloescht ? t('Konto zurückgeholt.') : t('Konto gelöscht.'),
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
    var tab = $('erledigt');
    tab.innerHTML = '';
    if (!liste.length) {
      tab.appendChild(el('tr', null)).appendChild(el('td', 'leise', t('Noch nichts entschieden.')));
      return;
    }
    liste.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', r.status === 'freigegeben' ? 'ja' : 'nein',
        r.status === 'freigegeben' ? t('freigegeben') : t('abgelehnt')));
      tr.appendChild(el('td', null, r.absender));
      tr.appendChild(el('td', 'leise', r.zeilen.length + ' ' + t('Zeilen')));
      tr.appendChild(el('td', 'leise', t('durch') + ' ' + (r.bearbeitetVon || '?')));
      tr.appendChild(el('td', 'leise', r.grund || ''));
      tab.appendChild(tr);
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

  $('sprachen').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (b) setzeSprache(b.getAttribute('data-sprache'));
  });
  document.documentElement.lang = sprache;
  zeichneSprache();

  // Beim Neuladen den Reiter wiederherstellen, auf dem man war.
  var gemerkt = new URLSearchParams(location.search).get('tafel');
  if (gemerkt && document.getElementById(gemerkt)) zeigeTafel(gemerkt);

  lade();
  // Alle 15 Sekunden nachsehen - neue Einreichungen sollen von selbst
  // auftauchen, ohne dass jemand die Seite neu laedt.
  setInterval(lade, 15000);
})();

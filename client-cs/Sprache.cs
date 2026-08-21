/* =========================================================================
   MECCHA RANKED - Sprachen und Farben

   Zwei Dinge, die vorher im Code verstreut lagen und beide dasselbe
   Problem hatten: man musste sie an vielen Stellen gleichzeitig aendern.

   SPRACHEN
   Der deutsche Satz ist der Schluessel. Fehlt eine Uebersetzung, steht
   deutscher Text da - eine leere Stelle waere schlimmer als ein Satz in
   der falschen Sprache. Genauso macht es die Kontoseite im Browser, das
   soll man nicht zweimal unterschiedlich lernen muessen.

   Vorgabe ist Englisch: die Zuschauer kommen aus dem Stream, nicht aus
   dem Nachbarort.

   -------------------------------------------------------------------
   EINE SPRACHE DAZUNEHMEN

   Drei Schritte, und der dritte darf dauern:

     1. Kennung und Namen ergaenzen (Kennungen, Namen)
     2. StelleVon() um einen Fall erweitern
     3. die Uebersetzungen nach und nach anhaengen

   Schritt 3 muss NICHT vollstaendig sein. Ein zu kurzes Feld faellt auf
   Deutsch zurueck, genau wie ein fehlender Eintrag - man kann also mit
   den zwanzig wichtigsten Saetzen anfangen und den Rest spaeter
   nachziehen. Vorher war das anders: da haette eine neue Sprache
   bedeutet, alle achtzig Eintraege in einem Rutsch zu erweitern, sonst
   waere der Client beim ersten unuebersetzten Satz abgestuerzt.

   Die Reihenfolge im Feld: [0] Englisch, [1] Chinesisch, [2] Japanisch.
   Wer eine dazwischenschiebt, verschiebt alle - also hinten anhaengen.

   WICHTIG: Diese Datei braucht eine BOM, sonst liest csc.exe sie in der
   Windows-Codepage und die chinesischen Zeichen zerfallen. Genau das war
   bei Kern.cs passiert - in der ausgelieferten .exe stand
   "primArer Bildschirm".
   ========================================================================= */

using System.Collections.Generic;
using System.Drawing;

namespace MecchaRanked
{
    /* ==================================================================
       FARBEN

       Vorher standen die Color.FromArgb(...) ueberall einzeln im Code.
       Wer das Fenster dunkler machen wollte, musste sie einsammeln - und
       hat dabei welche uebersehen, weil dieselbe Farbe an fuenf Stellen
       stand.
       ================================================================== */
    static class Farben
    {
        public static readonly Color Grund = Color.FromArgb(30, 32, 38);   // Fensterhintergrund
        public static readonly Color Flaeche = Color.FromArgb(38, 41, 49); // abgesetzter Bereich
        public static readonly Color Tiefe = Color.FromArgb(24, 26, 31);   // Liste, Eingabefeld
        public static readonly Color Kante = Color.FromArgb(52, 56, 66);   // Knopf, Trennlinie

        public static readonly Color Text = Color.FromArgb(232, 235, 241);
        public static readonly Color Leise = Color.FromArgb(150, 158, 172);
        public static readonly Color Sehrleise = Color.FromArgb(116, 124, 138);

        public static readonly Color Blau = Color.FromArgb(42, 92, 152);   // Hauptknopf
        public static readonly Color BlauLeise = Color.FromArgb(40, 56, 74);
        public static readonly Color BlauText = Color.FromArgb(150, 195, 245);

        public static readonly Color Gruen = Color.FromArgb(120, 210, 150);
        public static readonly Color Rot = Color.FromArgb(232, 130, 120);
        public static readonly Color RotFlaeche = Color.FromArgb(58, 42, 46);
        public static readonly Color Gelb = Color.FromArgb(240, 180, 65);
        public static readonly Color Grau = Color.FromArgb(130, 138, 152);
    }

    /* ==================================================================
       SPRACHEN
       ================================================================== */
    static class Sprache
    {
        /// <summary>Eine der Kennungen. Wird beim Start aus client.json gesetzt.</summary>
        public static string Aktuell = "en";

        public static readonly string[] Kennungen = { "en", "de", "zh", "ja" };
        public static readonly string[] Namen = { "English", "Deutsch", "中文", "日本語" };

        public static string NameVon(string kennung)
        {
            for (int i = 0; i < Kennungen.Length; i++)
                if (Kennungen[i] == kennung) return Namen[i];
            return Namen[0];
        }

        /* Reihenfolge im Feld: [0] Englisch, [1] Chinesisch, [2] Japanisch.
           Deutsch steht links als Schluessel und braucht keinen Eintrag.

           Ein Feld darf kuerzer sein als die Zahl der Sprachen - was
           fehlt, faellt auf Deutsch zurueck. Neue Sprachen also hinten
           anhaengen, nie dazwischenschieben. */
        static readonly Dictionary<string, string[]> W = new Dictionary<string, string[]>
        {
            /* ---------------------------------------------- Kopfzeile */
            { "Noch nicht eingerichtet",
              new[] { "Not set up yet", "尚未设置",
                      "まだ設定されていません" } },
            { "Öffne oben rechts das Zahnrad und trag Token und Bildschirm ein.",
              new[] { "Open the gear at the top right and set your token and screen.",
                      "点击右上角的齿轮，填写令牌并选择屏幕。",
                      "右上の歯車を開き、トークンと画面を設定してください。" } },
            { "Beides muss eingetragen sein, sonst wird nichts gesendet: der Token sagt, wer du bist, der Bildschirm, wo Meccha läuft.",
              new[] { "Both are required, otherwise nothing is sent: the token says who you are, the screen says where Meccha runs.",
                      "两项都必须填写，否则不会发送任何内容：令牌用于识别你的身份，屏幕用于指明 Meccha 的运行位置。",
                      "両方とも必要です。トークンはあなたが誰かを示し、画面は Meccha が動いている場所を示します。" } },
            { "Bereit  –  {0} drücken",
              new[] { "Ready  –  press {0}", "就绪  –  按 {0}",
                      "準備完了  –  {0} を押してください" } },
            { "Deine Zeile steht da, aber die Punktzahl war nicht zu lesen. Stell dich vor etwas Ruhiges – Himmel oder eine Wand – und drück nochmal. Kein Wartezimmer, du kannst es sofort nochmal versuchen.",
              new[] { "Your row was found, but the score could not be read. Face something plain – the sky or a wall – and press again. Nothing was queued, you can retry right away.",
                      "找到了你的那一行，但分数无法识别。请面向单调的背景（天空或墙壁）再按一次。没有进入队列，你可以立即重试。",
                      "あなたの行は見つかりましたが、スコアを読み取れませんでした。空や壁など無地の背景を向いてもう一度押してください。順番待ちにはなっていないので、すぐに再試行できます。" } },
            { "Erst am Ende der Runde drücken – die Punkte laufen bis zuletzt weiter.",
              new[] { "Press only at the end of the round – the score keeps changing until the last second.",
                      "请在回合结束时再按 – 分数会一直变动到最后一秒。",
                      "ラウンドが終わってから押してください – スコアは最後の瞬間まで変わります。" } },
            { "({0} in der Warteschlange)",
              new[] { "({0} queued)", "（{0} 个排队中）",
                      "（{0} 件待機中）" } },
            { "Zugang wird geprüft …",
              new[] { "Checking access …", "正在检查访问权限 …",
                      "アクセス権を確認中 …" } },
            { "Zugang GESPERRT",
              new[] { "Access BLOCKED", "访问已封禁",
                      "アクセス禁止" } },
            { "Zugang unklar",
              new[] { "Access unclear", "访问状态不明",
                      "アクセス状態が不明" } },
            { "ganze Lobby",
              new[] { "whole lobby", "整个房间",
                      "ロビー全体" } },
            { "Im Spiel: {0}",
              new[] { "In game: {0}", "游戏内：{0}",
                      "ゲーム内: {0}" } },
            { "kein Name hinterlegt",
              new[] { "no name stored", "未填写名称",
                      "名前が未登録" } },
            { "in der Wertung",
              new[] { "ranked", "已进入排名",
                      "ランキング入り" } },
            { "{0}/{1} bis zur Wertung",
              new[] { "{0}/{1} until ranked", "{0}/{1} 进入排名",
                      "ランキングまで {0}/{1}" } },
            { "Bildschirm {0}",
              new[] { "Screen {0}", "屏幕 {0}",
                      "画面 {0}" } },
            /* Frueher stand dieser Hinweis klein in der Kopfzeile und
               verwies auf "Zugang holen". Jetzt fuellt er den Kasten
               ueber der Liste und fuehrt direkt zum Download - wer
               gesagt bekommt "neue Fassung verfuegbar", will sie holen. */
            { "Neue Fassung {0} verfügbar – hier klicken zum Herunterladen",
              new[] { "New version {0} available – click here to download",
                      "有新版本 {0} – 点击此处下载",
                      "新しいバージョン {0} があります – クリックしてダウンロード" } },
            { "Download-Seite im Browser geöffnet.",
              new[] { "Download page opened in your browser.",
                      "已在浏览器中打开下载页面。",
                      "ダウンロードページをブラウザで開きました。" } },

            /* ------------------------------------------------- Knoepfe */
            { "Jetzt aufnehmen und senden",
              new[] { "Capture and send now", "立即截图并发送",
                      "今すぐ撮影して送信" } },
            { "Aktualisieren", new[] { "Refresh", "刷新",
                      "更新" } },
            { "Beenden", new[] { "Quit", "退出",
                      "終了" } },
            { "Fenster zeigen", new[] { "Show window", "显示窗口",
                      "ウィンドウを表示" } },
            { "von {0}", new[] { "by {0}", "作者 {0}",
                      "作者 {0}" } },

            /* ------------------------------- Aufgeklappte Runde + Kasten */
            { "1 Runde wartet auf Prüfung",
              new[] { "1 round is waiting for review", "1 局正在等待审核",
                      "1 ラウンドが確認待ちです" } },
            { "{0} Runden warten auf Prüfung",
              new[] { "{0} rounds are waiting for review", "{0} 局正在等待审核",
                      "{0} ラウンドが確認待ちです" } },
            { "Zuletzt {0}", new[] { "Last: {0}", "最近：{0}",
                      "直近: {0}" } },
            { "Gelesen als", new[] { "Read as", "识别为",
                      "読み取り結果" } },
            { "deine Zeile wurde nicht gefunden",
              new[] { "your row was not found", "未找到你的那一行",
                      "あなたの行が見つかりませんでした" } },
            { "Lobby", new[] { "Lobby", "房间",
                      "ロビー" } },
            { "{0} Verstecker, du auf Rang {1}",
              new[] { "{0} hiders, you at rank {1}", "{0} 名躲藏者，你排第 {1}",
                      "隠れる側 {0} 人、あなたは {1} 位" } },
            { "{0} Verstecker", new[] { "{0} hiders", "{0} 名躲藏者",
                      "隠れる側 {0} 人" } },
            { "Eingereicht", new[] { "Submitted", "已提交",
                      "送信日時" } },
            { "Abgelehnt am", new[] { "Rejected at", "拒绝于",
                      "却下日時" } },
            { "Freigegeben am", new[] { "Approved at", "通过于",
                      "承認日時" } },
            { "Grund", new[] { "Reason", "原因",
                      "理由" } },
            { "Stand", new[] { "Status", "状态",
                      "状態" } },
            { "wartet auf die Prüfung durch einen Mod",
              new[] { "waiting for a mod to review it", "等待管理员审核",
                      "モデレーターの確認待ちです" } },
            { "Wertung", new[] { "Ranking", "排名",
                      "ランキング" } },
            { "zählt in den letzten 10",
              new[] { "counts in your last 10", "计入最近 10 局",
                      "直近 10 戦に含まれています" } },
            { "aus den letzten 10 gefallen",
              new[] { "dropped out of your last 10", "已移出最近 10 局",
                      "直近 10 戦から外れました" } },

            /* --------------------------------------------- Verlaufsliste */
            { "Zeit", new[] { "Time", "时间",
                      "時刻" } },
            { "Was", new[] { "What", "内容",
                      "内容" } },
            { "Punkte", new[] { "Points", "分数",
                      "スコア" } },
            { "Zählt", new[] { "Counts", "计入排名",
                      "有効" } },
            { "Zählt nicht mehr (aus den letzten 10 gefallen)",
              new[] { "No longer counts (dropped out of the last 10)",
                      "不再计入（已超出最近 10 局）",
                      "無効（直近 10 戦から外れました）" } },
            { "Wartet auf Prüfung",
              new[] { "Waiting for review", "等待审核",
                      "確認待ち" } },
            { "Abgelehnt: {0}", new[] { "Rejected: {0}", "已拒绝：{0}",
                      "却下: {0}" } },
            { "ohne Angabe", new[] { "no reason given", "未说明原因",
                      "理由なし" } },

            /* ------------------------------------------------- Meldungen */
            { "Nehme auf und sende …",
              new[] { "Capturing and sending …", "正在截图并发送 …",
                      "撮影して送信中 …" } },
            { "Aufnahme fehlgeschlagen: {0}",
              new[] { "Capture failed: {0}", "截图失败：{0}",
                      "撮影に失敗しました: {0}" } },
            { "liegt in der Warteschlange",
              new[] { "queued for later", "已加入队列",
                      "待機列に入りました" } },
            { "Erst den Token eintragen.",
              new[] { "Enter your token first.", "请先填写令牌。",
                      "先にトークンを入力してください。" } },
            { "{0} Runde(n) nachgereicht.",
              new[] { "{0} round(s) sent later.", "已补发 {0} 局。",
                      "{0} ラウンドを後から送信しました。" } },
            { "Wird nachgesehen …",
              new[] { "Checking …", "正在查询 …",
                      "確認中 …" } },
            { "Gespeichert.", new[] { "Saved.", "已保存。",
                      "保存しました。" } },
            { "Kontoseite im Browser geöffnet. Dort Token kopieren.",
              new[] { "Account page opened in your browser. Copy the token from there.",
                      "已在浏览器中打开账户页面，请从那里复制令牌。",
                      "アカウントページをブラウザで開きました。そこでトークンをコピーしてください。" } },
            { "Der Browser ließ sich nicht öffnen ({0}).",
              new[] { "The browser could not be opened ({0}).", "无法打开浏览器（{0}）。",
                      "ブラウザを開けませんでした（{0}）。" } },
            { "Läuft weiter. {0} funktioniert. Beenden per Rechtsklick auf das Symbol.",
              new[] { "Still running. {0} works. Right-click the tray icon to quit.",
                      "仍在运行。{0} 依然有效。右键点击托盘图标可退出。",
                      "動作を続けます。{0} は有効です。終了するにはアイコンを右クリックしてください。" } },
            { "Meccha Ranked beenden?",
              new[] { "Quit Meccha Ranked?", "退出 Meccha Ranked？",
                      "Meccha Ranked を終了しますか？" } },
            { "Danach reagiert {0} nicht mehr, und Runden werden nicht mehr verschickt.",
              new[] { "After that {0} stops working and no rounds are sent.",
                      "之后 {0} 将失效，也不会再发送对局。",
                      "終了すると {0} は反応しなくなり、ラウンドも送信されません。" } },
            { "Server nicht erreichbar.",
              new[] { "Server not reachable.", "无法连接服务器。",
                      "サーバーに接続できません。" } },
            { "Dieser Token gilt nicht (mehr).",
              new[] { "This token is not valid (any more).", "此令牌无效或已失效。",
                      "このトークンは無効です。" } },
            { "Angenommen", new[] { "Accepted", "已接受",
                      "受理されました" } },
            { "Zählt nicht: nur {0} Verstecker im Scoreboard, nötig sind {1}",
              new[] { "Does not count: only {0} hiders on the scoreboard, {1} needed",
                      "不计入：记分板上只有 {0} 名躲藏者，需要 {1} 名",
                      "無効: スコアボードに隠れる側が {0} 人しかいません。{1} 人必要です" } },

            /* --------------------------------------------- Einstellungen */
            { "Einstellungen", new[] { "Settings", "设置",
                      "設定" } },
            { "Zugang", new[] { "Access", "访问权限",
                      "アクセス" } },
            { "Aufnahme", new[] { "Capture", "截图",
                      "撮影" } },
            { "Sprache", new[] { "Language", "语言",
                      "言語" } },
            { "Token", new[] { "Token", "令牌",
                      "トークン" } },
            { "Taste", new[] { "Hotkey", "快捷键",
                      "キー" } },
            { "Ändern", new[] { "Change", "更改",
                      "変更" } },
            { "Speichern", new[] { "Save", "保存",
                      "保存" } },
            { "Abbrechen", new[] { "Cancel", "取消",
                      "キャンセル" } },
            { "Zugang holen  –  Anmeldung über Steam",
              new[] { "Get access  –  sign in with Steam", "获取访问权限  –  使用 Steam 登录",
                      "アクセスを取得  –  Steam でログイン" } },
            { "Auf welchem Bildschirm läuft Meccha?",
              new[] { "Which screen is Meccha running on?", "Meccha 在哪个屏幕上运行？",
                      "Meccha はどの画面で動いていますか？" } },
            { "Vorschau erneuern",
              new[] { "Refresh preview", "刷新预览",
                      "プレビューを更新" } },
            { "Diese Taste löst die Aufnahme aus. Das Spiel bekommt sie weiterhin.",
              new[] { "This key triggers the capture. The game still receives it.",
                      "此按键用于触发截图，游戏仍可正常接收该按键。",
                      "このキーで撮影します。ゲーム側にもキー入力は届きます。" } },
            { "Dein Zugang zum Server. Steht auf der Kontoseite.",
              new[] { "Your access to the server. You find it on the account page.",
                      "你在服务器上的访问凭证，可在账户页面找到。",
                      "サーバーへのアクセス用です。アカウントページに表示されます。" } },
            { "primärer Bildschirm", new[] { "primary screen", "主屏幕",
                      "メイン画面" } },
            { "primär", new[] { "primary", "主",
                      "メイン" } },
            { "Trag zuerst deinen Token ein. Den bekommst du auf der Kontoseite.",
              new[] { "Enter your token first. You get it from the account page.",
                      "请先填写令牌，可在账户页面获取。",
                      "先にトークンを入力してください。アカウントページで取得できます。" } },
            { "Deinen Zugang wirklich ändern?",
              new[] { "Really change your access?", "确定要更改访问凭证吗？",
                      "アクセス情報を本当に変更しますか？" } },
            { "Der eingetragene Token wird dabei entfernt. Du brauchst dann einen neuen von der Kontoseite - ohne ihn kannst du nichts mehr einreichen.",
              new[] { "The stored token will be removed. You then need a new one from the account page - without it you cannot submit anything.",
                      "已保存的令牌将被删除。之后需要从账户页面获取新令牌，否则无法提交。",
                      "入力済みのトークンは削除されます。アカウントページで新しいものを取得する必要があり、それがないと送信できなくなります。" } }
        };

        /// <summary>
        /// Welche Stelle im Feld gehoert zu welcher Sprache.
        ///
        /// Deutsch steht links als Schluessel und hat keine Stelle - es
        /// braucht keine, der Satz IST schon da.
        /// </summary>
        static int StelleVon(string kennung)
        {
            switch (kennung)
            {
                case "en": return 0;
                case "zh": return 1;
                case "ja": return 2;
                default: return -1;
            }
        }

        public static string T(string de)
        {
            if (Aktuell == "de") return de;

            string[] a;
            if (!W.TryGetValue(de, out a)) return de;

            int i = StelleVon(Aktuell);

            /*
               ZU KURZES FELD IST KEIN FEHLER, sondern der Normalfall
               beim Hinzufuegen einer Sprache.

               Frueher stand hier a[i] ohne Pruefung. Damit haette eine
               vierte Sprache bedeutet, ALLE Eintraege gleichzeitig um
               ein Element zu erweitern - sonst waere der Client beim
               ersten unuebersetzten Satz mit IndexOutOfRange
               abgestuerzt. Bei ueber achtzig Eintraegen heisst das:
               entweder alles auf einmal oder gar nicht.

               So faellt jeder noch nicht uebersetzte Satz einfach auf
               Deutsch zurueck, genau wie ein fehlender Eintrag. Man kann
               also anfangen und weitermachen.
            */
            if (i < 0 || i >= a.Length) return de;

            return string.IsNullOrEmpty(a[i]) ? de : a[i];
        }

        /// <summary>Wie T, setzt aber {0}, {1} … ein.</summary>
        public static string T(string de, params object[] werte)
        {
            string s = T(de);
            for (int i = 0; i < werte.Length; i++)
                s = s.Replace("{" + i + "}", werte[i] == null ? "" : werte[i].ToString());
            return s;
        }
    }
}

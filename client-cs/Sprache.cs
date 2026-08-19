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
        /// <summary>"en", "de" oder "zh". Wird beim Start aus client.json gesetzt.</summary>
        public static string Aktuell = "en";

        public static readonly string[] Kennungen = { "en", "de", "zh" };
        public static readonly string[] Namen = { "English", "Deutsch", "中文" };

        public static string NameVon(string kennung)
        {
            for (int i = 0; i < Kennungen.Length; i++)
                if (Kennungen[i] == kennung) return Namen[i];
            return Namen[0];
        }

        /* Reihenfolge im Feld: [0] Englisch, [1] Chinesisch.
           Deutsch steht links als Schluessel und braucht keinen Eintrag. */
        static readonly Dictionary<string, string[]> W = new Dictionary<string, string[]>
        {
            /* ---------------------------------------------- Kopfzeile */
            { "Noch nicht eingerichtet",
              new[] { "Not set up yet", "尚未设置" } },
            { "Öffne oben rechts das Zahnrad und trag Token und Bildschirm ein.",
              new[] { "Open the gear at the top right and set your token and screen.",
                      "点击右上角的齿轮，填写令牌并选择屏幕。" } },
            { "Beides muss eingetragen sein, sonst wird nichts gesendet: der Token sagt, wer du bist, der Bildschirm, wo Meccha läuft.",
              new[] { "Both are required, otherwise nothing is sent: the token says who you are, the screen says where Meccha runs.",
                      "两项都必须填写，否则不会发送任何内容：令牌用于识别你的身份，屏幕用于指明 Meccha 的运行位置。" } },
            { "Bereit  –  {0} drücken",
              new[] { "Ready  –  press {0}", "就绪  –  按 {0}" } },
            { "({0} in der Warteschlange)",
              new[] { "({0} queued)", "（{0} 个排队中）" } },
            { "Zugang wird geprüft …",
              new[] { "Checking access …", "正在检查访问权限 …" } },
            { "Zugang GESPERRT",
              new[] { "Access BLOCKED", "访问已封禁" } },
            { "Zugang unklar",
              new[] { "Access unclear", "访问状态不明" } },
            { "ganze Lobby",
              new[] { "whole lobby", "整个房间" } },
            { "Im Spiel: {0}",
              new[] { "In game: {0}", "游戏内：{0}" } },
            { "kein Name hinterlegt",
              new[] { "no name stored", "未填写名称" } },
            { "in der Wertung",
              new[] { "ranked", "已进入排名" } },
            { "{0}/{1} bis zur Wertung",
              new[] { "{0}/{1} until ranked", "{0}/{1} 进入排名" } },
            { "Bildschirm {0}",
              new[] { "Screen {0}", "屏幕 {0}" } },
            { "NEUE FASSUNG {0} verfügbar – „Zugang holen\" öffnet die Seite",
              new[] { "NEW VERSION {0} available – \"Get access\" opens the page",
                      "有新版本 {0} – 点击“获取访问权限”打开页面" } },

            /* ------------------------------------------------- Knoepfe */
            { "Jetzt aufnehmen und senden",
              new[] { "Capture and send now", "立即截图并发送" } },
            { "Aktualisieren", new[] { "Refresh", "刷新" } },
            { "Beenden", new[] { "Quit", "退出" } },
            { "Fenster zeigen", new[] { "Show window", "显示窗口" } },
            { "von {0}", new[] { "by {0}", "作者 {0}" } },

            /* --------------------------------------------- Verlaufsliste */
            { "Zeit", new[] { "Time", "时间" } },
            { "Was", new[] { "What", "内容" } },
            { "Punkte", new[] { "Points", "分数" } },
            { "Zählt", new[] { "Counts", "计入排名" } },
            { "Zählt nicht mehr (aus den letzten 10 gefallen)",
              new[] { "No longer counts (dropped out of the last 10)",
                      "不再计入（已超出最近 10 局）" } },
            { "Wartet auf Prüfung",
              new[] { "Waiting for review", "等待审核" } },
            { "Abgelehnt: {0}", new[] { "Rejected: {0}", "已拒绝：{0}" } },
            { "ohne Angabe", new[] { "no reason given", "未说明原因" } },

            /* ------------------------------------------------- Meldungen */
            { "Nehme auf und sende …",
              new[] { "Capturing and sending …", "正在截图并发送 …" } },
            { "Aufnahme fehlgeschlagen: {0}",
              new[] { "Capture failed: {0}", "截图失败：{0}" } },
            { "liegt in der Warteschlange",
              new[] { "queued for later", "已加入队列" } },
            { "Erst den Token eintragen.",
              new[] { "Enter your token first.", "请先填写令牌。" } },
            { "{0} Runde(n) nachgereicht.",
              new[] { "{0} round(s) sent later.", "已补发 {0} 局。" } },
            { "Wird nachgesehen …",
              new[] { "Checking …", "正在查询 …" } },
            { "Gespeichert.", new[] { "Saved.", "已保存。" } },
            { "Kontoseite im Browser geöffnet. Dort Token kopieren.",
              new[] { "Account page opened in your browser. Copy the token from there.",
                      "已在浏览器中打开账户页面，请从那里复制令牌。" } },
            { "Der Browser ließ sich nicht öffnen ({0}).",
              new[] { "The browser could not be opened ({0}).", "无法打开浏览器（{0}）。" } },
            { "Läuft weiter. {0} funktioniert. Beenden per Rechtsklick auf das Symbol.",
              new[] { "Still running. {0} works. Right-click the tray icon to quit.",
                      "仍在运行。{0} 依然有效。右键点击托盘图标可退出。" } },
            { "Meccha Ranked beenden?",
              new[] { "Quit Meccha Ranked?", "退出 Meccha Ranked？" } },
            { "Danach reagiert {0} nicht mehr, und Runden werden nicht mehr verschickt.",
              new[] { "After that {0} stops working and no rounds are sent.",
                      "之后 {0} 将失效，也不会再发送对局。" } },
            { "Server nicht erreichbar.",
              new[] { "Server not reachable.", "无法连接服务器。" } },
            { "Dieser Token gilt nicht (mehr).",
              new[] { "This token is not valid (any more).", "此令牌无效或已失效。" } },
            { "Angenommen", new[] { "Accepted", "已接受" } },

            /* --------------------------------------------- Einstellungen */
            { "Einstellungen", new[] { "Settings", "设置" } },
            { "Zugang", new[] { "Access", "访问权限" } },
            { "Aufnahme", new[] { "Capture", "截图" } },
            { "Sprache", new[] { "Language", "语言" } },
            { "Token", new[] { "Token", "令牌" } },
            { "Taste", new[] { "Hotkey", "快捷键" } },
            { "Ändern", new[] { "Change", "更改" } },
            { "Speichern", new[] { "Save", "保存" } },
            { "Abbrechen", new[] { "Cancel", "取消" } },
            { "Zugang holen  –  Anmeldung über Steam",
              new[] { "Get access  –  sign in with Steam", "获取访问权限  –  使用 Steam 登录" } },
            { "Auf welchem Bildschirm läuft Meccha?",
              new[] { "Which screen is Meccha running on?", "Meccha 在哪个屏幕上运行？" } },
            { "Vorschau erneuern",
              new[] { "Refresh preview", "刷新预览" } },
            { "Diese Taste löst die Aufnahme aus. Das Spiel bekommt sie weiterhin.",
              new[] { "This key triggers the capture. The game still receives it.",
                      "此按键用于触发截图，游戏仍可正常接收该按键。" } },
            { "Dein Zugang zum Server. Steht auf der Kontoseite.",
              new[] { "Your access to the server. You find it on the account page.",
                      "你在服务器上的访问凭证，可在账户页面找到。" } },
            { "primärer Bildschirm", new[] { "primary screen", "主屏幕" } },
            { "primär", new[] { "primary", "主" } },
            { "Trag zuerst deinen Token ein. Den bekommst du auf der Kontoseite.",
              new[] { "Enter your token first. You get it from the account page.",
                      "请先填写令牌，可在账户页面获取。" } },
            { "Deinen Zugang wirklich ändern?",
              new[] { "Really change your access?", "确定要更改访问凭证吗？" } },
            { "Der eingetragene Token wird dabei entfernt. Du brauchst dann einen neuen von der Kontoseite - ohne ihn kannst du nichts mehr einreichen.",
              new[] { "The stored token will be removed. You then need a new one from the account page - without it you cannot submit anything.",
                      "已保存的令牌将被删除。之后需要从账户页面获取新令牌，否则无法提交。" } }
        };

        public static string T(string de)
        {
            if (Aktuell == "de") return de;
            string[] a;
            if (!W.TryGetValue(de, out a)) return de;
            int i = (Aktuell == "zh") ? 1 : 0;
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

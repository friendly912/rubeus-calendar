/*
  utils.js
  ==============================================================
  どのファイルからも使う、小さな共通処理（ヘルパー関数）をまとめている。
  「何かのモーダルの動作」のような大きな機能ではなく、
  1〜2行で完結する計算・変換だけをここに置く方針。
*/

/*
  escapeHtml(text)
  --------------------------------------------------------------
  ユーザーが入力した文字列（テンプレート名・メモなど）を
  画面のHTMLに埋め込む前に、安全な文字列に変換する関数。

  【なぜ必要か】
  例えば予定のメモ欄に "<b>あ</b>" のような文字を入力したとき、
  そのまま画面のHTMLに差し込んでしまうと、ブラウザがそれを
  本物のHTMLタグとして解釈してしまう。
  もし悪意のある文字列（例: <img src=x onerror=...>）が
  入力された場合、他人が仕込んだスクリプトが実行されてしまう
  危険がある（この問題を「XSS」と呼ぶ）。

  この関数を通してから画面に表示することで、
  <, >, &, ", ' といった特別な意味を持つ文字を
  「ただの文字」として安全に表示できるようにする。

  【影響範囲】
  テンプレート名・メモなど「ユーザーが自由入力できる文字列」を
  innerHTML で画面に差し込む箇所では、必ずこの関数を通すこと。
  （プルダウンの選択肢や、こちらで固定した文言には不要）
*/
function escapeHtml(text) {
    if (text === null || text === undefined) return "";
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/*
  linkifyMemo(text)
  --------------------------------------------------------------
  メモ本文中のURL（http:// / https:// で始まる部分）を、タップ・クリックすると
  新しいタブで開けるリンクに変換する。

  【安全性について】
  まず escapeHtml() で文字列全体を無害化してから、URLらしき部分だけを
  <a>タグに置き換えている。そのためURL以外の部分に <, > 等が含まれていても
  escapeHtml と同じ安全性のまま、そのままの文字として表示される。
  リンクは target="_blank" + rel="noopener noreferrer" で開き、
  リンクをタップした時に親要素のクリック処理（予定詳細を開く等）が
  一緒に発火しないよう、リンク自身に stopPropagation を仕込んでいる。
*/
function linkifyMemo(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
        // 文末の句読点・閉じ括弧がURLに巻き込まれた場合は、リンクの範囲から外す
        const trailingMatch = url.match(/[)\]」』、。.,!?]+$/);
        const trailing = trailingMatch ? trailingMatch[0] : '';
        const cleanUrl = trailing ? url.slice(0, -trailing.length) : url;
        if (!cleanUrl) return url;
        return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${cleanUrl}</a>${trailing}`;
    });
}

/*
  timeToMinutes(timeStr)
  --------------------------------------------------------------
  "10:30" のような時刻文字列を「0時0分からの経過分数」に変換する。
  例: "10:30" → 630分

  時刻が入力されていない予定（終日の予定など）は、
  一覧の並び順で一番最後に来てほしいので、
  そのような場合は「1440分（24時間分）」という
  実際にはありえない大きな値を返すようにしている。
  これにより、時刻ありの予定→時刻なしの予定 の順で並ぶ。
*/
function timeToMinutes(timeStr) {
    if (!timeStr) return 1440;
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
}

/*
  getTimeDisplay(ev)
  --------------------------------------------------------------
  予定オブジェクトの開始・終了時刻から、画面に表示する文字列を作る。
  開始・終了の両方/片方/どちらもない、の4パターンに対応している。
*/
function getTimeDisplay(ev) {
    if (!ev.startTime && !ev.endTime) return '終日';
    if (!ev.startTime) return `〜 ${ev.endTime}`;
    if (!ev.endTime) return `${ev.startTime} 〜`;
    return `${ev.startTime} 〜 ${ev.endTime}`;
}

/*
  isEndTimeDisabled(hour, minute, startTimeStr, isMultiDay)
  --------------------------------------------------------------
  時刻選択の「分」ボタンを表示するときに、
  そのボタンを選べないようにする（disabled）べきかどうかを判定する。

  ルール：
  ・連日予定（isMultiDay = true）の場合は制限なし
    （例：22:00開始→翌日06:00終了、のような日をまたぐ予定を許可するため）
  ・同日予定の場合は「終了時刻は開始時刻より後」でなければならない
    （開始 10:30 なら、終了は 10:31 以降しか選べない）
*/
function isEndTimeDisabled(hour, minute, startTimeStr, isMultiDay) {
    if (!startTimeStr) return false;
    if (isMultiDay) return false;
    const [startHour, startMinute] = startTimeStr.split(':').map(Number);
    const endTotal = hour * 60 + minute;
    const startTotal = startHour * 60 + startMinute;
    return endTotal <= startTotal;
}

/*
  formatDateKey(year, month, day)
  --------------------------------------------------------------
  年・月（0始まり）・日から、"2026-08-05" のような
  データ保存用の日付キー文字列を作る。
  月と日は1桁の場合に先頭へ0を付ける（padStart）。
*/
function formatDateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toDateKey(value) {
    const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
}

function dateKeyInRange(target, start, end) {
    const t = toDateKey(target);
    const a = toDateKey(start);
    const b = toDateKey(end);
    return !!(t && a && b && t >= a && t <= b);
}

function findTemplateForEvent(ev) {
    const name = String((ev && ev.template) || '').trim();
    let index = -1;
    if (ev && ev.templateId != null && ev.templateId !== '') {
        index = templates.findIndex((t) => String(t.id) === String(ev.templateId));
    }
    if (index < 0 && name) {
        index = templates.findIndex((t) => String(t.name || '').trim() === name);
    }
    return {
        index: index,
        temp: index >= 0 ? templates[index] : null
    };
}

function renameTemplateOnEvents(oldName, newName, templateId) {
    if (!oldName || oldName === newName) return;
    Object.keys(schedules || {}).forEach((key) => {
        (schedules[key] || []).forEach((ev) => {
            if (ev && ev.template === oldName) {
                ev.template = newName;
                if (templateId != null) ev.templateId = templateId;
            }
        });
    });
}

/*
  getCircledNumber(n)
  --------------------------------------------------------------
  1 → "①"、2 → "②" のような、丸で囲んだ数字の文字を返す。
  Mobile版のカレンダー形式で、文字を表示しない色マーカー（.event-compact）に
  「月の中で何番目に登場した予定か」だけを小さく示すために使っている
  （詳しくは calendar.js を参照）。
  ①〜⑳（1〜20）はUnicodeにまとまった専用の文字があるのでそれを使い、
  それより多い場合は普通の数字をそのまま返す（滅多に無いはずだが念のため）。
*/
function getCircledNumber(n) {
    if (n >= 1 && n <= 20) return String.fromCodePoint(0x2460 + n - 1);
    return String(n);
}

/*
  削除不具合の調査用ログ。
  画面右下に出す。邪魔なら「隠す」。再表示は ?debug=1
*/
const CALENDAR_DEBUG_VERSION = '20260824a';
const CALENDAR_DEBUG_LIMIT = 40;
const calendarDebugLines = [];
let calendarDebugPanel = null;
let calendarDebugBody = null;

function isCalendarDebugEnabled() {
    try {
        const q = String(location.search || '');
        if (/[?&]debug=0(?:&|$)/.test(q)) return false;
        if (/[?&]debug=1(?:&|$)/.test(q)) return true;
        const saved = localStorage.getItem('calendarDebug');
        if (saved === '0') return false;
        if (saved === '1') return true;
    } catch (e) {
        // ignore
    }
    return false;
}

function countScheduleEvents(data) {
    const src = data || (typeof schedules === 'undefined' ? null : schedules);
    if (!src || typeof src !== 'object') return 0;
    return Object.keys(src).reduce((n, key) => {
        const list = src[key];
        if (Array.isArray(list)) return n + list.length;
        if (list && typeof list === 'object') return n + Object.keys(list).length;
        return n;
    }, 0);
}

function ensureCalendarDebugPanel() {
    if (calendarDebugPanel || !isCalendarDebugEnabled() || !document.body) return;
    const style = document.createElement('style');
    style.textContent = [
        '#calendarDebugPanel{position:fixed;right:8px;bottom:8px;z-index:99999;width:min(420px,calc(100vw - 16px));',
        'background:rgba(0,0,0,.88);color:#9f9;font:12px/1.4 ui-monospace,Consolas,monospace;',
        'border:1px solid #4a4;border-radius:8px;padding:8px;max-height:36vh;display:flex;flex-direction:column;gap:6px;}',
        '#calendarDebugPanel header{display:flex;gap:6px;align-items:center;color:#cfc;font-size:11px;}',
        '#calendarDebugPanel header b{flex:1;}',
        '#calendarDebugPanel button{font-size:11px;padding:2px 8px;cursor:pointer;}',
        '#calendarDebugBody{overflow:auto;white-space:pre-wrap;word-break:break-all;min-height:4em;}',
        '#calendarDebugShow{position:fixed;right:8px;bottom:8px;z-index:99999;display:none;}'
    ].join('');
    document.head.appendChild(style);

    calendarDebugPanel = document.createElement('div');
    calendarDebugPanel.id = 'calendarDebugPanel';
    calendarDebugPanel.innerHTML = '<header><b>削除調査ログ ' + CALENDAR_DEBUG_VERSION + '</b>' +
        '<button type="button" id="calendarDebugCopy">コピー</button>' +
        '<button type="button" id="calendarDebugHide">隠す</button></header>' +
        '<div id="calendarDebugBody"></div>';
    document.body.appendChild(calendarDebugPanel);
    calendarDebugBody = document.getElementById('calendarDebugBody');

    const showBtn = document.createElement('button');
    showBtn.id = 'calendarDebugShow';
    showBtn.type = 'button';
    showBtn.textContent = '調査ログ';
    document.body.appendChild(showBtn);

    document.getElementById('calendarDebugCopy').onclick = function () {
        const text = calendarDebugLines.join('\n');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () {
                window.prompt('ログをコピーしてください', text);
            });
        } else {
            window.prompt('ログをコピーしてください', text);
        }
    };
    document.getElementById('calendarDebugHide').onclick = function () {
        try { localStorage.setItem('calendarDebug', '0'); } catch (e) {}
        calendarDebugPanel.style.display = 'none';
        showBtn.style.display = 'block';
    };
    showBtn.onclick = function () {
        try { localStorage.setItem('calendarDebug', '1'); } catch (e) {}
        calendarDebugPanel.style.display = 'flex';
        showBtn.style.display = 'none';
    };
}

function dbg(message, extra) {
    const time = new Date().toISOString().slice(11, 23);
    let line = time + ' ' + String(message || '');
    if (extra !== undefined) {
        try {
            line += ' ' + JSON.stringify(extra);
        } catch (e) {
            line += ' [unserializable]';
        }
    }
    calendarDebugLines.push(line);
    while (calendarDebugLines.length > CALENDAR_DEBUG_LIMIT) calendarDebugLines.shift();
    console.log('[calendar-debug]', message, extra === undefined ? '' : extra);
    if (!isCalendarDebugEnabled()) return;
    ensureCalendarDebugPanel();
    if (calendarDebugBody) {
        calendarDebugBody.textContent = calendarDebugLines.join('\n');
        calendarDebugBody.scrollTop = calendarDebugBody.scrollHeight;
    }
}

window.dbg = dbg;
window.countScheduleEvents = countScheduleEvents;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        ensureCalendarDebugPanel();
        dbg('ready', { href: location.href, ver: CALENDAR_DEBUG_VERSION });
    });
} else {
    ensureCalendarDebugPanel();
    dbg('ready', { href: location.href, ver: CALENDAR_DEBUG_VERSION });
}

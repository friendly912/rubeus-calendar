/*
  search.js
  ==============================================================
  検索機能を担当するファイル。検索には2種類ある。

  1. 入力中のリアルタイム検索（incrementalSearch）
     検索欄に文字を打つたびに、今表示している月の中で
     該当する予定だけをカレンダー上でハイライトする。

  2. Enter/検索ボタンによる全体検索（performGlobalSearch）
     全期間のデータから該当する予定を探し、
     「該当する年月」の一覧をモーダルで表示する。

  【旧バージョンで見つかった不具合と、その修正内容】
  以前は、予定を追加・編集・コピー・時刻変更した直後、
  検索用キャッシュ（allEventsCache）の更新（rebuildAllEventsCache）が
  一部の保存処理から呼ばれておらず、入力中のリアルタイム検索（1）に
  追加・編集したばかりの予定が反映されないことがあった。
  今回のリビルドで、データを変更するすべての箇所から
  rebuildAllEventsCache() を呼ぶよう統一したため、この問題は解消されている
  （このファイル自体の検索ロジックは変更していない）。

  なお、全体検索（2）は常に schedules を直接見ているため、
  そもそも旧バージョンでもこの不具合の影響を受けていなかった。
*/

let applyingSearchFromCloud = false;
let lastLocalSearchEditAt = 0;
let searchSyncTimer = null;

function isSearchActive() {
    const el = document.getElementById('search');
    return !!(el && el.value.trim());
}

function applyTemplateNameToSearch(name) {
    const searchInput = document.getElementById('search');
    if (!searchInput || !name) return;
    searchInput.value = name;
    handleSearchInput();
}

function applySearchTermFromCloud(term, remoteAt) {
    const searchInput = document.getElementById('search');
    if (!searchInput) return;
    const next = term == null ? '' : String(term);
    const remoteMs = remoteAt ? Date.parse(remoteAt) : 0;
    if (remoteMs && lastLocalSearchEditAt && remoteMs < lastLocalSearchEditAt) return;
    if (searchInput.value === next) {
        if (remoteMs) lastLocalSearchEditAt = Math.max(lastLocalSearchEditAt, remoteMs);
        return;
    }
    applyingSearchFromCloud = true;
    try {
        if (remoteMs) lastLocalSearchEditAt = remoteMs;
        searchInput.value = next;
        updateClearButton();
        generateCalendar();
    } finally {
        applyingSearchFromCloud = false;
    }
}

function scheduleSearchSync() {
    if (applyingSearchFromCloud) return;
    lastLocalSearchEditAt = Date.now();
    if (searchSyncTimer) clearTimeout(searchSyncTimer);
    searchSyncTimer = setTimeout(() => {
        searchSyncTimer = null;
        const el = document.getElementById('search');
        const q = el ? el.value : '';
        if (typeof syncSearchQueryToCloud === 'function') syncSearchQueryToCloud(q);
    }, 400);
}

/*
  updateClearButton()
  --------------------------------------------------------------
  検索欄に文字が入力されているかどうかで、
  「×（クリア）」ボタンの表示・非表示と、検索欄の発光演出を切り替える。
*/
function updateClearButton() {
    const searchInput = document.getElementById('search');
    const clearBtn = document.getElementById('clearBtn');
    if (searchInput.value.trim() !== "") {
        clearBtn.classList.add('visible');
        searchInput.classList.add('searching');
    } else {
        clearBtn.classList.remove('visible');
        searchInput.classList.remove('searching');
    }
    const addBtn = document.getElementById('addEventFromListBtn');
    if (addBtn) addBtn.style.display = isSearchActive() ? 'none' : '';
}

/*
  clearSearch()
  --------------------------------------------------------------
  検索欄の「×」ボタンの処理。検索文字を消し、通常のカレンダー表示に戻す。
*/
function clearSearch() {
    const searchInput = document.getElementById('search');
    searchInput.value = '';
    updateClearButton();
    generateCalendar();
    scheduleSearchSync();
    searchInput.focus();
}

/*
  handleSearchInput()
  --------------------------------------------------------------
  検索欄の文字が変わるたびに呼ばれる（キー入力・変換確定・貼り付けを含む）。
  今表示している月の中で該当する予定だけを絞り込み、他端末へも少し遅れて同期する。
*/
function handleSearchInput() {
    updateClearButton();
    const searchInput = document.getElementById('search');
    const currentTerm = searchInput.value;
    scheduleSearchSync();

    if (!currentTerm.trim()) {
        generateCalendar();
        return;
    }

    generateCalendar(incrementalSearch(currentTerm));
}

/*
  handleSearchKeyup(e)
  --------------------------------------------------------------
  Enterキーが押された場合は全体検索（月単位の検索結果）を実行する。
*/
function handleSearchKeyup(e) {
    if (e.key === "Enter") {
        performGlobalSearch();
    }
}

/*
  incrementalSearch(newTerm)
  --------------------------------------------------------------
  allEventsCache（全予定の一覧キャッシュ）から、
  テンプレート名・開始時刻・終了時刻・メモのいずれかに
  検索文字を含む予定を探し、該当する日付の一覧を返す。
  大文字小文字は区別しない（toLowerCase）。
*/
function incrementalSearch(newTerm) {
    const term = newTerm.toLowerCase().trim();
    if (!term) return null;

    const results = allEventsCache.filter(item => {
        const ev = item.event;
        const nameMatch = ev.template.toLowerCase().includes(term);
        const timeMatch = (ev.startTime || "").includes(term) || (ev.endTime || "").includes(term);
        const memoMatch = (ev.memo || "").toLowerCase().includes(term);
        return nameMatch || timeMatch || memoMatch;
    });

    const hitDates = [...new Set(results.map(r => r.dateKey))];
    return hitDates.length > 0 ? hitDates : null;
}

/*
  performGlobalSearch()
  --------------------------------------------------------------
  検索ボタン/Enterで実行する全体検索。
  全期間の schedules を直接見て、検索文字に一致する予定が
  1件でもある「年月」をすべて抽出し、検索結果モーダルに一覧表示する。
*/
function performGlobalSearch() {
    const searchTerm = document.getElementById('search').value.toLowerCase().trim();
    if (!searchTerm) return;

    const monthsSet = new Set();
    Object.keys(schedules).forEach(dateKey => {
        let hasMatch = false;
        (schedules[dateKey] || []).forEach(ev => {
            const nameMatch = ev.template.toLowerCase().includes(searchTerm);
            const timeMatch = (ev.startTime || "").includes(searchTerm) || (ev.endTime || "").includes(searchTerm);
            const memoMatch = (ev.memo || "").toLowerCase().includes(searchTerm);
            if (nameMatch || timeMatch || memoMatch) hasMatch = true;
        });
        if (hasMatch) {
            const [y, m] = dateKey.split('-');
            monthsSet.add(`${y}年 ${parseInt(m)}月`);
        }
    });

    const monthList = Array.from(monthsSet).sort();
    if (monthList.length === 0) {
        alert("一致する予定はありません");
        return;
    }
    renderSearchMonthList(monthList);
    document.getElementById('searchResultsModal').style.display = 'flex';
}

/*
  renderSearchMonthList(months)
  --------------------------------------------------------------
  検索結果モーダルに「該当する年月」の一覧を描画する。
  クリックするとその年月のカレンダー表示に移動する。
*/
function renderSearchMonthList(months) {
    const cont = document.getElementById('searchMonthList');
    cont.innerHTML = '';
    months.forEach(mstr => {
        const div = document.createElement('div');
        div.className = 'end-date-option';
        div.textContent = mstr;
        div.onclick = () => {
            const match = mstr.match(/(\d+)年 (\d+)月/);
            if (match) {
                currentYear = parseInt(match[1]);
                currentMonth = parseInt(match[2]) - 1;
                updateTitle();
                closeSearchResultsModal();
                generateCalendar();
            }
        };
        cont.appendChild(div);
    });
}

function closeSearchResultsModal() {
    document.getElementById('searchResultsModal').style.display = 'none';
}

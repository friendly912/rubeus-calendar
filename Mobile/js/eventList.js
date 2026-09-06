/*
  【重要】このファイルはPC版（../PC/js/eventList.js）と全く同じ中身です。
  カレンダーの動作ロジックはPCでもスマホでも共通にするため、あえて複製しています。
  そのため、動作に関する修正（バグ修正・仕様変更）をする場合は、
  必ずPC版とMobile版の両方の同名ファイルを同時に直してください。
  （画面の見た目やレイアウトだけの変更なら、CSS側だけを直せば済みます）
*/

/*
  eventList.js
  ==============================================================
  「○月○日の予定一覧」モーダルを担当するファイル。
  予定が複数ある日付をクリックしたときに表示される、
  その日の予定を一覧表示する画面。
*/

/*
  showEventList(dateKey, day)
  --------------------------------------------------------------
  指定日の予定一覧モーダルを開く。
*/
function showEventList(dateKey, day) {
    if (multiSelectMode) return;
    currentListDateKey = dateKey;
    const container = document.getElementById('eventListContainer');
    container.innerHTML = '';
    document.getElementById('listDateTitle').textContent = `${currentMonth + 1}月${day}日`;
    let events = getEventsForDate(dateKey);

    if (events.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#888;padding:40px 0;">予定はありません</p>';
    } else {
        events.forEach((ev) => {
            const found = (typeof findTemplateForEvent === 'function') ? findTemplateForEvent(ev) : { temp: null };
            const temp = found.temp || { color: '#888' };
            const div = document.createElement('div');
            // 【2026-09-06 修正】背景・時刻の文字色が #1a1a22 / #77ccff に
            // 直書きされており、これは初期のダークテーマの色そのものだったため、
            // パステル/アナスイなど他のテーマに切り替えても常にダーク配色のまま
            // 表示されてしまっていた。var(--color-input-bg) / var(--color-accent-2)
            // に差し替え、選んでいるテーマの色にきちんと従うようにしている。
            div.style.cssText = `display:flex; background:var(--color-input-bg); padding:12px; margin:6px 0; border-radius:8px; cursor:pointer;`;
            // 【旧バージョンの不具合修正】
            // ev.template（テンプレート名）と ev.memo（メモ本文）は
            // どちらもユーザーが自由入力できる文字列。
            // 以前はエスケープせずそのままinnerHTMLに埋め込んでいたため、
            // メモに <, > を含む文字を入力すると意図しないHTMLとして解釈される
            // 危険があった（詳しくは utils.js の escapeHtml のコメントを参照）。
            // ここでは両方とも escapeHtml() を通してから埋め込む。
            div.innerHTML = `
                <div style="width:6px; background:${temp.color}; border-radius:3px; margin-right:12px;"></div>
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:bold;">${escapeHtml(ev.template)}</div>
                    <div style="color:var(--color-accent-2);font-size:14px;">${escapeHtml(getTimeDisplay(ev))}</div>
                    ${ev.memo ? `<div style="margin-top:6px;font-size:13px;color:#bbb;overflow-wrap:break-word;word-break:break-all;">${linkifyMemo(ev.memo)}</div>` : ''}
                </div>
            `;
            div.onclick = () => {
                const idx = schedules[ev.startDate] ? schedules[ev.startDate].findIndex(item => item.id === ev.id) : -1;
                if (idx < 0) return;
                showEventDetail(ev.startDate, idx);
            };
            container.appendChild(div);
        });
    }
    document.getElementById('eventListModal').style.display = 'flex';
}

function closeEventListModal() {
    document.getElementById('eventListModal').style.display = 'none';
}

/*
  openAddWizardFromList()
  --------------------------------------------------------------
  予定一覧モーダルの「＋ 新しい予定を追加」ボタンの処理。
  一覧モーダルを閉じてから、少し間を置いて（180ms）
  同じ日付を対象にウィザードを開く
  （閉じるアニメーションと開くタイミングが重ならないようにするため）。
*/
function openAddWizardFromList() {
    closeEventListModal();
    setTimeout(() => openAddWizard(currentListDateKey), 180);
}

/*
  deleteAllEventsOnDate()
  --------------------------------------------------------------
  「この日の予定をすべて削除」ボタンの処理。
  設定で確認をONにしている場合は確認モーダルを出し、
  OFFの場合は即座に削除を実行する。
*/
function deleteAllEventsOnDate() {
    if (!currentListDateKey) return;
    currentBulkDeleteDateKey = currentListDateKey;

    if (!confirmBeforeDelete) {
        performBulkDelete();
        return;
    }

    const day = new Date(currentListDateKey).getDate();
    document.getElementById('deleteConfirmText').innerHTML =
        `本当に <strong>${currentMonth + 1}月${day}日</strong> の予定をすべて削除しますか？<br>（連日予定も含む）`;
    document.getElementById('deleteConfirmModal').style.display = 'flex';
}

/*
  performBulkDelete()
  --------------------------------------------------------------
  「この日の予定をすべて削除」の実処理。

  【重要な仕様】
  currentBulkDeleteDateKeyの日付「そのもの」に保存されている予定だけでなく、
  その日を含む連日予定（例：8/5〜8/10の予定を、8/7から削除しようとした場合）も
  削除の対象にする。開始日・終了日の期間の中に対象日が含まれているかどうかで判定している。
*/
function performBulkDelete() {
    if (!currentBulkDeleteDateKey) return;

    Object.keys(schedules).forEach(startKey => {
        if (!schedules[startKey]) return;
        for (let i = schedules[startKey].length - 1; i >= 0; i--) {
            const ev = schedules[startKey][i];
            if (!ev.startDate || !ev.endDate) continue;
            if (dateKeyInRange(currentBulkDeleteDateKey, ev.startDate, ev.endDate)) {
                schedules[startKey].splice(i, 1);
            }
        }
        if (schedules[startKey].length === 0) {
            delete schedules[startKey];
        }
    });

    saveAllData();
    rebuildAllEventsCache();
    generateCalendar();

    document.getElementById('eventListModal').style.display = 'none';
    document.getElementById('deleteConfirmModal').style.display = 'none';

    currentBulkDeleteDateKey = null;
}

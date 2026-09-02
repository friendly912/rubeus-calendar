/*
  【重要】このファイルはPC版（../PC/js/deleteConfirm.js）と全く同じ中身です。
  カレンダーの動作ロジックはPCでもスマホでも共通にするため、あえて複製しています。
  そのため、動作に関する修正（バグ修正・仕様変更）をする場合は、
  必ずPC版とMobile版の両方の同名ファイルを同時に直してください。
  （画面の見た目やレイアウトだけの変更なら、CSS側だけを直せば済みます）
*/

/*
  deleteConfirm.js
  ==============================================================
  削除確認モーダル（画面中央に出る「削除確認」のポップアップ）の
  共通処理をまとめたファイル。

  このモーダルは、以下の4つの場面すべてから共通で使われる：
   ・予定詳細からの1件削除          （eventDetail.js の deleteFromDetail）
   ・テンプレートの削除             （templates.js の deleteTemplate）
   ・「この日の予定をすべて削除」   （eventList.js の deleteAllEventsOnDate）
   ・複数選択モードの一括削除       （multiSelect.js の bulkDeleteSelected）

  「どれを削除しようとしているか」は、呼び出し元があらかじめ
  currentDeleteTarget / currentBulkDeleteDateKey / selectedDates のいずれかに
  情報を入れておき、実際に「削除する」ボタンが押された時に
  confirmDelete() がそれを見て判断する、という作りになっている。
*/

function removeScheduledEvent(target) {
    if (!target) return false;
    const id = target.id;
    if (id != null && id !== '') {
        let removed = false;
        Object.keys(schedules).forEach((key) => {
            const list = schedules[key];
            if (!list) return;
            const i = list.findIndex((ev) => ev && ev.id === id);
            if (i >= 0) {
                list.splice(i, 1);
                if (list.length === 0) delete schedules[key];
                removed = true;
            }
        });
        if (removed) return true;
    }
    const dateKey = target.dateKey;
    const index = target.index;
    if (dateKey && schedules[dateKey] && index >= 0 && schedules[dateKey][index]) {
        schedules[dateKey].splice(index, 1);
        if (schedules[dateKey].length === 0) delete schedules[dateKey];
        return true;
    }
    return false;
}

/*
  confirmDelete()
  --------------------------------------------------------------
  削除確認モーダルの「削除する」ボタンの処理。
  以下の優先順位で「何を削除する場面なのか」を判定する。
   1. currentDeleteTarget がある     → テンプレート削除 / 予定1件削除
   2. currentBulkDeleteDateKey がある → その日の予定をすべて削除
   3. 複数選択モードで選択日がある   → 選択した日の一括削除
*/
let confirmDeleteBusy = false;

function confirmDelete() {
    if (confirmDeleteBusy) return;
    confirmDeleteBusy = true;
    const modal = document.getElementById('deleteConfirmModal');
    try {
        if (typeof dbg === 'function') {
            dbg('confirmDelete', {
                target: currentDeleteTarget,
                bulk: currentBulkDeleteDateKey,
                multi: !!multiSelectMode,
                selected: selectedDates ? selectedDates.size : 0,
                events: (typeof countScheduleEvents === 'function') ? countScheduleEvents() : -1
            });
        }

        if (currentDeleteTarget) {
            const deletedEvent = currentDeleteTarget.type === 'event';
            const target = currentDeleteTarget;
            if (target.type === 'template') {
                templates = templates.filter(t => t.id !== target.id);
                if (typeof dbg === 'function') dbg('deleted template', { id: target.id });
            } else if (target.type === 'event') {
                const ok = removeScheduledEvent(target);
                if (typeof dbg === 'function') {
                    dbg('deleted event', {
                        ok: ok,
                        id: target.id,
                        dateKey: target.dateKey,
                        eventsAfter: (typeof countScheduleEvents === 'function') ? countScheduleEvents() : -1
                    });
                }
            }
            currentDeleteTarget = null;
            currentBulkDeleteDateKey = null;
            saveAllData();
            rebuildAllEventsCache();
            generateCalendar();
            renderTemplates();
            if (modal) modal.style.display = 'none';
            if (deletedEvent) refreshOpenEventListAfterDelete();
            return;
        }

        if (currentBulkDeleteDateKey) {
            if (typeof dbg === 'function') dbg('confirm bulk', { date: currentBulkDeleteDateKey });
            performBulkDelete();
            return;
        }

        if (multiSelectMode && selectedDates.size > 0) {
            if (typeof dbg === 'function') dbg('confirm multi', { selected: selectedDates.size });
            performMultiBulkDelete();
            return;
        }

        if (typeof dbg === 'function') dbg('confirmDelete no-target');
        if (modal) modal.style.display = 'none';
    } catch (e) {
        if (typeof dbg === 'function') dbg('confirmDelete ERROR', { err: String((e && e.message) || e), stack: e && e.stack });
        console.warn('confirmDelete failed', e);
        if (modal) modal.style.display = 'none';
    } finally {
        confirmDeleteBusy = false;
    }
}

/*
  refreshOpenEventListAfterDelete()
  --------------------------------------------------------------
  予定1件を消したあと、裏側に残っている「その日の予定一覧」を
  作り直す（または予定が0件なら閉じる）。
  これをしないと、消した予定が一覧に残って見え、削除できていないように見える。
*/
function refreshOpenEventListAfterDelete() {
    const listModal = document.getElementById('eventListModal');
    if (!listModal || listModal.style.display !== 'flex' || !currentListDateKey) return;
    const events = (typeof getEventsForDate === 'function') ? getEventsForDate(currentListDateKey) : [];
    if (!events.length) {
        listModal.style.display = 'none';
        return;
    }
    const day = Number(String(currentListDateKey).split('-')[2]);
    showEventList(currentListDateKey, day);
}

function cancelDelete() {
    if (typeof dbg === 'function') dbg('cancelDelete');
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) modal.style.display = 'none';
    currentDeleteTarget = null;
    currentBulkDeleteDateKey = null;
}

(function bindDeleteConfirmButtons() {
    const modal = document.getElementById('deleteConfirmModal');
    const cancelBtn = document.getElementById('deleteConfirmCancelBtn');
    const okBtn = document.getElementById('deleteConfirmOkBtn');
    if (typeof dbg === 'function') {
        dbg('bindDeleteConfirm', { modal: !!modal, ok: !!okBtn, cancel: !!cancelBtn });
    }
    if (!modal) return;
    modal.addEventListener('click', (e) => {
        if (e.target === modal) cancelDelete();
    });
    const box = modal.querySelector('.delete-confirm-box');
    if (box) {
        box.addEventListener('click', (e) => e.stopPropagation());
    }
})();

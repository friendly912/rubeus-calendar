/*
  【重要】このファイルはPC版（../PC/js/multiSelect.js）と全く同じ中身です。
  カレンダーの動作ロジックはPCでもスマホでも共通にするため、あえて複製しています。
  そのため、動作に関する修正（バグ修正・仕様変更）をする場合は、
  必ずPC版とMobile版の両方の同名ファイルを同時に直してください。
  （画面の見た目やレイアウトだけの変更なら、CSS側だけを直せば済みます）
*/

/*
  multiSelect.js
  ==============================================================
  複数の日付を選んで、まとめて予定を削除する「複数選択モード」を担当するファイル。

  開始のきっかけは2つ（calendar.js のイベント登録から呼ばれる）：
   ・デスクトップ：予定がある日を右クリック
   ・タッチ端末　：予定がある日を約550ms長押し
  （この開始トリガー自体は今後も変更しない、というのがクライアントの希望仕様）
*/

/*
  enterMultiSelectMode(dateKey)
  --------------------------------------------------------------
  複数選択モードを開始し、最初にクリックした日付を選択状態にする。
*/
function enterMultiSelectMode(dateKey) {
    if (multiSelectMode) return; // 既にモード中なら何もしない（二重開始を防ぐ）
    multiSelectMode = true;
    selectedDates.clear();
    document.getElementById('multiSelectStatus').style.display = 'flex';
    toggleDateSelection(dateKey);
}

/*
  toggleDateSelection(dateKey)
  --------------------------------------------------------------
  複数選択モード中に日付をクリックしたときの選択/選択解除の切り替え。
  選択件数が0になったら、自動的に複数選択モードそのものを終了する。
*/
function toggleDateSelection(dateKey) {
    if (!multiSelectMode) return;

    if (selectedDates.has(dateKey)) {
        selectedDates.delete(dateKey);
    } else {
        selectedDates.add(dateKey);
    }

    updateMultiSelectUI();
    generateCalendar();

    if (selectedDates.size === 0) {
        exitMultiSelectMode();
    }
}

function updateMultiSelectUI() {
    document.getElementById('selectedCount').textContent = `${selectedDates.size}日選択中`;
}

function cancelMultiSelect() {
    exitMultiSelectMode();
}

function exitMultiSelectMode() {
    multiSelectMode = false;
    selectedDates.clear();
    document.getElementById('multiSelectStatus').style.display = 'none';
    generateCalendar();
}

/*
  bulkDeleteSelected()
  --------------------------------------------------------------
  「選択した日を一括削除」ボタンの処理。
  設定で確認をONにしている場合は確認モーダルを表示し、
  OFFの場合は即座に削除を実行する。
*/
function bulkDeleteSelected() {
    if (selectedDates.size === 0) return;

    if (!confirmBeforeDelete) {
        performMultiBulkDelete();
        return;
    }

    document.getElementById('deleteConfirmText').innerHTML =
        `選択した <strong>${selectedDates.size}日間</strong> の予定をすべて削除しますか？<br>（連日予定も含む）`;
    document.getElementById('deleteConfirmModal').style.display = 'flex';
}

/*
  performMultiBulkDelete()
  --------------------------------------------------------------
  選択された日付のいずれかと期間が重なる予定を、すべて削除する。

  【重要な仕様】
  「選択した日付そのものの予定」だけでなく、
  連日予定（例：8/5〜8/10）がある場合、選択日がその期間内に
  1日でも含まれていれば、その予定全体を削除の対象とする。
  （8/7だけを選んで一括削除しても、8/5〜8/10の予定全体が消える）
*/
function performMultiBulkDelete() {
    if (selectedDates.size === 0) return;

    const targetDates = new Set(selectedDates);

    Object.keys(schedules).forEach(startKey => {
        if (!schedules[startKey]) return;
        for (let i = schedules[startKey].length - 1; i >= 0; i--) {
            const ev = schedules[startKey][i];
            if (!ev.startDate || !ev.endDate) continue;

            let overlaps = false;
            for (let tDate of targetDates) {
                if (dateKeyInRange(tDate, ev.startDate, ev.endDate)) {
                    overlaps = true;
                    break;
                }
            }
            if (overlaps) {
                schedules[startKey].splice(i, 1);
            }
        }
        if (schedules[startKey].length === 0) {
            delete schedules[startKey];
        }
    });

    saveAllData();
    rebuildAllEventsCache();
    exitMultiSelectMode();
    document.getElementById('deleteConfirmModal').style.display = 'none';
}

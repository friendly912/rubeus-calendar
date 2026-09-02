/*
  【重要】このファイルはPC版（../PC/js/editTime.js）と全く同じ中身です。
  カレンダーの動作ロジックはPCでもスマホでも共通にするため、あえて複製しています。
  そのため、動作に関する修正（バグ修正・仕様変更）をする場合は、
  必ずPC版とMobile版の両方の同名ファイルを同時に直してください。
  （画面の見た目やレイアウトだけの変更なら、CSS側だけを直せば済みます）
*/

/*
  editTime.js
  ==============================================================
  「時刻を編集」モーダルを担当するファイル。
  予定詳細画面から開始時刻・終了時刻だけを後から編集するための画面。
  時刻入力UIそのものは timeSelector.js の createTimeSelector() を再利用している。
*/

/*
  openTimeEditFromDetail()
  --------------------------------------------------------------
  予定詳細モーダルの「時刻を編集」ボタンの処理。
  編集用に予定データのコピー（JSON.parse(JSON.stringify(...))）を作ってから
  currentEditEvent に入れる。コピーを使うのは、保存ボタンを押すまでは
  元の予定データを直接書き換えないようにするため
  （＝編集中にキャンセルしても元のデータが壊れないようにする安全策）。
*/
function openTimeEditFromDetail() {
    const ev = schedules[currentDetailEvent.dateKey][currentDetailEvent.index];
    currentEditEvent = { dateKey: currentDetailEvent.dateKey, index: currentDetailEvent.index, event: JSON.parse(JSON.stringify(ev)) };
    closeEventDetailModal();

    document.getElementById('editStartTimeSection').style.display = 'block';
    document.getElementById('editEndTimeSection').style.display = 'none';

    document.getElementById('editStartTimePreview').textContent = ev.startTime ? ` ${ev.startTime}` : " --:--";
    document.getElementById('editEndTimePreview').textContent = ev.endTime ? ` ${ev.endTime}` : " --:--";

    document.getElementById('editStartTimeSteps').innerHTML = '';
    document.getElementById('editEndTimeSteps').innerHTML = '';

    showEditStartTimeSelector();
    document.getElementById('editEventModal').style.display = 'flex';
}

/*
  proceedToEditEndTime()
  --------------------------------------------------------------
  「終了時刻へ進む」ボタンの処理。開始時刻を変更しない場合でも
  このボタンから直接終了時刻の編集へ進める。
*/
function proceedToEditEndTime() {
    if (!currentEditEvent) return;
    document.getElementById('editStartTimeSection').style.display = 'none';
    document.getElementById('editEndTimeSection').style.display = 'block';
    showEditEndTimeSelector();
}

function skipEditStartTime() {
    if (!currentEditEvent) return;
    currentEditEvent.event.startTime = "";
    document.getElementById('editStartTimePreview').textContent = " --:--";
    document.getElementById('editStartTimeSection').style.display = 'none';
    document.getElementById('editEndTimeSection').style.display = 'block';
    showEditEndTimeSelector();
}

function backToEditStartTimeFromEnd() {
    document.getElementById('editEndTimeSection').style.display = 'none';
    document.getElementById('editStartTimeSection').style.display = 'block';
    showEditStartTimeSelector();
}

function skipEditEndTime() {
    if (!currentEditEvent) return;
    currentEditEvent.event.endTime = "";
    document.getElementById('editEndTimePreview').textContent = " --:--";
    saveTimeEdit();
}

/*
  saveTimeEdit()
  --------------------------------------------------------------
  編集した時刻を、実際の予定データ（schedules）へ書き戻して保存する。

  【重要・影響範囲】
  時刻を変更したので rebuildAllEventsCache() でキャッシュも更新する
  （時刻の変更が検索結果にすぐ反映されるようにするため）。
*/
function saveTimeEdit() {
    if (!currentEditEvent) return;
    schedules[currentEditEvent.dateKey][currentEditEvent.index] = currentEditEvent.event;
    saveAllData();
    rebuildAllEventsCache();
    closeEditEventModal();
    generateCalendar();
}

function closeEditEventModal() {
    document.getElementById('editEventModal').style.display = 'none';
    currentEditEvent = null;
}

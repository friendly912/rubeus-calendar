/*
  【重要】このファイルはPC版（../PC/js/copyPaste.js）と全く同じ中身です。
  カレンダーの動作ロジックはPCでもスマホでも共通にするため、あえて複製しています。
  そのため、動作に関する修正（バグ修正・仕様変更）をする場合は、
  必ずPC版とMobile版の両方の同名ファイルを同時に直してください。
  （画面の見た目やレイアウトだけの変更なら、CSS側だけを直せば済みます）
*/

/*
  copyPaste.js
  ==============================================================
  予定の「コピー」と「貼り付け」を担当するファイル。

  【絶対に変えてはいけない仕様】
  コピーを押しても、新規登録画面（ウィザード）は開かない。
  代わりに「コピー中」の状態になり、カレンダー上で
  貼り付けたい日付をクリックすると、その場で予定が複製される。
  このカレンダー上で完結する操作フローがこのアプリの特徴の一つ。
*/

/*
  copyEventFromDetail()
  --------------------------------------------------------------
  予定詳細モーダルの「コピー」ボタンの処理。
  予定の中身（テンプレート・日付・時刻・メモ）を copiedEventData に保存し、
  画面上部に「コピー中」の表示を出す。
*/
function copyEventFromDetail() {
    if (!currentDetailEvent) return;
    const ev = schedules[currentDetailEvent.dateKey][currentDetailEvent.index];
    copiedEventData = {
        template: ev.template,
        templateId: ev.templateId,
        startDate: ev.startDate,
        startTime: ev.startTime,
        endDate: ev.endDate,
        endTime: ev.endTime,
        memo: ev.memo
    };
    closeEventDetailModal();
    // 【2026-09-06 修正】予定詳細は「その日の予定一覧」モーダルから開かれることが
    // 多く、詳細モーダルを閉じただけでは裏に残っていた一覧モーダルが再び見えてしまい、
    // 「コピーしたのにカレンダーへ戻らない」という状態になっていた。
    // コピー中はカレンダー上の日付をタップして貼り付ける操作に進みたいため、
    // 一覧モーダルが開いていれば一緒に閉じてカレンダーへ戻す。
    const listModal = document.getElementById('eventListModal');
    if (listModal) listModal.style.display = 'none';
    // スマホの縦画面「リスト形式」で予定を開いてコピーした場合も、そのままでは
    // 貼り付け先を選べないため、コピーした時点で「カレンダー形式」へ切り替える。
    // （setPortraitViewFormatはMobile版にしか存在しないため、PC版では何もしない）
    if (typeof portraitViewFormat !== 'undefined' && portraitViewFormat === 'list'
        && typeof setPortraitViewFormat === 'function') {
        setPortraitViewFormat('calendar');
    }
    document.getElementById('copyStatus').style.display = 'block';
    generateCalendar();
}

/*
  cancelCopy()
  --------------------------------------------------------------
  「コピー中」表示の末尾にある「キャンセル」を押した時の処理。
  どこにも貼り付けず、コピー中の状態だけを解除する。
*/
function cancelCopy() {
    copiedEventData = null;
    document.getElementById('copyStatus').style.display = 'none';
}

/*
  pasteCopiedEvent(dateKey)
  --------------------------------------------------------------
  コピー中の状態でカレンダーの日付をクリックしたときに呼ばれ、
  その日付を新しい開始日として予定を複製する。

  【連日予定のコピーで気をつけていること】
  コピー元が連日予定（例：8/5〜8/10 = 6日間）だった場合、
  終了日をそのままコピーするのではなく「期間の長さ」を計算し、
  貼り付け先の開始日から同じ日数だけ後の日付を新しい終了日にする。
  （8/20に貼り付けたら 8/20〜8/25 になる、というように期間を維持する）
*/
function pasteCopiedEvent(dateKey) {
    if (!copiedEventData) return;
    if (typeof isSearchActive === 'function' && isSearchActive()) {
        alert('検索中は新しい予定を追加できません。検索を消してから追加してください。');
        return;
    }
    if (!schedules[dateKey]) schedules[dateKey] = [];

    let newEndDate = copiedEventData.endDate;
    if (copiedEventData.endDate && copiedEventData.startDate) {
        const origStart = new Date(copiedEventData.startDate);
        const origEnd = new Date(copiedEventData.endDate);
        const newStart = new Date(dateKey);
        const dayDiff = Math.floor((origEnd - origStart) / (1000 * 60 * 60 * 24));
        const adjustedEnd = new Date(newStart);
        adjustedEnd.setDate(adjustedEnd.getDate() + dayDiff);
        newEndDate = adjustedEnd.toISOString().slice(0, 10);
    }

    const newEvent = {
        id: 'ev-' + Date.now() + Math.random().toString(36).substr(2, 5),
        template: copiedEventData.template,
        templateId: copiedEventData.templateId || null,
        startDate: dateKey,
        startTime: copiedEventData.startTime,
        endDate: newEndDate,
        endTime: copiedEventData.endTime,
        memo: copiedEventData.memo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    schedules[dateKey].push(newEvent);
    saveAllData();
    rebuildAllEventsCache(); // 貼り付けで増えた予定を検索キャッシュにも反映する
    copiedEventData = null;
    document.getElementById('copyStatus').style.display = 'none';
    generateCalendar();
}

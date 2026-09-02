/*
  eventDetail.js
  ==============================================================
  「予定詳細」モーダルを担当するファイル。
  1件の予定について、テンプレートの変更・メモ編集・削除ができる画面。
  時刻の編集だけは専用モーダルなので editTime.js に分けている。
  コピー機能は copyPaste.js に分けている。
*/

/*
  showEventDetail(dateKey, index)
  --------------------------------------------------------------
  指定した予定の詳細モーダルを開く。
  dateKey・index は「schedules[dateKey][index]」でその予定を特定するための情報。
*/
function showEventDetail(dateKey, index) {
    if (multiSelectMode) return;
    if (!schedules[dateKey] || index < 0 || !schedules[dateKey][index]) return;
    currentDetailEvent = { dateKey, index };
    const ev = schedules[dateKey][index];
    document.getElementById('detailTitle').textContent = ev.template; // textContentなので安全
    document.getElementById('detailMemo').value = ev.memo || "";
    renderDetailTemplates(ev.template);
    document.getElementById('eventDetailModal').style.display = 'flex';
}

/*
  renderDetailTemplates(currentName)
  --------------------------------------------------------------
  詳細モーダル内のテンプレート一覧を描画する。
  クリックしても即座には確定させず、「保存」ボタンを押したときに
  currentDetailEvent.newTemplate の内容を実データへ反映する
  （＝誤クリックしてもすぐには変更が確定しない安全設計）。
*/
function renderDetailTemplates(currentName) {
    const cont = document.getElementById('detailTemplateList');
    cont.innerHTML = '';
    templates.forEach(temp => {
        const div = document.createElement('div');
        div.className = `template-option ${currentName === temp.name ? 'selected' : ''}`;
        div.style.borderLeft = `5px solid ${temp.color}`;
        div.textContent = temp.name;
        div.onclick = () => {
            currentDetailEvent.newTemplate = temp.name;
            renderDetailTemplates(temp.name);
        };
        cont.appendChild(div);
    });
}

/*
  saveDetailChanges()
  --------------------------------------------------------------
  詳細モーダルの「保存」ボタンの処理。
  テンプレートの変更候補（newTemplate）とメモの内容を実データへ反映する。

  【重要・影響範囲】
  データを変更したので rebuildAllEventsCache() でキャッシュも更新する
  （メモの変更が検索結果にすぐ反映されるようにするため）。
*/
function saveDetailChanges() {
    if (!currentDetailEvent) return;
    const ev = schedules[currentDetailEvent.dateKey][currentDetailEvent.index];
    if (currentDetailEvent.newTemplate) {
        ev.template = currentDetailEvent.newTemplate;
        const selected = templates.find(t => t.name === currentDetailEvent.newTemplate);
        ev.templateId = selected ? selected.id : null;
    }
    ev.memo = document.getElementById('detailMemo').value.trim();
    ev.updatedAt = new Date().toISOString();
    saveAllData();
    rebuildAllEventsCache();
    closeEventDetailModal();
    generateCalendar();
}

function closeEventDetailModal() {
    document.getElementById('eventDetailModal').style.display = 'none';
    currentDetailEvent = null;
}

/*
  deleteFromDetail()
  --------------------------------------------------------------
  詳細モーダルの「削除」ボタンの処理。
  実際の削除は行わず、削除確認モーダルを表示して confirmDelete() に処理を委ねる
  （削除確認まわりの共通処理は multiSelect.js の confirmDelete() にまとめている）。
*/
function deleteFromDetail() {
    if (!currentDetailEvent) {
        if (typeof dbg === 'function') dbg('deleteFromDetail no currentDetailEvent');
        return;
    }
    const ev = schedules[currentDetailEvent.dateKey] && schedules[currentDetailEvent.dateKey][currentDetailEvent.index];
    currentDeleteTarget = {
        type: "event",
        dateKey: currentDetailEvent.dateKey,
        index: currentDetailEvent.index,
        id: ev && ev.id
    };
    if (typeof dbg === 'function') {
        dbg('deleteFromDetail', {
            dateKey: currentDeleteTarget.dateKey,
            index: currentDeleteTarget.index,
            id: currentDeleteTarget.id,
            events: (typeof countScheduleEvents === 'function') ? countScheduleEvents() : -1
        });
    }
    document.getElementById('deleteConfirmText').innerHTML = "この予定を削除しますか？";
    document.getElementById('deleteConfirmModal').style.display = 'flex';
    closeEventDetailModal();
}

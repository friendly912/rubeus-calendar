/*
  templates.js
  ==============================================================
  サイドバーの「行動テンプレート」に関する機能をまとめたファイル。
  ・一覧表示
  ・ドラッグ＆ドロップによる並び替え（PCのマウス操作）
  ・新規追加/編集/削除
*/

function renderTemplates() {
    const container = document.getElementById('templates');
    container.innerHTML = '';
    templates.forEach((temp, index) => {
        const div = document.createElement('div');
        div.className = 'template';
        div.draggable = true;
        div.dataset.index = index;
        div.dataset.id = String(temp.id);

        /*
          【2026-08-05 追加、同日中に見た目を調整】
          先頭に①②のような番号を付けている。
          この番号は、Mobile版のカレンダー形式で予定の帯に表示される
          小さいマーカー（詳しくは calendar.js の useCompactEventBars 部分を参照）と
          対応しており、「マーカーの①が何のテンプレートか」をここで確認できる。
          番号はテンプレートの並び順（index）でそのまま決まるため、
          ドラッグ＆ドロップで並び替えると番号も一緒に変わる。
          【調整】カレンダー側のマーカーは日をまたぐ予定の連結表現のために
          【】で囲む必要があるが、この一覧側は1行で完結するため【】は使わず、
          区切り記号も付けずに丸数字だけを添えるシンプルな形にしている。

          【2026-08-05 さらに調整】
          PC版は予定の帯に時刻＋テンプレ名をそのまま表示しており、番号で
          対応関係を確認する必要が無い（＝この番号が意味を持つのはMobile版だけ）
          ため、useCompactEventBars が無いPC版では番号を付けないようにした。

          temp.name はユーザーが自由に入力できる文字列なので、
          そのままHTMLに埋め込まず escapeHtml() を通してから表示する。
        */
        const numberPrefix = (typeof useCompactEventBars !== 'undefined' && useCompactEventBars)
            ? `<span class="template-index" style="color:${temp.color}">${getCircledNumber(index + 1)}</span>`
            : '';
        div.innerHTML = `${numberPrefix}<span class="template-color" style="background:${temp.color}"></span><span class="template-name">${escapeHtml(temp.name)}</span>`;

        let justDragged = false;
        div.addEventListener('click', () => {
            if (justDragged) {
                justDragged = false;
                return;
            }
            editTemplate(temp.id);
        });

        div.ondragstart = (e) => {
            justDragged = true;
            div.classList.add('template-dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', temp.name);
            e.dataTransfer.setData('text/x-template-index', String(index));
        };
        div.ondragend = () => {
            div.classList.remove('template-dragging');
        };
        div.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        div.ondrop = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const fromIndex = parseInt(e.dataTransfer.getData('text/x-template-index'), 10);
            const toIndex = parseInt(div.dataset.index, 10);
            if (!isNaN(fromIndex) && fromIndex !== toIndex) {
                const [movedItem] = templates.splice(fromIndex, 1);
                templates.splice(toIndex, 0, movedItem);
                saveAllData();
                renderTemplates();
                generateCalendar();
            }
        };
        container.appendChild(div);
    });
}

/*
  editTemplate(id) / addNewTemplate()
  --------------------------------------------------------------
  テンプレート編集モーダルを開く。
  id が渡された場合は既存テンプレートの編集、
  addNewTemplate() は新規追加用に空の状態でモーダルを開く。
*/
function editTemplate(id) {
    currentEditingTemplateId = id;
    const temp = templates.find(t => t.id === id);
    if (!temp) return;
    document.getElementById('editTitle').textContent = 'テンプレート編集';
    document.getElementById('editName').value = temp.name;
    document.getElementById('editColor').value = temp.color;
    // 「初期状態に戻す」ボタンは、最初から用意されている8つのテンプレート
    // （defaultTemplates に同じidがあるもの）を編集している時だけ表示する。
    // 自分で追加したテンプレートには「初期状態」という概念が無いため隠す。
    const isDefaultTemplate = defaultTemplates.some(t => t.id === id);
    document.getElementById('resetTemplateBtn').style.display = isDefaultTemplate ? 'block' : 'none';
    document.getElementById('editTemplateModal').style.display = 'flex';
}

function addNewTemplate() {
    currentEditingTemplateId = null;
    document.getElementById('editTitle').textContent = '新しいテンプレート';
    document.getElementById('editName').value = '';
    document.getElementById('editColor').value = '#00ffcc';
    document.getElementById('resetTemplateBtn').style.display = 'none';
    document.getElementById('editTemplateModal').style.display = 'flex';
}

/*
  resetTemplateToDefault()
  --------------------------------------------------------------
  テンプレート編集モーダルの「初期状態に戻す」ボタンの処理。
  今編集している欄（名前・色の入力欄）の中身だけを、defaultTemplates の
  初期値に書き換える。この時点ではまだ保存されておらず、
  ここで【保存】ボタンを押すまでは実際のテンプレートは変わらない
  （設定画面の配色テーマと同じ「まず画面上だけ変えて、保存で確定」という考え方）。
*/
function resetTemplateToDefault() {
    const original = defaultTemplates.find(t => t.id === currentEditingTemplateId);
    if (!original) return;
    document.getElementById('editName').value = original.name;
    document.getElementById('editColor').value = original.color;
}

/*
  restoreDeletedDefaultTemplates()
  --------------------------------------------------------------
  サイドバーの「初期テンプレートを復活」ボタンの処理。
  最初から用意されていた8つのテンプレート（defaultTemplates）のうち、
  ユーザーが削除して今の templates 配列に残っていないものだけを、
  末尾に追加し直す。1つも削除されていない場合はその旨を知らせる。
*/
function restoreDeletedDefaultTemplates() {
    const missing = defaultTemplates.filter(
        dt => !templates.some(t => t.id === dt.id)
    );
    if (missing.length === 0) {
        alert('削除された初期テンプレートはありません。');
        return;
    }
    missing.forEach(dt => templates.push({ ...dt }));
    saveAllData();
    renderTemplates();
    generateCalendar();
}

/*
  saveTemplateEdit()
  --------------------------------------------------------------
  テンプレート編集モーダルの「保存」ボタンの処理。
  currentEditingTemplateId が設定されていれば既存テンプレートの更新、
  null であれば新規追加として扱う（IDは既存の最大値+1を発行）。
*/
function saveTemplateEdit() {
    const name = document.getElementById('editName').value.trim();
    const color = document.getElementById('editColor').value;
    if (!name) return;
    if (currentEditingTemplateId !== null) {
        const temp = templates.find(t => t.id === currentEditingTemplateId);
        if (temp) {
            const oldName = temp.name;
            temp.name = name;
            temp.color = color;
            if (typeof renameTemplateOnEvents === 'function') {
                renameTemplateOnEvents(oldName, name, temp.id);
            }
        }
    } else {
        const maxId = templates.length ? Math.max(...templates.map(t => t.id)) : 0;
        templates.push({ id: maxId + 1, name, color });
    }
    saveAllData();
    renderTemplates();
    generateCalendar();
    closeEditTemplateModal();
}

function closeEditTemplateModal() {
    document.getElementById('editTemplateModal').style.display = 'none';
    currentEditingTemplateId = null;
}

/*
  deleteTemplate()
  --------------------------------------------------------------
  テンプレート編集モーダルの「削除」ボタンの処理。
  実際の削除は行わず、削除確認モーダルを表示して confirmDelete() に処理を委ねる。

  【重要な仕様】
  テンプレートを削除しても、そのテンプレートを使って登録済みの予定は削除しない。
  予定データには「テンプレート名の文字列」だけが保存されており、
  テンプレート本体（色などの情報）への参照ではないため、
  テンプレートを消しても既存の予定はそのまま名前だけを保持し続ける
  （ただし表示上の色は「テンプレートが見つからない場合のグレー」になる。
    generateCalendar() 内の `templates.find(...) || {color: '#888'}` の部分）。
*/
function deleteTemplate() {
    if (currentEditingTemplateId === null) return;
    const temp = templates.find(t => t.id === currentEditingTemplateId);
    if (!temp) return;
    currentDeleteTarget = { type: "template", id: currentEditingTemplateId, name: temp.name };
    document.getElementById('deleteConfirmText').innerHTML =
        `テンプレート「${escapeHtml(temp.name)}」を削除します。<br>予定は残ります。`;
    closeEditTemplateModal();
    document.getElementById('deleteConfirmModal').style.display = 'flex';
}

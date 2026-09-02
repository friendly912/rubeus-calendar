/*
  【重要】このファイルはPC版（../PC/js/templates.js）とほぼ同じ中身です。
  並び替えのドラッグだけはスマホ向けに作りを変えています（HTML5の
  drag＆dropは、Safariやホーム画面ショートカットでは安定しないため）。
  その他の動作修正は両方を直してください。
*/

/*
  templates.js
  ==============================================================
  サイドバーの「行動テンプレート」に関する機能をまとめたファイル。
  ・一覧表示
  ・長押し（約0.3秒）のあと、指で上下に動かして並び替え
  ・検索欄へドラッグすると、そのテンプレート名で検索できる
  ・新規追加/編集/削除

  並び替えは、ブラウザ標準の draggable を使わない。
  iPhoneのSafari、ホーム画面に追加したショートカット、Chrome / Brave
  でも同じ操作になるように、タッチ位置で行の順番を入れ替える。
*/

const TEMPLATE_DRAG_HOLD_MS = 300;
const TEMPLATE_DRAG_MOVE_PX = 10;
let skipTemplateClickUntil = 0;

function clearIosSelection() {
    const sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
}

function scrollDrawerIfNeeded(clientY) {
    const body = document.querySelector('.drawer-body');
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const edge = 56;
    if (clientY < rect.top + edge) body.scrollTop -= 18;
    else if (clientY > rect.bottom - edge) body.scrollTop += 18;
}

function isPointOverSearchDrop(clientX, clientY) {
    const zone = document.querySelector('.search-drop-zone') || document.getElementById('search');
    if (!zone) return false;
    const r = zone.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function setSearchDropHighlight(on) {
    const zone = document.querySelector('.search-drop-zone');
    if (zone) zone.classList.toggle('search-drop-ready', !!on);
}

function persistTemplateOrder() {
    const container = document.getElementById('templates');
    if (!container) return;
    const ids = [...container.querySelectorAll('.template')].map((el) => Number(el.dataset.id));
    const next = ids.map((id) => templates.find((t) => t.id === id)).filter(Boolean);
    if (next.length !== templates.length) return;
    const changed = next.some((t, i) => t.id !== templates[i].id);
    if (!changed) return;
    templates.splice(0, templates.length, ...next);
    saveAllData();
    renderTemplates();
    generateCalendar();
}

/*
  attachTemplateReorder(div)
  --------------------------------------------------------------
  1行を約0.3秒押すと、その行が指に追従して浮く。
  検索欄（または検索ボタン）の上で離すと、テンプレート名が検索欄に入る。
  一覧の上で離すと、空き枠の位置に並び替わる。
  押している途中で指を動かす（メニューをスクロールする）と、長押しはキャンセル。
  短くタップしたときは、今までどおり編集画面を開く。
*/
function attachTemplateReorder(div) {
    let pressTimer = null;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastX = 0;
    let grabOffsetY = 0;
    let pointerId = null;
    let placeholder = null;

    function clearPressTimer() {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
        div.classList.remove('template-holding');
    }

    function liftCard(clientY) {
        const maxTop = Math.max(8, window.innerHeight - div.offsetHeight - 8);
        const top = Math.max(8, Math.min(clientY - grabOffsetY, maxTop));
        div.style.top = `${top}px`;
    }

    function movePlaceholder(clientY) {
        const container = document.getElementById('templates');
        if (!container || !placeholder) return;
        const siblings = [...container.children].filter((el) => el !== div && el !== placeholder);
        for (const el of siblings) {
            const rect = el.getBoundingClientRect();
            if (clientY < rect.top + rect.height / 2) {
                container.insertBefore(placeholder, el);
                scrollDrawerIfNeeded(clientY);
                return;
            }
        }
        container.appendChild(placeholder);
        scrollDrawerIfNeeded(clientY);
    }

    function beginDrag() {
        dragging = true;
        window.isTemplateReordering = true;
        div.classList.remove('template-holding');
        div.classList.add('template-dragging');
        document.body.classList.add('template-reordering');
        div.style.touchAction = 'none';
        clearIosSelection();

        const rect = div.getBoundingClientRect();
        grabOffsetY = lastY - rect.top;
        placeholder = document.createElement('div');
        placeholder.className = 'template-placeholder';
        placeholder.style.height = `${rect.height}px`;
        div.parentNode.insertBefore(placeholder, div);

        div.style.position = 'fixed';
        div.style.left = `${rect.left}px`;
        div.style.width = `${rect.width}px`;
        div.style.zIndex = '40';
        div.style.margin = '0';
        div.style.pointerEvents = 'none';
        liftCard(lastY);

        try {
            if (navigator.vibrate) navigator.vibrate(15);
        } catch (err) { /* iOSなど、振動が使えない環境がある */ }
    }

    function finishDrag() {
        clearPressTimer();
        window.isTemplateTouch = false;
        window.isTemplateReordering = false;
        document.body.classList.remove('template-reordering');
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onPointerUp);
        document.removeEventListener('touchcancel', onPointerUp);
        pointerId = null;

        const wasDragging = dragging;
        dragging = false;
        const droppedOnSearch = wasDragging && isPointOverSearchDrop(lastX, lastY);
        setSearchDropHighlight(false);
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.insertBefore(div, placeholder);
            placeholder.parentNode.removeChild(placeholder);
        }
        placeholder = null;
        div.classList.remove('template-dragging');
        div.style.touchAction = '';
        div.style.position = '';
        div.style.left = '';
        div.style.width = '';
        div.style.top = '';
        div.style.zIndex = '';
        div.style.margin = '';
        div.style.pointerEvents = '';

        if (!wasDragging) return;
        skipTemplateClickUntil = Date.now() + 400;
        if (droppedOnSearch) {
            applyTemplateNameToSearch(div.dataset.name || '');
            renderTemplates();
            return;
        }
        persistTemplateOrder();
    }

    function onPointerMove(e) {
        if (pointerId !== null && e.pointerId !== pointerId) return;
        lastX = e.clientX;
        lastY = e.clientY;
        if (pressTimer) {
            const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
            if (dist > TEMPLATE_DRAG_MOVE_PX) clearPressTimer();
        }
        if (dragging) {
            e.preventDefault();
            liftCard(lastY);
            if (isPointOverSearchDrop(lastX, lastY)) {
                setSearchDropHighlight(true);
            } else {
                setSearchDropHighlight(false);
                movePlaceholder(lastY);
            }
        }
    }

    function onTouchMove(e) {
        if (!e.touches.length) return;
        const t = e.touches[0];
        lastX = t.clientX;
        lastY = t.clientY;
        if (pressTimer) {
            const dist = Math.hypot(t.clientX - startX, t.clientY - startY);
            if (dist > TEMPLATE_DRAG_MOVE_PX) clearPressTimer();
        }
        if (dragging) {
            e.preventDefault();
            liftCard(lastY);
            if (isPointOverSearchDrop(lastX, lastY)) {
                setSearchDropHighlight(true);
            } else {
                setSearchDropHighlight(false);
                movePlaceholder(lastY);
            }
        }
    }

    function onPointerUp(e) {
        if (e && pointerId !== null && e.pointerId != null && e.pointerId !== pointerId) return;
        if (e) {
            if (e.changedTouches && e.changedTouches[0]) {
                lastX = e.changedTouches[0].clientX;
                lastY = e.changedTouches[0].clientY;
            } else if (e.clientX != null) {
                lastX = e.clientX;
                lastY = e.clientY;
            }
        }
        finishDrag();
    }

    div.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        window.isTemplateTouch = true;
        startX = e.clientX;
        startY = e.clientY;
        lastX = e.clientX;
        lastY = e.clientY;
        pointerId = e.pointerId;
        dragging = false;
        try {
            div.setPointerCapture(e.pointerId);
        } catch (err) { /* キャプチャできない環境でも、document 側の監視で足りる */ }

        document.addEventListener('pointermove', onPointerMove, { passive: false });
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onPointerUp);
        document.addEventListener('touchcancel', onPointerUp);

        clearPressTimer();
        div.classList.add('template-holding');
        pressTimer = setTimeout(() => {
            pressTimer = null;
            beginDrag();
        }, TEMPLATE_DRAG_HOLD_MS);
    });

    div.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

/*
  renderTemplates()
  --------------------------------------------------------------
  サイドバーのテンプレート一覧を、今の templates 配列の内容で描き直す。
  テンプレートの追加・編集・削除・並び替えをするたびに呼び出す。
*/
function renderTemplates() {
    const container = document.getElementById('templates');
    container.innerHTML = '';
    templates.forEach((temp, index) => {
        const div = document.createElement('div');
        div.className = 'template';
        div.draggable = false;
        div.dataset.index = index;
        div.dataset.id = String(temp.id);
        div.dataset.name = temp.name;

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
            ? `<span style="color:${temp.color};font-size:18px;">${getCircledNumber(index + 1)}</span> `
            : '';
        div.innerHTML = `${numberPrefix}<span style="color:${temp.color};font-size:18px;">■</span><span class="template-name">${escapeHtml(temp.name)}</span><span class="template-handle" aria-hidden="true"></span>`;

        div.addEventListener('click', () => {
            if (Date.now() < skipTemplateClickUntil) return;
            editTemplate(temp.id);
        });
        attachTemplateReorder(div);
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

/*
  listView.js（PC版）
  ==============================================================
  【2026-10-05 追加】
  スマホ版と同じく、下部のタブで「カレンダー（マス目）形式」と
  「リスト（一覧）形式」を切り替えられるようにする機能。
  中身はスマホ版の Mobile/js/listView.js をもとにしており、違いは次の3点だけ。
   ・スマホ版は縦画面表示の時だけリスト形式になるが、PC版には縦/横の区別が
     無いため、選んだ形式がいつでもそのまま使われる。
   ・選んだ形式の保存先（localStorageのキー）をスマホ版とは別にしている
     （同じブラウザでPC版とスマホ版を開いても、それぞれの選択を覚えておくため）。
   ・PC版のカレンダー形式と同じく、右クリックで複数選択を開始できる。

  【設計の考え方】
  カレンダー本体の描画ロジック（generateCalendar など）は calendar.js にあり、
  calendar.js 自体には一切手を入れず、代わりにこのファイルの中で
  generateCalendar という関数を「後から上書き」することで、
  予定の追加・編集・削除のたびにいつも通り呼ばれる generateCalendar() が、
  グリッド表示とリスト表示の両方を自動的に更新するようにしている。

  【影響範囲】
  ・generateCalendar という関数名を変える場合は、この上書き処理も
    合わせて直す必要がある
  ・リストの描画内容（renderCalendarList）を直す場合は、スマホ版も合わせて直すこと
*/

// リスト形式の設定を保存しておくlocalStorageのキー名
const VIEW_FORMAT_STORAGE_KEY = 'pcViewFormat';

// 今選ばれている見せ方（"calendar" または "list"）
let viewFormat = 'calendar';

function loadViewFormat() {
    viewFormat = localStorage.getItem(VIEW_FORMAT_STORAGE_KEY) || 'calendar';
}

/*
  setViewFormat(format)
  --------------------------------------------------------------
  下部タブの「カレンダー形式／リスト形式」ボタンから呼ばれる。
*/
function setViewFormat(format) {
    viewFormat = format;
    localStorage.setItem(VIEW_FORMAT_STORAGE_KEY, format);
    applyViewFormat();
    generateCalendar();
}

/*
  applyViewFormat()
  --------------------------------------------------------------
  今選ばれている形式に応じて、bodyタグに list-view クラスを付けるかどうかを更新する。
  （css/listView.css が、このクラスを見てマス目とリストを切り替える）
*/
function applyViewFormat() {
    document.body.classList.toggle('list-view', viewFormat === 'list');
    updateViewFormatButtons();
}

function updateViewFormatButtons() {
    document.querySelectorAll('.view-format-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.format === viewFormat);
    });
}

/*
  renderCalendarList()
  --------------------------------------------------------------
  今表示している年月について、予定がある日だけを日付順に並べた
  一覧（リスト形式）を描画する。

  カレンダー形式のマス目と同じデータ（getEventsForDate等）を使っているため、
  連日予定の表示や検索によるフィルタなど、基本的な考え方はすべて共通。
  違うのは「予定が無い日はそもそも表示しない」という一覧ならではの見せ方だけ。
*/
function renderCalendarList() {
    const container = document.getElementById('calendarList');
    if (!container) return;
    container.innerHTML = '';

    const searchTerm = document.getElementById('search').value.toLowerCase().trim();
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const today = new Date();

    let hasAnyEvent = false;

    for (let day = 1; day <= lastDate; day++) {
        const dateKey = formatDateKey(currentYear, currentMonth, day);
        let dayEvents = getEventsForDate(dateKey);

        // カレンダー形式と同じ条件で、検索文字に一致しない予定は除外する
        if (searchTerm) {
            dayEvents = dayEvents.filter(ev => {
                const nameMatch = ev.template.toLowerCase().includes(searchTerm);
                const timeMatch = (ev.startTime || "").includes(searchTerm) || (ev.endTime || "").includes(searchTerm);
                const memoMatch = (ev.memo || "").toLowerCase().includes(searchTerm);
                return nameMatch || timeMatch || memoMatch;
            });
        }

        if (dayEvents.length === 0) continue; // 予定が無い日は一覧に出さない
        hasAnyEvent = true;

        const dateObj = new Date(currentYear, currentMonth, day);
        const weekday = dateObj.getDay();

        const group = document.createElement('div');
        group.className = 'list-day-group';
        if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) {
            group.classList.add('today');
        }
        if (multiSelectMode && selectedDates.has(dateKey)) {
            group.classList.add('selected-multi');
        }

        const header = document.createElement('div');
        header.className = 'list-day-header';
        if (weekday === 0) header.classList.add('sunday');
        if (weekday === 6) header.classList.add('saturday');
        header.textContent = `${currentMonth + 1}月${day}日（${dayNames[weekday]}）`;
        group.appendChild(header);

        dayEvents.forEach(ev => {
            const found = (typeof findTemplateForEvent === 'function') ? findTemplateForEvent(ev) : { temp: null };
            const temp = found.temp || { color: '#888' };
            const row = document.createElement('div');
            row.className = 'list-event';
            row.style.borderLeftColor = temp.color;
            row.style.backgroundColor = temp.color + '22';

            /*
              【2026-08-05 バグ修正】カレンダー形式と同じ理由で2点修正。
              ①中間日のdisplayStrに"(テンプレ名)"を入れると、すぐ後ろのspanで
                テンプレ名をもう一度表示してしまい「(筋トレ)筋トレ」のように
                重複してしまっていた→中間日はdisplayStrを空にする。
              ②開始日（isStartDayのみtrue）は以前 getTimeDisplay(ev) の
                開始〜終了の全区間をそのまま使っていたため、「03:00〜16:00」の
                ように後日にならないと来ない終了時刻まで見えてしまっていた
                →開始日は開始時刻だけを表示する。
            */
            let displayStr;
            if (ev.isStartDay && ev.isEndDay) {
                displayStr = getTimeDisplay(ev);
            } else if (ev.isStartDay) {
                displayStr = ev.startTime ? `${ev.startTime} 〜` : '';
            } else if (ev.isEndDay) {
                displayStr = ev.endTime ? `〜 ${ev.endTime} 終了` : '';
            } else {
                displayStr = '';
            }

            row.innerHTML = `<span class="list-event-time">${escapeHtml(displayStr)}</span><span>${escapeHtml(ev.template)}</span> ${ev.memo ? '<span style="color:#ffeb3b;">★</span>' : ''}`;

            // 【2026-08-05 変更】カレンダー形式の予定タップと同じ理由で、直接
            // showEventDetail()（編集画面）ではなく showEventList()（追加・削除を
            // 先頭に表示する一覧画面）を開くようにした。予定本体をタップした時は、
            // 日付のまとまり側のクリック処理より優先して開く点は変わらない。
            //
            // 【2026-09-06 修正】コピー中は、カレンダー形式と同じくどこをタップしても
            // 貼り付けを優先する（既存の予定をタップして一覧が開いてしまわないように）。
            row.addEventListener('click', (e) => {
                e.stopPropagation();
                if (multiSelectMode) return;
                if (copiedEventData) {
                    pasteCopiedEvent(dateKey);
                    return;
                }
                showEventList(dateKey, day);
            });
            group.appendChild(row);
        });

        /*
          日付のまとまり全体をタップ/長押しした時の処理。
          【優先順位（カレンダー形式の日付マスと完全に同じ）】
            1. 複数選択モード中 → 選択/選択解除
            2. コピー中         → その日へ貼り付け
            3. それ以外         → 予定一覧モーダルを開く
        */
        group.addEventListener('click', () => {
            if (multiSelectMode) {
                toggleDateSelection(dateKey);
                return;
            }
            if (copiedEventData) {
                pasteCopiedEvent(dateKey);
                return;
            }
            showEventList(dateKey, day);
        });

        // 右クリックで複数選択の開始/追加。PC版のカレンダー形式と同じ操作。
        group.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!multiSelectMode) {
                enterMultiSelectMode(dateKey);
            } else {
                toggleDateSelection(dateKey);
            }
        });

        // 長押し（約550ms）で複数選択モードを開始する。カレンダー形式と同じ時間・同じ仕組み。
        let longPressTimer = null;
        group.addEventListener('touchstart', () => {
            if (multiSelectMode) return;
            longPressTimer = setTimeout(() => enterMultiSelectMode(dateKey), 550);
        }, { passive: true });
        group.addEventListener('touchend', () => { if (longPressTimer) clearTimeout(longPressTimer); });
        group.addEventListener('touchmove', () => { if (longPressTimer) clearTimeout(longPressTimer); });

        container.appendChild(group);
    }

    if (!hasAnyEvent) {
        const empty = document.createElement('p');
        empty.className = 'list-empty';
        empty.textContent = '予定はありません';
        container.appendChild(empty);
    }

    // 一覧の一番下に、新規予定を追加するボタンを置く。
    // カレンダー形式と違い、リスト形式には「空いている日付をタップする」という
    // 操作ができないため、代わりのボタンを用意している。
    // 【2026-08-05 変更】以前はここで直接 openAddWizard() を呼び、常に「今日」
    // （表示中の月が今月でなければ「1日」）を対象にしていたため、リスト形式では
    // 当日以外に予定を追加できないというご指摘があった。
    // テンプレートを選ぶ画面の前に、日をまたぐ予定の終了日選択で使っているのと
    // 同じ作りの小さいカレンダー（showStartDatePickerModal）を挟み、
    // 好きな日付を選んでから開始できるようにした。
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'list-add-btn';
    addBtn.textContent = '＋ 新しい予定を追加';
    addBtn.onclick = () => {
        showStartDatePickerModal();
    };
    container.appendChild(addBtn);
}

// 開始日を選ぶための小さいカレンダーが、今どの年月を表示しているか
let startDatePickerYear = null;
let startDatePickerMonth = null;

/*
  showStartDatePickerModal()
  --------------------------------------------------------------
  リスト形式の「＋ 新しい予定を追加」ボタンから呼ばれる。
  今カレンダーに表示中の年月を初期値にして、開始日を選ぶモーダルを開く。
*/
function showStartDatePickerModal() {
    startDatePickerYear = currentYear;
    startDatePickerMonth = currentMonth;
    renderStartDateCalendar();
    document.getElementById('startDatePickerModal').style.display = 'flex';
}

function closeStartDatePickerModal() {
    document.getElementById('startDatePickerModal').style.display = 'none';
}

/*
  renderStartDateCalendar()
  --------------------------------------------------------------
  開始日を自由に選ぶための、小さいカレンダーを描画する。
  終了日を選ぶ js/wizard.js の renderEndDateCalendar() とほぼ同じ作りだが、
  こちらは「開始日より前は選べない」という制約が無いため、
  すべての日付がクリック可能になっている。
*/
function renderStartDateCalendar() {
    document.getElementById('startDateCalendarHeader').textContent =
        `${startDatePickerYear}年 ${startDatePickerMonth + 1}月`;

    const container = document.getElementById('startDateCalendar');
    container.innerHTML = '';

    // ---- 曜日の見出し行 ----
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    for (let i = 0; i < 7; i++) {
        const idx = (i + weekStart) % 7;
        const headerCell = document.createElement('div');
        headerCell.className = 'end-date-day-header';
        headerCell.textContent = dayNames[idx];
        container.appendChild(headerCell);
    }

    let firstDay = new Date(startDatePickerYear, startDatePickerMonth, 1).getDay() - weekStart;
    if (firstDay < 0) firstDay += 7;
    const daysInMonth = new Date(startDatePickerYear, startDatePickerMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        container.appendChild(empty);
    }

    const today = new Date();

    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'end-date-day';
        cell.textContent = d;

        const weekday = new Date(startDatePickerYear, startDatePickerMonth, d).getDay();
        if (weekday === 0) cell.classList.add('sunday');
        if (weekday === 6) cell.classList.add('saturday');

        const thisDate = new Date(startDatePickerYear, startDatePickerMonth, d);
        if (thisDate.toDateString() === today.toDateString()) {
            // 終了日カレンダーの「開始日」と同じ黄色明滅CSS(.start-date)を再利用し、
            // 今日がひと目で分かるようにしている。
            cell.classList.add('start-date');
        }

        cell.onclick = () => {
            const dateKey = formatDateKey(startDatePickerYear, startDatePickerMonth, d);
            closeStartDatePickerModal();
            openAddWizard(dateKey);
        };
        container.appendChild(cell);
    }
}

function prevStartDateMonth() {
    startDatePickerMonth--;
    if (startDatePickerMonth < 0) {
        startDatePickerMonth = 11;
        startDatePickerYear--;
    }
    renderStartDateCalendar();
}

function nextStartDateMonth() {
    startDatePickerMonth++;
    if (startDatePickerMonth > 11) {
        startDatePickerMonth = 0;
        startDatePickerYear++;
    }
    renderStartDateCalendar();
}

/*
  generateCalendar の上書き
  --------------------------------------------------------------
  calendar.js が定義したもとの generateCalendar を保存した上で、
  「もとのグリッド描画 → リスト描画」の順で両方呼び出す新しい関数に置き換える。
  他のすべてのファイル（wizard.js, eventDetail.js など）は今まで通り
  generateCalendar() を呼んでいるだけで、変更を意識する必要はない。
*/
const _originalGenerateCalendar = generateCalendar;
generateCalendar = function (hitDates) {
    _originalGenerateCalendar(hitDates);
    renderCalendarList();
};

/*
  initViewFormatUI()
  --------------------------------------------------------------
  下部タブの「カレンダー形式／リスト形式」ボタンにクリック処理を設定する。
  main.js の初期化処理から1回だけ呼ばれる。
*/
function initViewFormatUI() {
    loadViewFormat();
    applyViewFormat();

    document.querySelectorAll('.view-format-btn').forEach(btn => {
        btn.addEventListener('click', () => setViewFormat(btn.dataset.format));
    });
}

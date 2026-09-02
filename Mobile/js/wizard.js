/*
  【重要】このファイルはPC版（../PC/js/wizard.js）と全く同じ中身です。
  カレンダーの動作ロジックはPCでもスマホでも共通にするため、あえて複製しています。
  そのため、動作に関する修正（バグ修正・仕様変更）をする場合は、
  必ずPC版とMobile版の両方の同名ファイルを同時に直してください。
  （画面の見た目やレイアウトだけの変更なら、CSS側だけを直せば済みます）
*/

/*
  wizard.js
  ==============================================================
  「予定を追加」モーダルの、段階式の入力の流れ（ウィザード）を担当するファイル。

  画面が進む順番：
    ① テンプレートを選ぶ
    ② 開始時刻を選ぶ（時刻の入力UI自体は timeSelector.js が担当）
    ③ 終了日を選ぶ（ミニカレンダーで直接指定。開始日と同じ日を選べば単日予定になる）
    ④ 終了時刻を選ぶ
    ⑤ メモを入力する
    ⑥ 登録する

  【絶対に変えてはいけない仕様】
  ・連日予定（開始日と終了日が違う予定）は、日ごとに別の予定データを作るのではなく、
    「1つの予定データ」が startDate と endDate を持つ形で管理する。
  ・終了日は必ず開始日以降でなければならない（終了日カレンダーで開始日より前は選択不可にする）。
*/

/*
  openAddWizard(dateKey)
  --------------------------------------------------------------
  指定した日付（dateKey）を開始日として、予定登録ウィザードを最初から開く。
  日付セルをクリックしたとき、まだ予定が無い日であればこの関数が呼ばれる。
*/
function openAddWizard(dateKey) {
    if (multiSelectMode) return; // 複数選択モード中は新規登録を開始しない（操作の混乱を防ぐため）
    if (typeof isSearchActive === 'function' && isSearchActive()) {
        alert('検索中は新しい予定を追加できません。検索を消してから追加してください。');
        return;
    }

    currentAddDateKey = dateKey;
    // ウィザードの入力途中データを初期化する。
    // endDate は最初、開始日と同じ値にしておく（後で「翌日」「日付を指定」を選ぶと上書きされる）。
    wizardData = {
        startDate: dateKey,
        template: "",
        startTime: "",
        endDate: dateKey,
        endTime: "",
        memo: ""
    };

    // モーダル内の各ステップの表示状態を、最初の状態（ステップ1のみ表示）にリセットする
    document.getElementById('timeStepContainer').style.display = 'none';
    document.getElementById('startTimeSection').style.display = 'block';
    document.getElementById('endDatePickerSection').style.display = 'none';
    document.getElementById('endTimeSection').style.display = 'none';
    document.getElementById('memoStep').style.display = 'none';

    document.getElementById('startTimePreview').textContent = " --:--";
    document.getElementById('endTimePreview').textContent = " --:--";
    document.getElementById('startTimeSteps').innerHTML = '';
    document.getElementById('endTimeSteps').innerHTML = '';

    document.getElementById('step1').style.display = 'block';

    renderWizardTemplates();
    document.getElementById('addWizardModal').style.display = 'flex';
}

/*
  renderWizardTemplates()
  --------------------------------------------------------------
  ステップ1（テンプレート選択）のテンプレート一覧を描画する。
  クリックすると選択状態になり、約180ms後に自動で次のステップ（開始時刻）へ進む。
  （少し間を置くのは、選択されたことが目で見て分かってから画面が切り替わるようにするための演出）
*/
function renderWizardTemplates() {
    const container = document.getElementById('wizardTemplateList');
    container.innerHTML = '';
    templates.forEach(temp => {
        const div = document.createElement('div');
        div.className = `template-option ${wizardData.template === temp.name ? 'selected' : ''}`;
        div.style.borderLeft = `5px solid ${temp.color}`;
        div.textContent = temp.name; // textContentなので、名前にHTML文字が含まれていても安全
        div.onclick = () => {
            wizardData.template = temp.name;
            renderWizardTemplates();
            setTimeout(() => {
                if (wizardData.template) {
                    document.getElementById('step1').style.display = 'none';
                    document.getElementById('timeStepContainer').style.display = 'block';
                    showStartTimeSelector();
                }
            }, 180);
        };
        container.appendChild(div);
    });
}

/*
  renderEndDateCalendar()
  --------------------------------------------------------------
  終了日を自由に指定するための、小さいカレンダーを描画する。
  開始日より前の日付はグレーアウトして選べないようにする
  （＝「終了日 >= 開始日」を必ず守らせるための処理）。

  【2026-08-05 変更】
  以前は曜日の見出しが無く、月初の空白マスの数もweekStart（日曜/月曜始まり）を
  考慮せずに常に日曜始まり扱いで計算していた。カレンダー本体はweekStart設定に
  従って表示されるため、月曜始まりを選んでいる方にはこの小さいカレンダーだけ
  ズレて見えてしまう不整合があった。
  また、「開始日より前はグレーアウト」だけでは、グレーアウトの意味を分かっていても
  実際にどのマスが開始日なのか一目で分かりにくく、月をまたいで終了日を探している
  うちに見失いやすいというご指摘があった。
  この2点を直すため、①曜日の見出し行をweekStartに合わせて追加し、②開始日の
  マスに .start-date クラスを付けて明滅させ、はっきり目立たせるようにした。
*/
function renderEndDateCalendar() {
    // 【2026-08-05 バグ修正】
    // 以前は new Date(wizardData.startDate) を使っていたが、"2026-08-10" のような
    // 日付だけの文字列はJavaScriptの仕様上、常にUTC（世界標準時）の午前0時として
    // 解釈される。一方、下の thisDate はこの端末の時刻（日本ならJST、UTC+9時間）の
    // 午前0時として作られるため、日本時間では「開始日」が実際の午前0時より9時間
    // 遅れて扱われてしまい、開始日のマスまで thisDate < startDateObj が真になって
    // グレーアウト対象に含まれてしまっていた（＝開始日が終了日として選べなくなる
    // 不具合が隠れていた）。年・月・日をそれぞれ取り出してこの端末の時刻で
    // 組み立て直すことで、thisDateと基準を揃えている。
    const [startY, startM, startD] = wizardData.startDate.split('-').map(Number);
    const startDateObj = new Date(startY, startM - 1, startD);

    // 初回表示時は、開始日と同じ年月を表示しておく
    if (endDatePickerYear === null || endDatePickerMonth === null) {
        endDatePickerYear = startDateObj.getFullYear();
        endDatePickerMonth = startDateObj.getMonth();
    }

    document.getElementById('endDateCalendarHeader').textContent =
        `${endDatePickerYear}年 ${endDatePickerMonth + 1}月`;

    const container = document.getElementById('endDateCalendar');
    container.innerHTML = '';

    // ---- 曜日の見出し行（カレンダー本体のgenerateCalendarと同じ考え方） ----
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    for (let i = 0; i < 7; i++) {
        const idx = (i + weekStart) % 7;
        const headerCell = document.createElement('div');
        headerCell.className = 'end-date-day-header';
        headerCell.textContent = dayNames[idx];
        container.appendChild(headerCell);
    }

    // 月の1日目が「週の何番目か」を、weekStart（日曜/月曜始まり）に合わせて計算する
    let firstDay = new Date(endDatePickerYear, endDatePickerMonth, 1).getDay() - weekStart;
    if (firstDay < 0) firstDay += 7;
    const daysInMonth = new Date(endDatePickerYear, endDatePickerMonth + 1, 0).getDate();

    // 月の1日目より前の空白マスを埋める
    for (let i = 0; i < firstDay; i++) {
        const empty = document.createElement('div');
        container.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'end-date-day';
        cell.textContent = d;

        const thisDate = new Date(endDatePickerYear, endDatePickerMonth, d);

        // 【2026-08-05 追加】カレンダー本体の日付マスと同じく、土日の数字を赤くする
        const weekday = thisDate.getDay();
        if (weekday === 0) cell.classList.add('sunday');
        if (weekday === 6) cell.classList.add('saturday');

        // 開始日そのもののマスは、グレーアウトの起点として明滅させて目立たせる
        // （日をまたいで開始日を探しているうちに見失いやすい、というご指摘への対応）
        if (thisDate.toDateString() === startDateObj.toDateString()) {
            cell.classList.add('start-date');
        }

        if (thisDate < startDateObj) {
            cell.classList.add('disabled');
        } else {
            cell.onclick = () => {
                wizardData.endDate = `${endDatePickerYear}-${String(endDatePickerMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                document.getElementById('endDatePickerSection').style.display = 'none';
                document.getElementById('endTimeSection').style.display = 'block';
                showEndTimeSelector();
            };
        }
        container.appendChild(cell);
    }
}

function prevEndDateMonth() {
    endDatePickerMonth--;
    if (endDatePickerMonth < 0) {
        endDatePickerMonth = 11;
        endDatePickerYear--;
    }
    renderEndDateCalendar();
}

function nextEndDateMonth() {
    endDatePickerMonth++;
    if (endDatePickerMonth > 11) {
        endDatePickerMonth = 0;
        endDatePickerYear++;
    }
    // 年の上限（2100年）を超えないようにする
    if (endDatePickerYear > 2100) {
        endDatePickerYear = 2100;
        endDatePickerMonth = 11;
    }
    renderEndDateCalendar();
}

// ---- ウィザード内の「戻る」ボタン群 ----

function backToStartTimeFromEndDatePicker() {
    document.getElementById('endDatePickerSection').style.display = 'none';
    document.getElementById('startTimeSection').style.display = 'block';
    showStartTimeSelector();
}

function backToEndDatePickerFromEndTime() {
    document.getElementById('endTimeSection').style.display = 'none';
    document.getElementById('endDatePickerSection').style.display = 'block';
    renderEndDateCalendar();
}

function prevToTimeStep() {
    document.getElementById('memoStep').style.display = 'none';
    document.getElementById('timeStepContainer').style.display = 'block';
    document.getElementById('endTimeSection').style.display = 'block';
    showEndTimeSelector();
}

// ---- 時刻の「スキップ」 ----

function skipStartTime() {
    wizardData.startTime = "";
    document.getElementById('startTimeSection').style.display = 'none';
    document.getElementById('endDatePickerSection').style.display = 'block';
    renderEndDateCalendar();
}

function skipEndTime() {
    wizardData.endTime = "";
    document.getElementById('timeStepContainer').style.display = 'none';
    document.getElementById('memoStep').style.display = 'block';
}

/*
  saveEventFromWizard()
  --------------------------------------------------------------
  「登録」ボタンの処理。ウィザードの入力途中データ（wizardData）を
  正式な予定データに変換し、schedules に保存する。

  保存後、登録した予定の月にカレンダー表示を移動させてから閉じる
  （＝登録した予定がすぐ画面で見えるようにするため）。

  【重要・影響範囲】
  予定データを追加したので、検索用キャッシュ（allEventsCache）も
  rebuildAllEventsCache() で更新している。
  これを忘れると、追加直後の予定がリアルタイム検索に出てこなくなる
  （旧バージョンではこの呼び出しが漏れていた）。
*/
function saveEventFromWizard() {
    wizardData.memo = document.getElementById('wizardMemo').value.trim();
    if (!schedules[wizardData.startDate]) schedules[wizardData.startDate] = [];
    const selectedTemplate = templates.find(t => t.name === wizardData.template);
    const eventData = {
        id: 'ev-' + Date.now() + Math.random().toString(36).substr(2, 5),
        template: wizardData.template,
        templateId: selectedTemplate ? selectedTemplate.id : null,
        startDate: wizardData.startDate,
        startTime: wizardData.startTime,
        endDate: wizardData.endDate,
        endTime: wizardData.endTime,
        memo: wizardData.memo,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    schedules[wizardData.startDate].push(eventData);
    saveAllData();
    rebuildAllEventsCache();
    closeWizardModal();

    const startD = new Date(wizardData.startDate);
    currentYear = startD.getFullYear();
    currentMonth = startD.getMonth();
    updateTitle();
    generateCalendar();
}

function closeWizardModal() {
    document.getElementById('addWizardModal').style.display = 'none';
    document.getElementById('wizardMemo').value = '';
}

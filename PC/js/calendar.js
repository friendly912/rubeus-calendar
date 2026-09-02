/*
  calendar.js
  ==============================================================
  カレンダー本体の描画と、月・年の移動を担当するファイル。
  このアプリの中で一番中心的な役割を持つファイル。
*/

/*
  getEventsForDate(dateKey)
  --------------------------------------------------------------
  指定した日付（dateKey）に表示すべき予定の一覧を返す。

  【連日予定の考え方】
  予定データは開始日にしか保存されていないが、
  「開始日 <= dateKey <= 終了日」の範囲に入っていれば、
  その予定は dateKey の日にも表示する必要がある。
  この関数がその判定をまとめて行い、
  isStartDay（その日が開始日かどうか）・isEndDay（終了日かどうか）を
  付け加えた形で返す。この2つのフラグを見て、
  generateCalendar() が「予定の見た目（開始日/中間日/終了日）」を出し分けている。
*/
function getEventsForDate(dateKey) {
    const events = [];
    Object.keys(schedules).forEach(startKey => {
        (schedules[startKey] || []).forEach(ev => {
            if (!ev.startDate || !ev.endDate) return;
            if (dateKeyInRange(dateKey, ev.startDate, ev.endDate)) {
                events.push({
                    ...ev,
                    isStartDay: dateKey === ev.startDate,
                    isEndDay: dateKey === ev.endDate
                });
            }
        });
    });
    /*
      【2026-08-05 変更、同日中にさらに修正】
      以前は開始時刻だけを見て並べていたため、「開始時刻は無いが締切（終了）
      時刻だけはある」予定が、常に一番最後（時刻なし扱い）に回されてしまっていた。
      「開始時刻があれば開始時刻順、無くて締切時刻だけあれば締切時刻順」に
      並べたいというご要望に対応し、a.startTime || a.endTime という形に変更した。

      【追加修正】上のa.startTime || a.endTimeだけだと、日をまたぐ予定の
      「終了日」で不具合が起きた。例えば「22:00開始→翌日00:00終了」の予定は、
      終了日（翌日）の断片にも元の開始時刻22:00がそのまま入ったオブジェクトが
      来るため、a.startTimeが常にtruthyとなり終了時刻00:00が一切見られず、
      「終了日なのに前日の開始時刻(22:00)扱いで一番最後に並んでしまう」
      （本来は終了時刻00:00で最初に来てほしい）という不具合があった。
      getSortTime() で「終了日（isEndDayがtrueかつisStartDayがfalse）は
      終了時刻を優先する」ようにし、開始日・単日は今まで通り開始時刻を
      優先するようにして解決した。
    */
    function getSortTime(ev) {
        if (ev.isEndDay && !ev.isStartDay) return ev.endTime || ev.startTime;
        return ev.startTime || ev.endTime;
    }
    events.sort((a, b) => timeToMinutes(getSortTime(a)) - timeToMinutes(getSortTime(b)));
    return events;
}

/*
  hasEventsOnDate(dateKey)
  --------------------------------------------------------------
  その日に予定が1件でもあるかどうかを返す。
  複数選択モードの開始条件（予定がある日だけ選択できる）などで使う。
*/
function hasEventsOnDate(dateKey) {
    return getEventsForDate(dateKey).length > 0;
}

/*
  generateCalendar(hitDates)
  --------------------------------------------------------------
  今のcurrentYear/currentMonthの内容で、カレンダーのマス目を全部描き直す。
  月を移動した時、予定を追加/編集/削除した時、検索した時など、
  「画面を最新の状態にしたい」場面では必ずこの関数を呼ぶ。

  引数 hitDates は検索結果（該当する日付の配列）。
  指定されている場合、その日付以外の予定は表示しない
  （＝入力中のリアルタイム検索によるフィルター表示のため。search.js を参照）。
*/
function generateCalendar(hitDates = null) {
    const cal = document.getElementById('calendar');
    const searchTerm = document.getElementById('search').value.toLowerCase().trim();
    cal.innerHTML = '';

    // ---- 曜日の見出し行（日 月 火 ... または 月 火 ... 日）----
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    let firstDayHeaderEl = null;
    for (let i = 0; i < 7; i++) {
        const idx = (i + weekStart) % 7;
        const div = document.createElement('div');
        div.className = 'day-header';
        div.textContent = days[idx];
        cal.appendChild(div);
        if (i === 0) firstDayHeaderEl = div;
    }

    /*
      【2026-08-05 追加】
      「曜日の見出しの高さを1マスとした時、日付マスは2.5マス分の高さに」という
      ご要望に対応するため、実際に描画された曜日見出しの高さ(px)を測って
      CSS変数 --day-header-height に反映している。
      Mobile版のCSS（body.mode-portrait .calendar）だけがこの変数を実際に使って
      日付マスの高さを「曜日見出しの高さ × 2.5」に固定している。PC版のCSSは
      この変数を参照していないため、ここで値をセットしても見た目に影響しない。
    */
    if (firstDayHeaderEl) {
        cal.style.setProperty('--day-header-height', firstDayHeaderEl.offsetHeight + 'px');
    }

    // ---- 月初めの空白マスの計算 ----
    const firstDate = new Date(currentYear, currentMonth, 1);
    let startDay = firstDate.getDay() - weekStart;
    if (startDay < 0) startDay += 7;
    const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement('div');
        empty.style.opacity = "0.3";
        cal.appendChild(empty);
    }

    // ---- 1日から月末まで、日付マスを1つずつ作る ----
    for (let day = 1; day <= lastDate; day++) {
        const dateKey = formatDateKey(currentYear, currentMonth, day);

        const div = document.createElement('div');
        div.className = 'date';
        const dateObj = new Date(currentYear, currentMonth, day);
        const weekday = dateObj.getDay();
        if (weekday === 0) div.classList.add('sunday');
        if (weekday === 6) div.classList.add('saturday');
        div.innerHTML = `<div class="date-num">${day}</div>`;

        if (multiSelectMode && selectedDates.has(dateKey)) {
            div.classList.add('selected-multi');
        }

        const dayEvents = getEventsForDate(dateKey);
        const hasEvents = dayEvents.length > 0;

        dayEvents.forEach((ev) => {
            // 検索中は、条件に一致しない予定は表示しない
            if (searchTerm) {
                const nameMatch = ev.template.toLowerCase().includes(searchTerm);
                const timeMatch = (ev.startTime || "").includes(searchTerm) || (ev.endTime || "").includes(searchTerm);
                const memoMatch = (ev.memo || "").toLowerCase().includes(searchTerm);
                if (!nameMatch && !timeMatch && !memoMatch) return;
            }

            const found = (typeof findTemplateForEvent === 'function')
                ? findTemplateForEvent(ev)
                : { index: templates.findIndex(t => t.name === ev.template), temp: null };
            const temp = found.temp || { color: '#888' };
            const templateIndex = found.index;
            const e = document.createElement('div');
            e.className = 'event';

            // 連日予定の見た目（開始日/中間日/終了日/単日）を出し分ける
            if (ev.isStartDay && ev.isEndDay) {
                e.classList.add('event-single');
            } else if (ev.isStartDay) {
                e.classList.add('event-start');
            } else if (ev.isEndDay) {
                e.classList.add('event-end');
            } else {
                e.classList.add('event-middle');
            }

            // 予定の枠線・背景色をテンプレートの色に合わせる。
            // 【旧バージョンの不具合修正】
            // 以前は borderLeftColor だけをJSで指定し、右側の枠線色は
            // CSSの `border-right-color: inherit` に任せていたが、
            // inherit は「文字色」を継承するだけで、意図した色にならなかった。
            // ここでは左右どちらもJSから明示的に同じ色を指定することで、
            // 単日予定・連日予定の終了日で右側の枠線もきちんとテンプレート色になるようにしている。
            e.style.borderLeftColor = temp.color;
            e.style.borderRightColor = temp.color;

            /*
              【2026-08-05 追加、同日中に仕様変更】
              useCompactEventBars は Mobile版だけの js/main.js で true にしている
              フラグ（PC版では定義されないため typeof でチェックしている）。
              スマホでは日付マスが小さく、「時刻＋テンプレ名」を1行に収めようとすると
              必ず文字が途切れてしまうというご指摘が続いたため、スマホだけ思い切って
              時刻・テンプレ名を表示せず、テンプレートに振った番号だけを示す
              小さいマーカーにした。
              何の予定かはリスト形式で確認するか、カレンダー形式のままその日を
              タップして一覧画面（showEventList）で確認する運用にしている。

              【仕様】
              ・番号は「予定ごと」ではなく「テンプレートごと」に振る
                （templates配列の中の並び順＝サイドバー/ドロワーの表示順が
                 そのまま番号になる。番号の付け方は templates.js の
                 renderTemplates() を参照。表示は【】で囲む。
              ・単日の予定：①のように丸数字だけを表示する。
              ・日をまたぐ予定：どの日の断片（開始/中間/終了）でも同じ丸数字を
                表示する。隣り合う日付マスに同じ数字が並ぶことで、
                「①①①①①」と連続して見える（【】のような囲み記号は使わない。
                2026-08-05に一度【】付きにしたが、シンプルな方が良いとのことで
                外した）。
              ・塗りつぶし背景は使わず、文字色をテンプレートの色にすることで
                目立たせている。

              PC版は画面が広く、この問題が起きていないため、これまで通り
              時刻とテンプレ名を表示する。
            */
            if (typeof useCompactEventBars !== 'undefined' && useCompactEventBars) {
                e.style.color = temp.color; // 文字の色をテンプレートの色にする
                // 【2026-08-05 追加】PC版の予定（薄い色付き背景）と揃えるため、
                // 完全な透明ではなく、テンプレート色を薄く（透明度22）敷いている。
                e.style.backgroundColor = temp.color + '22';
                e.classList.add('event-compact');

                e.textContent = templateIndex >= 0 ? getCircledNumber(templateIndex + 1) : '?';
                e.title = `${getTimeDisplay(ev)} ${ev.template}`; // マウスを乗せた時の補足（.titleはプレーンテキストなのでescapeHtml不要。タッチ操作では出ないが害はない）
            } else {
                e.style.backgroundColor = temp.color + '22';

                /*
                  【2026-08-05 バグ修正】
                  ①日をまたぐ予定の「中間日」だけ、displayStrに既に
                  "(テンプレ名)" を入れているにもかかわらず、この下の行で
                  さらに ${ev.template} を無条件に付け足していたため、
                  「(筋トレ) 筋トレ」のように同じ名前が2回・不要な括弧付きで
                  表示されてしまっていた。中間日はテンプレ名を1回だけ
                  （下の行のtemplate名で）表示すれば十分なため、
                  displayStrを空文字にして重複を無くした。
                  ②「開始日」（isStartDayがtrueでisEndDayがfalse）は、以前は
                  分岐が無く getTimeDisplay(ev) の結果（開始〜終了の全区間）を
                  そのまま使っていたため、例えば「03:00〜16:00」のように、
                  実際には後日にならないと来ない終了時刻まで開始日のマスに
                  表示されてしまっていた。開始日には開始時刻だけを見せ、
                  「03:00 〜」のように終わりが続くことだけ示すようにした。
                */
                let displayStr;
                if (ev.isStartDay && ev.isEndDay) {
                    displayStr = getTimeDisplay(ev); // 単日の予定：開始〜終了をそのまま表示
                } else if (ev.isStartDay) {
                    displayStr = ev.startTime ? `${ev.startTime} 〜` : ''; // 開始日：開始時刻のみ
                } else if (ev.isEndDay) {
                    displayStr = ev.endTime ? `〜 ${ev.endTime} 終了` : ''; // 終了日：終了時刻のみ
                } else {
                    displayStr = ''; // 中間日：時刻は表示しない
                }

                // ev.template（テンプレート名）はユーザーが自由に変更できる文字列のため、
                // escapeHtml() を通してからHTMLに埋め込む（メモと違い、ここは名前のみで
                // メモ本文自体は表示していないが、念のため統一してエスケープしている）。
                e.innerHTML = `${escapeHtml(displayStr)} ${escapeHtml(ev.template)} ${ev.memo ? '<span style="color:#ffeb3b;">★</span>' : ''}`;
            }
            // 【2026-08-05 変更】以前はここで直接 showEventDetail()（その予定の編集画面）を
            // 開いていたが、特にスマホでは予定の帯が小さく密集しているため、
            // 「その日に新しい予定を追加したいだけなのに、既存の予定に誤って
            // タップしてしまい編集画面が開いてしまう」という誤操作が起きやすかった。
            // 日付マスの何もない部分をタップした時と同じ showEventList()（追加・削除を
            // 先頭に表示する一覧画面）を開くようにし、特定の予定を編集したい場合は
            // その一覧からもう一段階選んでもらう形に統一した。
            e.onclick = (evnt) => {
                evnt.stopImmediatePropagation();
                if (multiSelectMode) return;
                showEventList(dateKey, day);
            };
            div.appendChild(e);
        });

        // 「今日」のマスを枠線で強調する
        const today = new Date();
        if (today.getFullYear() === currentYear && today.getMonth() === currentMonth && today.getDate() === day) {
            div.classList.add('today');
        }

        // ---- 日付マスのクリック処理 ----
        // 【優先順位（絶対に変えてはいけない仕様）】
        //   1. 複数選択モード中 → 選択/選択解除
        //   2. コピー中         → その日へ貼り付け
        //   3. 予定が無い日     → 新規登録
        //   4. 予定がある日     → 予定一覧を表示
        div.addEventListener('click', (e) => {
            if (multiSelectMode) {
                if (hasEvents) {
                    toggleDateSelection(dateKey);
                }
                return;
            }
            if (copiedEventData) {
                pasteCopiedEvent(dateKey);
            } else if (!hasEvents) {
                openAddWizard(dateKey);
            } else {
                showEventList(dateKey, day);
            }
        });

        // 右クリック：デスクトップでの複数選択の開始/追加
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (hasEvents) {
                if (!multiSelectMode) {
                    enterMultiSelectMode(dateKey);
                } else {
                    toggleDateSelection(dateKey);
                }
            }
        });

        // 長押し（約550ms）：タッチ端末での複数選択の開始
        // 指を動かした場合は「長押し」とみなさずキャンセルする（誤操作防止）。
        let longPressTimer = null;
        div.addEventListener('touchstart', (e) => {
            if (multiSelectMode) return;
            longPressTimer = setTimeout(() => {
                if (hasEvents) {
                    enterMultiSelectMode(dateKey);
                }
            }, 550);
        }, { passive: true });

        div.addEventListener('touchend', () => {
            if (longPressTimer) clearTimeout(longPressTimer);
        });

        div.addEventListener('touchmove', () => {
            if (longPressTimer) clearTimeout(longPressTimer);
        });

        cal.appendChild(div);
    }
}

// ==================== 年月移動・年月選択モーダル ====================

function updateTitle() {
    if (typeof updateCalendarNameLabel === 'function') updateCalendarNameLabel();
    document.getElementById('monthTitle').textContent = `${currentYear}年 ${currentMonth + 1}月`;
}

function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    updateTitle();
    generateCalendar();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    updateTitle();
    generateCalendar();
}

function changeWeekStart() {
    weekStart = parseInt(document.getElementById('weekStart').value);
    generateCalendar();
    saveAllData();
}

function showDatePicker() {
    updateYearDisplay();
    renderMonthButtons();
    document.getElementById('dateModal').style.display = 'flex';
}

function updateYearDisplay() {
    document.getElementById('currentYearDisplay').textContent = currentYear + '年';
}

function changeYear(diff) {
    currentYear += diff;
    // 扱える年の範囲は2020〜2100年まで
    if (currentYear < 2020) currentYear = 2020;
    if (currentYear > 2100) currentYear = 2100;
    updateYearDisplay();
    renderMonthButtons();
}

function renderMonthButtons() {
    const container = document.getElementById('monthList');
    container.innerHTML = '';
    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        btn.textContent = m + '月';
        btn.style.padding = '14px';
        btn.style.background = (m - 1 === currentMonth) ? 'var(--color-accent-strong)' : '#222233';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.color = 'white';
        btn.onclick = () => {
            currentMonth = m - 1;
            updateTitle();
            generateCalendar();
            closeDateModal();
        };
        container.appendChild(btn);
    }
}

function goToToday() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    updateTitle();
    generateCalendar();
    closeDateModal();
}

function closeDateModal() {
    document.getElementById('dateModal').style.display = 'none';
}

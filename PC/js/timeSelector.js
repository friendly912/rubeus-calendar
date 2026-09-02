/*
  timeSelector.js
  ==============================================================
  このアプリ独自の「時刻入力UI」を担当するファイル。

  【絶対に変えてはいけない仕様】
  一般的な <input type="time"> は使わず、
    午前/午後 → 時 → 分
  の3段階で選ばせる方式になっている。これはクライアントの強いこだわりで
  決まっている仕様なので、リビルドであっても方式そのものは変更しない。

  この画面（予定登録ウィザードの開始/終了時刻、時刻編集モーダルの開始/終了時刻）
  は全部で4箇所あるが、見た目と動きはすべて同じなので、
  createTimeSelector() という1つの関数を共通で使い回している。
*/

/*
  createTimeSelector(isEnd, isEdit, startTimeStr)
  --------------------------------------------------------------
  「午前/午後 → 時 → 分」の3ステップの入力UIをまとめて1つ作って返す関数。

  引数の意味：
  ・isEnd        … 開始時刻用なら false、終了時刻用なら true
  ・isEdit       … 予定登録ウィザード用なら false、時刻編集モーダル用なら true
                   （isEnd/isEdit の組み合わせで、結果をどこに反映するかが変わる）
  ・startTimeStr … 終了時刻を作る場合、比較のために開始時刻の文字列を渡す
                   （開始時刻より前の終了時刻を選べないようにするため）
*/
function createTimeSelector(isEnd = false, isEdit = false, startTimeStr = null) {
    const container = document.createElement('div');
    let ampmVal = "";       // "AM" または "PM"
    let internalHour = null; // 24時間表記の「時」（0〜23）
    let minVal = "";         // "00"〜"55" の2桁の「分」

    /*
      isMultiDay
      --------------------------------------------------------------
      終了時刻を選ぶ場面で、開始日と終了日が違う「連日予定」かどうかを判定する。

      【重要・修正した不具合】
      以前はこの判定をステップ3（分）だけで行っており、ステップ1（午前/午後）・
      ステップ2（時）では判定せずに「同日予定」の制限をそのまま適用していた。
      そのため、開始時刻が午後（例：22:00）から始まる連日予定（翌日の朝に
      終わる予定など）の終了時刻を選ぼうとすると、「午前」のボタン自体が
      ステップ1の時点で押せなくなり、翌日の午前中を終了時刻に選べない
      という不具合が実際に起きていた。3つのステップすべてで同じ判定を
      使うように統一して修正している。

      【予定登録ウィザードと時刻編集モーダルで参照先を分けている理由】
      予定登録ウィザード（isEdit=false）の最中は wizardData に
      入力途中の内容が入っている。
      一方、時刻編集モーダル（isEdit=true）で時刻だけを編集している時は
      wizardData は無関係な値のままなので、代わりに編集対象の予定
      （currentEditEvent.event）の開始日・終了日を見る必要がある。
      ここを間違えると、連日予定の時刻を後から編集する時にだけ
      同じ不具合が再発するので注意。
    */
    const isMultiDay = isEdit
        ? !!(currentEditEvent && currentEditEvent.event.startDate !== currentEditEvent.event.endDate)
        : (wizardData.endDate !== wizardData.startDate);

    // どのプレビュー欄（画面上部の大きな時刻表示）を更新するかは、
    // isEnd / isEdit の組み合わせによって変わる。
    const previewId = isEnd ?
        (isEdit ? "editEndTimePreview" : "endTimePreview") :
        (isEdit ? "editStartTimePreview" : "startTimePreview");

    const updatePreview = () => {
        const previewEl = document.getElementById(previewId);
        if (!previewEl) return;
        let str = " ";
        if (internalHour !== null) {
            const hourStr = internalHour.toString().padStart(2, '0');
            const minStr = minVal ? minVal : '--';
            str += `${hourStr}:${minStr}`;
        } else {
            str += "--:--";
        }
        previewEl.textContent = str;
    };

    // ---- ステップ1：午前 / 午後 ----
    const step1 = document.createElement('div');
    step1.innerHTML = `<h4>午前 / 午後</h4>`;
    const ampmDiv = document.createElement('div');
    ampmDiv.className = 'ampm-grid';
    ['午前', '午後'].forEach(txt => {
        const btn = document.createElement('div');
        btn.className = 'time-btn';
        btn.textContent = txt;

        // 終了時刻を選ぶ場面で、同日予定かつ開始時刻が既に午後（12時以降）なら、
        // 終了時刻として「午前」は選べない（時間が巻き戻ってしまうため）。
        // 連日予定（isMultiDay）の場合はこの制限を適用しない
        // （翌日の午前中に終わる予定を許可するため）。
        let disabled = false;
        if (isEnd && startTimeStr && !isMultiDay) {
            const startH = parseInt(startTimeStr.split(':')[0]);
            if (txt === '午前' && startH >= 12) disabled = true;
        }

        if (disabled) {
            btn.classList.add('disabled');
            btn.style.pointerEvents = 'none';
        } else {
            btn.onclick = () => {
                ampmVal = txt === '午前' ? 'AM' : 'PM';
                step1.style.display = 'none';
                step2.style.display = 'block';
                renderHourButtons();
                updatePreview();
            };
        }
        ampmDiv.appendChild(btn);
    });
    step1.appendChild(ampmDiv);
    container.appendChild(step1);

    // ---- ステップ2：時 ----
    const step2 = document.createElement('div');
    step2.style.display = 'none';
    step2.innerHTML = `<h4>時</h4>`;
    const hourDiv = document.createElement('div');
    hourDiv.className = 'hour-grid';
    step2.appendChild(hourDiv);
    container.appendChild(step2);

    function renderHourButtons() {
        hourDiv.innerHTML = '';
        // 午前なら0〜11時、午後なら12〜23時（24時間表記として内部保存する）
        let startH, endH;
        if (ampmVal === 'AM') { startH = 0; endH = 11; }
        else { startH = 12; endH = 23; }

        for (let h = startH; h <= endH; h++) {
            const btn = document.createElement('div');
            btn.className = 'time-btn';
            btn.textContent = h + "時";

            // 終了時刻選択時、同日予定であれば開始時刻より前の「時」は選べないようにする
            // （連日予定の場合はこの制限を適用しない）
            let isDisabled = false;
            if (isEnd && startTimeStr && !isMultiDay) {
                const startHour = parseInt(startTimeStr.split(':')[0]);
                const startIsAM = startHour < 12;
                const currIsAM = ampmVal === 'AM';
                if (currIsAM && !startIsAM) isDisabled = true;
                else if (currIsAM === startIsAM && h < startHour) isDisabled = true;
            }

            if (isDisabled) {
                btn.classList.add('disabled');
                btn.style.pointerEvents = 'none';
            } else {
                btn.onclick = () => {
                    internalHour = h;
                    step2.style.display = 'none';
                    step3.style.display = 'block';
                    renderMinuteButtons();
                    updatePreview();
                };
            }
            hourDiv.appendChild(btn);
        }
    }

    // ---- ステップ3：分（5分単位） ----
    const step3 = document.createElement('div');
    step3.style.display = 'none';
    step3.innerHTML = `<h4>分</h4>`;
    const minuteSection = document.createElement('div');
    minuteSection.className = 'minute-section';
    step3.appendChild(minuteSection);
    container.appendChild(step3);

    function renderMinuteButtons() {
        minuteSection.innerHTML = '';

        const row1 = [0, 5, 10, 15, 20, 25];
        const row2 = [30, 35, 40, 45, 50, 55];

        [row1, row2].forEach(row => {
            const rowDiv = document.createElement('div');
            rowDiv.className = 'btn-group minute-row';

            row.forEach(m => {
                const mm = m.toString().padStart(2, '0');

                const btn = document.createElement('div');
                btn.className = 'time-btn';
                btn.style.flex = '1';
                btn.textContent = mm + "分";

                // 終了時刻を選んでいる時だけ、開始時刻との前後関係をチェックする。
                // （isEndTimeDisabled の詳しいルールは utils.js を参照。
                //   isMultiDay はこの関数の先頭で一元的に判定したものを使う）
                let disabled = false;
                if (isEnd && startTimeStr && internalHour !== null) {
                    disabled = isEndTimeDisabled(internalHour, m, startTimeStr, isMultiDay);
                }

                if (disabled) {
                    btn.classList.add('disabled');
                    btn.style.pointerEvents = 'none';
                } else {
                    btn.onclick = () => {
                        minVal = mm;
                        step3.style.display = 'none';
                        updatePreview();
                        // 分を選んだ時点で時刻が確定するので、確定処理へ進む
                        confirmTimeSelection(isEnd, isEdit, internalHour, minVal);
                    };
                }

                rowDiv.appendChild(btn);
            });

            minuteSection.appendChild(rowDiv);
        });
    }

    return container;
}

/*
  confirmTimeSelection(isEnd, isEdit, internalHour, minVal)
  --------------------------------------------------------------
  「分」まで選び終わったときに呼ばれ、確定した時刻を
  wizardData（新規登録中）または currentEditEvent（編集中）に書き込み、
  次の画面（終了日選択 / 終了時刻選択 / メモ入力など）へ進める。

  window. を付けてグローバルに公開しているのは、
  createTimeSelector() 内で作られるボタンの onclick から
  直接呼び出す必要があるため（元のコードの構成をそのまま踏襲）。
*/
window.confirmTimeSelection = function (isEnd, isEdit, internalHour, minVal) {
    const previewId = isEnd ?
        (isEdit ? "editEndTimePreview" : "endTimePreview") :
        (isEdit ? "editStartTimePreview" : "startTimePreview");

    const previewEl = document.getElementById(previewId);
    if (!previewEl) return;

    let timeStr = "";
    if (internalHour !== null && minVal) {
        const hourStr = internalHour.toString().padStart(2, '0');
        timeStr = `${hourStr}:${minVal}`;
    }

    if (isEdit) {
        // ---- 時刻編集モーダルからの呼び出し ----
        if (isEnd) {
            currentEditEvent.event.endTime = timeStr;
        } else {
            currentEditEvent.event.startTime = timeStr;
            document.getElementById('editStartTimeSection').style.display = 'none';
            document.getElementById('editEndTimeSection').style.display = 'block';
            showEditEndTimeSelector();
        }
    } else {
        // ---- 予定登録ウィザードからの呼び出し ----
        if (!isEnd) {
            wizardData.startTime = timeStr;
            document.getElementById('startTimeSection').style.display = 'none';
            document.getElementById('endDateSection').style.display = 'block';
            renderEndDateOptions();
        } else {
            wizardData.endTime = timeStr;
            document.getElementById('timeStepContainer').style.display = 'none';
            document.getElementById('memoStep').style.display = 'block';
        }
    }
};

// ---- 予定登録ウィザード用の時刻セレクター表示 ----

function showStartTimeSelector() {
    const container = document.getElementById('startTimeSteps');
    container.innerHTML = '';
    container.appendChild(createTimeSelector(false, false, null));
}

function showEndTimeSelector() {
    const container = document.getElementById('endTimeSteps');
    container.innerHTML = '';
    let startStr = null;
    if (wizardData.startTime) startStr = wizardData.startTime;
    container.appendChild(createTimeSelector(true, false, startStr));
}

// ---- 時刻編集モーダル用の時刻セレクター表示 ----

function showEditStartTimeSelector() {
    const container = document.getElementById('editStartTimeSteps');
    container.innerHTML = '';
    container.appendChild(createTimeSelector(false, true, null));
}

function showEditEndTimeSelector() {
    const container = document.getElementById('editEndTimeSteps');
    container.innerHTML = '';
    let startStr = null;
    if (currentEditEvent && currentEditEvent.event.startTime) {
        startStr = currentEditEvent.event.startTime;
    }
    container.appendChild(createTimeSelector(true, true, startStr));
}

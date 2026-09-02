/*
  storage.js
  ==============================================================
  データの「保存」と「読み込み」を担当するファイル。
  保存先は2種類：
   1. この端末のブラウザの中（localStorage）… 常に使う基本の保存先
   2. Firebase Firestore（インターネット上のデータベース）… 設定でONにした場合のみ

  他のファイル（templates.js, calendar.js など）は、
  データを書き換えたら必ず saveAllData() を呼び出す、という
  ルールで統一されている。保存の詳しい仕組みを意識しなくても、
  「変更したら saveAllData() を呼ぶ」だけ覚えておけばよい。
*/

/*
  migrateTemplateColors(savedData)
  --------------------------------------------------------------
  古いバージョンで保存されたテンプレートの色を、
  最新のデフォルト色に合わせて更新するための処理。

  【具体例】
  以前「朝活」のデフォルト色を変更したとき、
  すでに保存されている人のデータには古い色が残ったままになる。
  この関数は「IDと名前が初期テンプレートと一致していて、かつ
  色だけが違う」場合に、保存データの色を新しいデフォルト色へ
  上書きする。ユーザーが自分で色を変更した場合は
  名前を変えていない限り区別がつかないため、その場合も
  最新色に揃えられる点には注意（テンプレート名を変えていれば対象外になる）。
*/
function migrateTemplateColors(savedData) {
    if (!savedData.templates || !Array.isArray(savedData.templates)) return false;
    let updated = false;
    savedData.templates.forEach(savedTemp => {
        const defaultTemp = defaultTemplates.find(t => t.id === savedTemp.id && t.name === savedTemp.name);
        if (defaultTemp && savedTemp.color !== defaultTemp.color) {
            savedTemp.color = defaultTemp.color;
            updated = true;
        }
    });
    return updated;
}

/*
  saveAllData()
  --------------------------------------------------------------
  現在のテンプレート・予定・各種設定を localStorage に保存する。
  設定が「Firebaseに保存」になっている場合は、続けて
  Firestoreへの同期（syncToFirestore）も行う。

  【いつ呼ぶか】
  テンプレートの追加・編集・削除・並び替え、予定の登録・編集・削除・
  コピー貼り付け、設定の変更など、データが変わるたびに必ず呼び出す。
*/
function saveAllData() {
    if (typeof dbg === 'function') {
        dbg('saveAllData', {
            events: (typeof countScheduleEvents === 'function') ? countScheduleEvents() : -1
        });
    }
    localStorage.setItem(getProfileScopedKey('calendarData'), JSON.stringify({
        templates,
        schedules,
        confirmBeforeDelete
    }));
    if (typeof syncToCloud === 'function') syncToCloud();
}

/*
  loadLocalData()
  --------------------------------------------------------------
  アプリ起動時に、この端末（localStorage）に保存されているデータを読み込む。
  保存データが無い場合（初回起動時）は、デフォルトのテンプレートのまま何もしない。
*/
function loadLocalData() {
    const saved = localStorage.getItem(getProfileScopedKey('calendarData'));
    if (saved) {
        const data = JSON.parse(saved);
        const migrated = migrateTemplateColors(data);
        if (migrated) console.log("テンプレート色を新しいデフォルト色に更新しました");
        templates = data.templates || [...defaultTemplates];
        if (data.schedules) schedules = data.schedules;
        if (typeof data.confirmBeforeDelete !== "undefined") confirmBeforeDelete = data.confirmBeforeDelete;
    }
}

/*
  rebuildAllEventsCache()
  --------------------------------------------------------------
  検索を高速に行うための「全予定一覧キャッシュ（allEventsCache）」を
  今の schedules の中身に合わせて作り直す。

  【重要・影響範囲】
  予定を追加・編集・削除・コピー貼り付けするたびに、
  必ずこの関数を呼び出してキャッシュを最新に保つこと。
  呼び忘れると、入力中のリアルタイム検索（search.js の incrementalSearch）に
  最新の予定が反映されない不具合が起きる
  （実際に旧バージョンではこの呼び出し漏れが原因の不具合があったため、
  今回のリビルドで、データを変更する全ての箇所からこの関数を呼ぶように統一した）。
*/
function rebuildAllEventsCache() {
    allEventsCache = [];
    Object.keys(schedules).forEach(dateKey => {
        (schedules[dateKey] || []).forEach(ev => {
            allEventsCache.push({ dateKey: dateKey, event: ev });
        });
    });
}

/*
  【2026-08-05 追加】バックアップ／復元機能
  ==============================================================
  Firebase保存（自動・継続的な同期）とは別に、「設定不要でその場で
  使える手動のスナップショット」として用意した。
  ・うっかり予定を消してしまった時の保険
  ・Firebaseを使わずに他の端末へ手軽に引っ越す手段
  の2つの用途を想定している。

  バックアップに含める内容は「予定に関わる中身」（テンプレート・予定・
  曜日始まり・配色テーマ・一括削除の確認設定）だけに絞っている。
  saveMode・firebaseConfig（保存方法やFirebaseの接続情報）は、
  端末ごとの環境設定であり、バックアップを読み込んだ側の設定を
  意図せず上書きしてしまうと混乱の元になるため、あえて含めていない。
*/

/*
  downloadBackup()
  --------------------------------------------------------------
  設定画面の「バックアップをダウンロード」ボタンから呼ばれる。
  今のテンプレート・予定などをまとめた1つのJSONファイルを、
  ブラウザのダウンロード機能でこの端末に保存する。
*/
function downloadBackup() {
    const backupData = {
        // 【重要】復元する時に「これはこのカレンダー用のバックアップかどうか」を
        // 見分けるための目印。中身の構造を将来変える時のためのバージョン番号も兼ねる。
        backupFormat: 'rubeus-calendar-backup-v1',
        exportedAt: new Date().toISOString(),
        templates,
        schedules,
        weekStart,
        confirmBeforeDelete,
        theme: localStorage.getItem(getProfileScopedKey(THEME_STORAGE_KEY)) || null
    };

    const json = JSON.stringify(backupData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // 日付入りのファイル名にして、いつ取ったバックアップか分かりやすくする
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = `カレンダーバックアップ_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/*
  restoreBackupFromFile(file)
  --------------------------------------------------------------
  設定画面の「バックアップから復元」で選んだファイルから呼ばれる
  （ファイル選択自体は index.html 側の <input type="file"> が行う）。
  読み込んだ内容で、今のテンプレート・予定などを上書きする。

  【重要】この操作は「今表示しているデータ」を完全に上書きする、
  取り消せない操作のため、実行前に必ず確認ダイアログを出している。
*/
function restoreBackupFromFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        let data;
        try {
            data = JSON.parse(e.target.result);
        } catch (err) {
            alert('このファイルは読み込めませんでした。正しいバックアップファイル（.json）かご確認ください。');
            return;
        }

        // 最低限の中身チェック（全く関係無いJSONファイルを誤って選んでしまう事故を防ぐ）
        if (!data || typeof data !== 'object' || !Array.isArray(data.templates) || typeof data.schedules !== 'object') {
            alert('このファイルはカレンダーのバックアップ形式ではないようです。');
            return;
        }

        const ok = confirm('今のテンプレート・予定を、このバックアップの内容で置き換えます。\nこの操作は取り消せません。よろしいですか？');
        if (!ok) return;

        templates = data.templates;
        schedules = data.schedules;
        if (typeof data.weekStart !== 'undefined') {
            weekStart = data.weekStart;
            document.getElementById('weekStart').value = weekStart; // 設定画面の選択欄も揃える
        }
        if (typeof data.confirmBeforeDelete !== 'undefined') {
            confirmBeforeDelete = data.confirmBeforeDelete;
            document.getElementById('confirmBulkDelete').checked = confirmBeforeDelete; // 設定画面のチェックも揃える
        }
        if (data.theme) {
            localStorage.setItem(getProfileScopedKey(THEME_STORAGE_KEY), data.theme);
            loadTheme();
            applyTheme();
            renderThemeSettingsUI(); // 設定画面のテーマ選択ボタンの見た目も最新にする
        }

        saveAllData();
        rebuildAllEventsCache();
        renderTemplates();
        generateCalendar();

        alert('バックアップから復元しました。');
    };
    reader.readAsText(file);
}

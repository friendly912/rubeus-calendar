/*
  themes.js
  ==============================================================
  「配色テーマ」機能を担当するファイル。
  設定モーダルの中に、あらかじめ用意したテーマの一覧をボタンとして表示し、
  選んだテーマをアプリ全体に反映・保存する。

  【2026-08-03 変更履歴】
  以前は「背景色」「日付セルの色」などを1つ1つ自由に選べる
  カラーピッカー方式（colorSettings.js）だったが、
  「自由度が高すぎると組み合わせによって見た目が崩れてしまう」との
  ご要望があったため、あらかじめバランスを整えた「テーマ」を
  選ぶだけの方式に変更した。

  【仕組みの考え方】
  css/variables.css に、色の基本の初期値が定義されている。
  css/themes.css に、8種類のテーマ（パステル4トーン＋アナスイ4トーン）の
  上書き用の色がまとめて定義されている。
  このファイルは、選ばれたテーマのIDを
      document.body.dataset.theme = 'pastel-rose'
  のようにbodyタグへ設定するだけで、実際の色の切り替えはCSS側の
  仕組み（[data-theme="pastel-rose"] のようなセレクタ）に任せている。

  【テーマの色そのものを調整・追加したい場合】
  css/themes.css を編集し、トーンを追加した場合は下の THEME_STYLES一覧の
  該当スタイルの tones配列にも1行追加すること。

  【2026-09-03 テーマ体系を刷新】
  以前は「ダーク」「ブルー」のような単色テーマを7つ並べる方式だったが、
  クライアントより「パステルスタイル」「アナスイスタイル」という2つの
  大きなスタイルに分け、それぞれ4トーンから選べるようにしたいという
  ご要望があり、単色テーマは全廃してこの2スタイル×4トーン＝8種類に
  置き換えた。THEMES（フラットな一覧）だった変数を THEME_STYLES
  （スタイル→トーンの2階層）に変更している。
*/

// テーマの設定を保存しておくlocalStorageのキー名
const THEME_STORAGE_KEY = 'calendarTheme';

/*
  THEME_STYLES
  --------------------------------------------------------------
  設定画面に表示するテーマの一覧。「スタイル」の中に「トーン」が
  4つずつ入っている2階層構造。
  ・style.id / style.label … スタイルの区分（見出しとして表示）
  ・tone.id     … css/themes.css の [data-theme="id"] と対応させる名前
  ・tone.label  … 設定画面に表示する日本語名
  ・tone.swatch … 設定画面のボタンに表示する、そのトーンを代表する色見本
*/
const THEME_STYLES = [
    {
        id: 'pastel',
        label: 'パステル',
        tones: [
            { id: 'pastel-rose', label: 'ローズ', swatch: '#d68fa0' },
            { id: 'pastel-green', label: 'セージ', swatch: '#8fae7a' },
            { id: 'pastel-yellow', label: 'バター', swatch: '#cf9f3f' },
            { id: 'pastel-lavender', label: 'ラベンダー', swatch: '#a6a0e0' }
        ]
    },
    {
        id: 'annasui',
        label: 'アナスイ',
        tones: [
            { id: 'annasui-gold', label: 'ゴールド', swatch: '#d9a54a' },
            { id: 'annasui-rose', label: 'ローズ', swatch: '#e0949c' },
            { id: 'annasui-green', label: 'エメラルド', swatch: '#7ecb96' },
            { id: 'annasui-purple', label: 'パープル', swatch: '#a08cd6' }
        ]
    }
];

// THEME_STYLES から、有効なテーマIDだけを取り出したフラットな一覧
// （保存されている値が今も選べるテーマかどうかの確認に使う）
const THEME_IDS = THEME_STYLES.flatMap(style => style.tones.map(tone => tone.id));

// 今選ばれているテーマのID
let currentTheme = 'pastel-rose';

// 設定モーダルを開いた時点でのテーマを覚えておく変数。
// 「キャンセル」で元に戻すために使う（詳しくは snapshotTheme / revertThemeIfNeeded を参照）。
let themeSnapshotBeforeEdit = null;

/*
  loadTheme()
  --------------------------------------------------------------
  起動時にlocalStorageから、前回選んだテーマを読み込む。
  保存されていなければ "dark"（現行のダークテーマ）のままにする。
*/
function loadTheme() {
    // 【2026-08-03 プロフィール機能に対応】
    // テーマの好みは人によって違う（パートナーと自分で違う色を使いたい、という
    // ご要望がそもそもの出発点だったため）、プロフィールごとに別々に保存する。
    //
    // 【2026-09-03】以前の単色テーマ（dark/blue等）のIDが保存されたままの場合、
    // THEME_IDSに含まれず無効な値になるため、その場合も既定の 'pastel-rose' に戻す。
    const saved = localStorage.getItem(getProfileScopedKey(THEME_STORAGE_KEY));
    currentTheme = saved && THEME_IDS.includes(saved) ? saved : 'pastel-rose';
}

/*
  applyTheme()
  --------------------------------------------------------------
  今の currentTheme の値を、実際にページへ反映する。
  bodyタグに data-theme属性を付けるだけで、実際の色の切り替えは
  css/themes.css 側のCSSセレクタが自動的に行う。
*/
function applyTheme() {
    document.body.dataset.theme = currentTheme;
}

/*
  setTheme(themeId)
  --------------------------------------------------------------
  設定画面のテーマボタンから呼ばれる。

  【重要・2026-08-03 挙動を変更】
  以前はここで即座に localStorage へ保存していたため、
  「保存」を押さずに「閉じる」を押しても、選んだテーマが
  そのまま反映され続けてしまう（他の設定項目と挙動が違う）という
  ご指摘をいただいた。
  現在は、ここでは画面上の見た目を仮に切り替える「プレビュー」だけを行い、
  実際に保存するのは saveSettings() から commitTheme() が呼ばれた時
  （＝「保存」ボタンを押した時）だけにしている。
  「キャンセル」で閉じた場合は revertThemeIfNeeded() が元のテーマに戻す。
*/
function setTheme(themeId) {
    currentTheme = themeId;
    applyTheme();
    renderThemeSettingsUI();
}

/*
  snapshotTheme()
  --------------------------------------------------------------
  設定モーダルを開いた瞬間の「今のテーマ」を覚えておく。
  showSettingsModal() から呼ばれる。
*/
function snapshotTheme() {
    themeSnapshotBeforeEdit = currentTheme;
}

/*
  commitTheme()
  --------------------------------------------------------------
  今プレビュー中のテーマを、正式に保存する。
  設定モーダルの「保存」ボタン（saveSettings）から呼ばれる。
*/
function commitTheme() {
    localStorage.setItem(getProfileScopedKey(THEME_STORAGE_KEY), currentTheme);
    themeSnapshotBeforeEdit = null;
    if (typeof syncThemeToCloud === 'function') syncThemeToCloud();
}

/*
  revertThemeIfNeeded()
  --------------------------------------------------------------
  設定モーダルを「保存」せずに閉じた場合（キャンセルボタン・×ボタン・
  モーダルの外側をクリック・Escapeキーのいずれでも）に呼ばれ、
  モーダルを開く前のテーマへ戻す。
  closeSettingsModal() の中から呼ばれるため、モーダルの閉じ方に
  関わらず必ず動作する。
*/
function revertThemeIfNeeded() {
    if (themeSnapshotBeforeEdit !== null && themeSnapshotBeforeEdit !== currentTheme) {
        currentTheme = themeSnapshotBeforeEdit;
        applyTheme();
        renderThemeSettingsUI();
    }
    themeSnapshotBeforeEdit = null;
}

/*
  renderThemeSettingsUI()
  --------------------------------------------------------------
  設定モーダルの中の「配色テーマ」欄に、THEME_STYLES の内容を
  「スタイル見出し＋4トーンのボタン」のグループとして並べて表示する。
  今選ばれているトーンには枠を付けて分かるようにする。
*/
function renderThemeSettingsUI() {
    const container = document.getElementById('themeSettingsContainer');
    if (!container) return;
    container.innerHTML = '';

    THEME_STYLES.forEach(style => {
        const group = document.createElement('div');
        group.className = 'theme-style-group';

        const heading = document.createElement('div');
        heading.className = 'theme-style-heading';
        heading.textContent = style.label;
        group.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'theme-options';

        style.tones.forEach(tone => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theme-option-btn' + (tone.id === currentTheme ? ' selected' : '');
            btn.onclick = () => setTheme(tone.id);

            const swatch = document.createElement('span');
            swatch.className = 'theme-swatch';
            swatch.style.background = tone.swatch;

            const label = document.createElement('span');
            label.textContent = tone.label;

            btn.appendChild(swatch);
            btn.appendChild(label);
            grid.appendChild(btn);
        });

        group.appendChild(grid);
        container.appendChild(group);
    });
}

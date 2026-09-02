/*
  【重要】このファイルはPC版（../PC/js/themes.js）と全く同じ中身です。
  配色テーマの仕組みはPCでもスマホでも共通にするため、あえて複製しています。
  そのため、動作に関する修正（バグ修正・仕様変更）をする場合は、
  必ずPC版とMobile版の両方の同名ファイルを同時に直してください。
  （画面の見た目やレイアウトだけの変更なら、CSS側だけを直せば済みます）
*/

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
  css/variables.css に、色の初期値（ダークテーマ）が定義されている。
  css/themes.css に、それ以外のテーマ（ブルー・グリーン等）の
  上書き用の色がまとめて定義されている。
  このファイルは、選ばれたテーマのIDを
      document.body.dataset.theme = 'blue'
  のようにbodyタグへ設定するだけで、実際の色の切り替えはCSS側の
  仕組み（[data-theme="blue"] のようなセレクタ）に任せている。

  【テーマの色そのものを調整・追加したい場合】
  ・現行の「ダーク」の色を直したい     → css/variables.css の :root
  ・他のテーマの色を直したい／増やしたい → css/themes.css
  を編集し、テーマを追加した場合は下の THEMES一覧にも1行追加すること。
*/

// テーマの設定を保存しておくlocalStorageのキー名
const THEME_STORAGE_KEY = 'calendarTheme';

/*
  THEMES
  --------------------------------------------------------------
  設定画面に表示するテーマの一覧。
  ・id      … css/themes.css の [data-theme="id"] と対応させる名前
  ・label   … 設定画面に表示する日本語名
  ・swatch  … 設定画面のボタンに表示する、そのテーマを代表する色見本
*/
const THEMES = [
    { id: 'dark', label: 'ダーク（現行）', swatch: '#4488dd' },
    { id: 'blue', label: 'ブルー', swatch: '#2f74e0' },
    { id: 'green', label: 'グリーン', swatch: '#2fae76' },
    { id: 'purple', label: 'パープル', swatch: '#9b52e8' },
    { id: 'brown', label: 'ブラウン', swatch: '#c78a3d' },
    { id: 'mono', label: 'モノクロ', swatch: '#999999' }
];

// 今選ばれているテーマのID
let currentTheme = 'dark';

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
    const saved = localStorage.getItem(getProfileScopedKey(THEME_STORAGE_KEY));
    currentTheme = saved && THEMES.some(t => t.id === saved) ? saved : 'dark';
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
  設定モーダルの中の「配色テーマ」欄に、THEMES の項目分だけ
  テーマ選択ボタンを並べて表示する。
  今選ばれているテーマには枠を付けて分かるようにする。
*/
function renderThemeSettingsUI() {
    const container = document.getElementById('themeSettingsContainer');
    if (!container) return;
    container.innerHTML = '';

    THEMES.forEach(theme => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-option-btn' + (theme.id === currentTheme ? ' selected' : '');
        btn.onclick = () => setTheme(theme.id);

        const swatch = document.createElement('span');
        swatch.className = 'theme-swatch';
        swatch.style.background = theme.swatch;

        const label = document.createElement('span');
        label.textContent = theme.label;

        btn.appendChild(swatch);
        btn.appendChild(label);
        container.appendChild(btn);
    });
}

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
  css/themes.css に、10種類のテーマ（パステル5トーン＋ダークモード5トーン）の
  上書き用の色がまとめて定義されている。
  このファイルは、選ばれたテーマのIDを
      document.body.dataset.theme = 'pastel-blue'
  のようにbodyタグへ設定するだけで、実際の色の切り替えはCSS側の
  仕組み（[data-theme="pastel-blue"] のようなセレクタ）に任せている。

  【テーマの色そのものを調整・追加したい場合】
  css/themes.css を編集し、トーンを追加した場合は下の THEME_STYLES一覧の
  該当スタイルの tones配列にも1行追加すること。

  【2026-09-03 テーマ体系を刷新】
  以前は「ダーク」「ブルー」のような単色テーマを7つ並べる方式だったが、
  クライアントより「パステルスタイル」「アナスイスタイル」という2つの
  大きなスタイルに分け、それぞれ複数トーンから選べるようにしたいという
  ご要望があり、単色テーマは全廃してこの2スタイルに置き換えた。
  THEMES（フラットな一覧）だった変数を THEME_STYLES
  （スタイル→トーンの2階層）に変更している。

  【2026-09-05 パステルのトーン構成を刷新】
  「ローズ／セージ／バター／ラベンダー」の4トーンから、
  「ニュアンスブルー／セージ／スモーキーピンク／カフェオレベージュ」＋
  新規追加の「モノトーン」の5トーンに変更した（色そのものの調整は
  css/themes.css を参照）。IDも分かりやすいよう
  pastel-rose→pastel-pink、pastel-yellow→pastel-beige、
  pastel-lavender→pastel-blue に変更している。

  【2026-09-06 「アナスイ」→「ダークモード」に表示名を変更、ベーストーン追加】
  「配色バリエーションの路線は良いが、元のダークモードのベースも残しておきたい」
  というご要望を受け、
    ・スタイルの表示名を「アナスイ」から「ダークモード」に変更
    （内部IDは 'annasui' のまま。保存済みデータへの影響を避けるため）
    ・元々のダークモード（css/variables.css の :root）の色をそのまま使う
      「ベース」トーン（annasui-blue）を追加し、他の色違いトーンと
      同じグループの先頭に配置
  を行った。「ベースと、その色違いバリエーションが対になって並ぶ」という
  構成が今回のご要望のポイント。
*/

// テーマの設定を保存しておくlocalStorageのキー名
const THEME_STORAGE_KEY = 'calendarTheme';

/*
  THEME_STYLES
  --------------------------------------------------------------
  設定画面に表示するテーマの一覧。「スタイル」の中に「トーン」が
  複数入っている2階層構造。
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
            { id: 'pastel-blue', label: 'ニュアンスブルー', swatch: '#a98cc9' },
            { id: 'pastel-green', label: 'セージ', swatch: '#7a9c68' },
            { id: 'pastel-pink', label: 'スモーキーピンク', swatch: '#9c6f79' },
            { id: 'pastel-beige', label: 'カフェオレベージュ', swatch: '#ab8a63' },
            { id: 'pastel-mono', label: 'モノトーン', swatch: '#7a7a7a' }
        ]
    },
    {
        // 【2026-09-06】表示名は「アナスイ」から「ダークモード」に変更したが、
        // 内部ID（'annasui'、および各トーンの 'annasui-xxx'）は保存済みの
        // localStorageの値を無効にしないよう、そのまま残している。
        id: 'annasui',
        label: 'ダークモード',
        tones: [
            // 【2026-09-06追加】元々のダークモード（css/variables.css の :root）の
            // 色そのものをベーストーンとして復活させた。「ベースと、その
            // 色違いバリエーションが同じグループにまとまっている」という
            // ご要望への対応。他のトーン（ゴールド以降）より先頭に置いている。
            { id: 'annasui-blue', label: 'ベース', swatch: '#44aaff' },
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
let currentTheme = 'pastel-blue';

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
    // 【2026-09-03】以前の単色テーマ（dark/blue等）やパステルの旧トーンID
    // （pastel-rose等）が保存されたままの場合、THEME_IDSに含まれず無効な
    // 値になるため、その場合も既定の 'pastel-blue' に戻す。
    const saved = localStorage.getItem(getProfileScopedKey(THEME_STORAGE_KEY));
    currentTheme = saved && THEME_IDS.includes(saved) ? saved : 'pastel-blue';
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

/*
  ==============================================================
  フォント切り替え機能
  ==============================================================
  2026-09-05追加。配色テーマとは別に、文字のフォントも
  「標準ゴシック／明朝体／丸文字」から選べるようにする機能。
  色のテーマ切り替えと全く同じ考え方・同じ設定モーダルの
  保存/キャンセルの流れ（スナップショット→プレビュー→確定 or 差し戻し）に
  乗せているため、上のテーマ関連の関数と対になる作りになっている。

  【仕組み】
  document.body.dataset.font = 'mincho' のようにbodyタグへ設定するだけで、
  実際のフォントの切り替えは css/variables.css 側の
  body[data-font="mincho"] { --font-heading: ...; --font-body: ...; }
  というセレクタが行う。年月タイトルなどは --font-heading を、
  それ以外の通常の文字は --font-body を参照しているため、
  この2つの変数さえ書き換えれば全体のフォントが揃って変わる。
*/

// フォントの設定を保存しておくlocalStorageのキー名
const FONT_STORAGE_KEY = 'calendarFont';

/*
  FONTS
  --------------------------------------------------------------
  設定画面に表示するフォントの一覧。
  ・id    … body[data-font="id"] と対応させる名前
  ・label … 設定画面に表示する日本語名
*/
const FONTS = [
    { id: 'gothic', label: '標準ゴシック' },
    { id: 'mincho', label: '明朝体' },
    { id: 'maru', label: '丸文字' }
];

// 今選ばれているフォントのID
let currentFont = 'mincho';

// 設定モーダルを開いた時点でのフォントを覚えておく変数（キャンセル時に戻すため）
let fontSnapshotBeforeEdit = null;

/*
  loadFont()
  --------------------------------------------------------------
  起動時にlocalStorageから、前回選んだフォントを読み込む。
  保存されていない・無効な値の場合は既定の明朝体のままにする。
*/
function loadFont() {
    const saved = localStorage.getItem(getProfileScopedKey(FONT_STORAGE_KEY));
    currentFont = saved && FONTS.some(f => f.id === saved) ? saved : 'mincho';
}

function applyFont() {
    document.body.dataset.font = currentFont;
}

/*
  setFont(fontId)
  --------------------------------------------------------------
  設定画面のフォントボタンから呼ばれる。テーマと同じく、ここでは
  見た目を仮に切り替える「プレビュー」だけを行い、実際の保存は
  saveSettings() から commitFont() が呼ばれた時だけ行う。
*/
function setFont(fontId) {
    currentFont = fontId;
    applyFont();
    renderFontSettingsUI();
}

function snapshotFont() {
    fontSnapshotBeforeEdit = currentFont;
}

function commitFont() {
    localStorage.setItem(getProfileScopedKey(FONT_STORAGE_KEY), currentFont);
    fontSnapshotBeforeEdit = null;
    if (typeof syncFontToCloud === 'function') syncFontToCloud();
}

function revertFontIfNeeded() {
    if (fontSnapshotBeforeEdit !== null && fontSnapshotBeforeEdit !== currentFont) {
        currentFont = fontSnapshotBeforeEdit;
        applyFont();
        renderFontSettingsUI();
    }
    fontSnapshotBeforeEdit = null;
}

/*
  renderFontSettingsUI()
  --------------------------------------------------------------
  設定モーダルの中の「フォント」欄に、FONTS の項目分だけ
  ボタンを並べて表示する。ボタン自体もそのフォントで表示することで、
  選ぶ前にどんな見た目になるかが分かるようにしている。
*/
function renderFontSettingsUI() {
    const container = document.getElementById('fontSettingsContainer');
    if (!container) return;
    container.innerHTML = '';

    const fontFamilyFor = {
        gothic: 'sans-serif',
        mincho: "'Shippori Mincho', serif",
        maru: "'Zen Maru Gothic', sans-serif"
    };

    FONTS.forEach(font => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-option-btn' + (font.id === currentFont ? ' selected' : '');
        btn.style.fontFamily = fontFamilyFor[font.id];
        btn.onclick = () => setFont(font.id);

        const label = document.createElement('span');
        label.textContent = font.label;

        btn.appendChild(label);
        container.appendChild(btn);
    });
}

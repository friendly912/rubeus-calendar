/*
  colorSettings.js
  ==============================================================
  「配色設定」機能を担当するファイル。
  設定モーダルの中に、色を選ぶための項目（カラーピッカー）を表示し、
  選んだ色をアプリ全体に反映・保存する。

  【仕組みの考え方】
  css/variables.css で、アプリ中の色はすべて「CSS変数」
  （例： --color-bg 、 --color-accent など）として定義されている。
  この仕組みのおかげで、JavaScriptから
      document.documentElement.style.setProperty('--color-bg', '#123456')
  のように1行書くだけで、そのCSS変数を使っている画面上の全部の場所に
  一気に新しい色を反映できる。この機能はその仕組みを利用している。

  【保存の仕組み】
  選んだ色は、予定やテンプレートのデータ（saveAllData）とは別に、
  この端末のlocalStorageに専用のキーで保存している。
  （＝配色は「その端末ごとの好み」であり、パートナーとご自身で
    異なる色を使いたいというご要望とも相性がよい保存方法）

  【影響範囲】
  ここで変更するのは見た目の色だけで、予定やテンプレートのデータには
  一切影響しない。「配色を初期状態に戻す」を押せば、いつでも
  variables.css で定義された元の色に戻せる。
*/

// 配色の設定をこの端末に保存しておくlocalStorageのキー名
const COLOR_SETTINGS_STORAGE_KEY = 'calendarCustomColors';

/*
  CUSTOMIZABLE_COLORS
  --------------------------------------------------------------
  設定画面に表示する「色を選べる項目」の一覧。
  1つの項目が複数のCSS変数をまとめて書き換えることもある
  （例：「メインアクセントカラー」は、青系で統一されていた
    複数のCSS変数をまとめて同じ色に揃えることで、
    1回の色選択でアプリ全体の雰囲気を変えられるようにしている）。

  【この一覧に項目を追加する場合】
  { key: 好きな名前（保存用のID）, cssVars: [変更したいCSS変数名の配列], label: 設定画面に表示する日本語名 }
  の形で1行追加するだけで、設定画面に自動で項目が増える。
*/
const CUSTOMIZABLE_COLORS = [
    { key: 'bg', cssVars: ['--color-bg'], label: '背景色' },
    { key: 'panelBg', cssVars: ['--color-panel-bg'], label: 'パネル・ヘッダーの背景' },
    { key: 'cellBg', cssVars: ['--color-cell-bg'], label: '日付セルの背景' },
    { key: 'weekend', cssVars: ['--color-weekend'], label: '土日の文字色' },
    {
        key: 'accent',
        cssVars: ['--color-accent', '--color-accent-2', '--color-accent-3', '--color-accent-4', '--color-accent-strong', '--color-day-header-text'],
        label: 'メインアクセントカラー（ボタン・見出しなど）'
    }
];

// 今選ばれている色（選んだ項目だけが入る。選んでいない項目は元のCSSの色のまま）
let customColors = {};

/*
  loadCustomColors()
  --------------------------------------------------------------
  起動時にlocalStorageから、前回保存した配色設定を読み込む。
*/
function loadCustomColors() {
    const saved = localStorage.getItem(COLOR_SETTINGS_STORAGE_KEY);
    customColors = saved ? JSON.parse(saved) : {};
}

function saveCustomColorsToStorage() {
    localStorage.setItem(COLOR_SETTINGS_STORAGE_KEY, JSON.stringify(customColors));
}

/*
  applyCustomColors()
  --------------------------------------------------------------
  customColors の中身を、実際にページのCSS変数へ反映する。
  値が設定されていない項目は removeProperty で「指定なし」に戻し、
  variables.css に書かれている元の色がそのまま使われるようにする。
*/
function applyCustomColors() {
    CUSTOMIZABLE_COLORS.forEach(item => {
        const value = customColors[item.key];
        item.cssVars.forEach(cssVar => {
            if (value) {
                document.documentElement.style.setProperty(cssVar, value);
            } else {
                document.documentElement.style.removeProperty(cssVar);
            }
        });
    });
}

/*
  getCurrentColorValue(item)
  --------------------------------------------------------------
  設定画面のカラーピッカーに最初に表示する色を決める。
  すでにこの項目を変更したことがあればその色を、
  まだ一度も変更していなければ、今実際に使われている色
  （variables.cssで定義されている元の色）を表示する。
*/
function getCurrentColorValue(item) {
    if (customColors[item.key]) return customColors[item.key];
    const raw = getComputedStyle(document.documentElement).getPropertyValue(item.cssVars[0]).trim();
    return raw || '#000000';
}

/*
  renderColorSettingsUI()
  --------------------------------------------------------------
  設定モーダルの中の「配色」欄に、CUSTOMIZABLE_COLORS の項目分だけ
  カラーピッカー（<input type="color">）を並べて表示する。
  ページ読み込み時に1回だけ呼べばよい
  （カラーピッカーの選択状態はモーダルを開閉しても消えないため）。
*/
function renderColorSettingsUI() {
    const container = document.getElementById('colorSettingsContainer');
    if (!container) return;
    container.innerHTML = '';

    CUSTOMIZABLE_COLORS.forEach(item => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; margin:10px 0;';

        const label = document.createElement('span');
        label.textContent = item.label;
        label.style.cssText = 'font-size:14px;';

        const input = document.createElement('input');
        input.type = 'color';
        input.value = getCurrentColorValue(item);
        input.style.cssText = 'width:52px; height:34px; border:none; border-radius:6px; cursor:pointer; background:none; padding:0;';

        // 色を選んでいる最中（ドラッグ中など）はその場で見た目に反映するだけにし、
        // 選び終わった（changeイベント）タイミングで保存する。
        // こうすることで、選んでいる途中の色を毎回全部localStorageに書き込む
        // 無駄な処理を避けている。
        input.addEventListener('input', () => {
            customColors[item.key] = input.value;
            applyCustomColors();
        });
        input.addEventListener('change', () => {
            saveCustomColorsToStorage();
        });

        row.appendChild(label);
        row.appendChild(input);
        container.appendChild(row);
    });
}

/*
  resetCustomColors()
  --------------------------------------------------------------
  設定モーダルの「配色を初期状態に戻す」ボタンの処理。
  すべてのカスタム配色を消して、variables.cssの元の色に戻す。
*/
function resetCustomColors() {
    customColors = {};
    saveCustomColorsToStorage();
    applyCustomColors();
    renderColorSettingsUI();
}

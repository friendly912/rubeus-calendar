/*
  displayMode.js（スマホ版だけに存在するファイル）
  ==============================================================
  「横画面表示」と「縦画面表示」を、端末を回転させなくても
  手動で切り替えられるようにする機能。

  【なぜこの機能を作ったか】
  以前は body.mode-landscape / body.mode-portrait というクラスを
  「実際に端末を回転させた向き」に自動で合わせるだけだった
  （calendar.css・drawer.css・modal.css がこのクラスを見て見た目を変えている）。
  クライアントから「スマホのロックのオン・オフ、もしくは設定から
  現状の見せ方と縦画面用の見せ方を選べるようにしたい」というご要望があったため、
  実際の向きに関係なく、設定から好きな表示方式を選べるようにした。

  【仕組みの概要】
  1. 選んだ表示方式（"auto" / "landscape" / "portrait"）を
     この端末のlocalStorageに保存しておく。
  2. "auto"が選ばれている間は、これまで通り実際の端末の向きを見て
     自動でクラスを切り替える。
  3. "landscape" または "portrait" が選ばれている間は、
     実際に端末をどちらに回転させても、選んだ方の見た目で固定表示する。

  【影響範囲】
  ここで付け外ししている body.mode-landscape / body.mode-portrait は、
  calendar.css・drawer.css・modal.css の中で見た目を切り替える条件として
  使われている。クラス名を変更する場合は、その3つのCSSファイルも
  合わせて修正すること。
*/

// 表示方式を保存しておくlocalStorageのキー名
const DISPLAY_MODE_STORAGE_KEY = 'mobileDisplayMode';

// 今選ばれている表示方式（"auto" / "landscape" / "portrait"）
let displayMode = 'auto';

/*
  detectPhysicalOrientation()
  --------------------------------------------------------------
  端末を実際にどちら向きに持っているかを判定する。
  window.matchMedia を使うことで、CSSの @media (orientation: ...) と
  同じ基準で「今は縦か横か」を JavaScript側からも判定できる。
*/
function detectPhysicalOrientation() {
    return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
}

/*
  applyDisplayMode()
  --------------------------------------------------------------
  今の displayMode の値に応じて、bodyタグに
  mode-landscape または mode-portrait のクラスを付け替える。

  displayMode が "auto" の場合は、実際の端末の向き（detectPhysicalOrientation）を
  そのまま使う。つまり今まで通り、回転させれば見た目も切り替わる。

  displayMode が "landscape" または "portrait" の場合は、
  実際の向きに関係なくその見た目に固定する。
*/
function applyDisplayMode() {
    const effectiveMode = displayMode === 'auto' ? detectPhysicalOrientation() : displayMode;

    document.body.classList.remove('mode-landscape', 'mode-portrait');
    document.body.classList.add('mode-' + effectiveMode);

    updateDisplayModeButtons();

    // 「横画面表示⇄縦画面表示」が切り替わったタイミングで、
    // 縦画面専用の「カレンダー形式／リスト形式」の表示状態も更新する。
    // （listView.js が後から読み込まれるファイルのため、念のため存在確認してから呼ぶ）
    if (typeof applyViewFormat === 'function') applyViewFormat();
}

/*
  setDisplayMode(mode)
  --------------------------------------------------------------
  ドロワー内の切り替えボタンから呼ばれる。
  選んだ表示方式を保存し、その場で見た目に反映する。
*/
function setDisplayMode(mode) {
    displayMode = mode;
    localStorage.setItem(DISPLAY_MODE_STORAGE_KEY, mode);
    applyDisplayMode();
}

/*
  updateDisplayModeButtons()
  --------------------------------------------------------------
  ドロワー内の「自動／横画面表示／縦画面表示」ボタンのうち、
  今選ばれているものだけに .active クラスを付けて強調表示する。
*/
function updateDisplayModeButtons() {
    // 【重要】「カレンダー形式／リスト形式」ボタン（listView.js）も見た目を揃えるために
    // 同じ .display-mode-btn クラスを付けているため、ここでは
    // .display-mode-switcher の中にあるボタンだけに絞り込んで選択している。
    // 絞り込まずに .display-mode-btn だけで探すと、カレンダー形式/リスト形式の
    // ボタンにも誤って反応してしまう（実際に起きた不具合のため要注意）。
    document.querySelectorAll('.display-mode-switcher .display-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === displayMode);
    });
}

/*
  loadDisplayMode()
  --------------------------------------------------------------
  起動時にlocalStorageから前回選んだ表示方式を読み込む。
  保存されていなければ "auto"（実際の向きに合わせる）のままにする。

  【重要】index.html の <body> 直後にある小さな <script> でも
  同じキーを読んで初期表示のクラスを先に付けている（画面がちらつくのを防ぐため）。
  ここでの読み込みは、その後にボタンの見た目やイベント登録を正しく行うためのもの。
*/
function loadDisplayMode() {
    const saved = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    displayMode = saved || 'auto';
}

/*
  initDisplayModeUI()
  --------------------------------------------------------------
  ドロワー内の切り替えボタンにクリック処理を設定し、
  端末が回転した時（"auto"の時だけ）に見た目を自動更新するようにする。
  main.js の初期化処理から1回だけ呼ばれる。
*/
function initDisplayModeUI() {
    loadDisplayMode();
    applyDisplayMode();

    document.querySelectorAll('.display-mode-switcher .display-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => setDisplayMode(btn.dataset.mode));
    });

    // "auto"の時だけ、実際に端末を回転させたタイミングで見た目を更新する
    window.matchMedia('(orientation: portrait)').addEventListener('change', () => {
        if (displayMode === 'auto') applyDisplayMode();
    });
}

/*
  drawer.js
  ==============================================================
  スマホ版だけに存在するファイル（PC版には無い）。

  PC版では「検索・行動テンプレート・設定」を左右2カラムで常時表示していたが、
  スマホの画面は横幅・高さともに限られているため、
  普段は隠しておき、ボタンを押した時だけ画面の右側から
  重なるように出てくる「ドロワー（引き出し）」という形に変更している。

  クライアントの言葉を借りると「カレンダーとテンプレートを2枚の紙と考えて、
  呼び出した時だけ右端に重ねる」というイメージのUIを実現する部分。

  【影響範囲】
  ここで開閉しているのは、あくまで見た目（表示位置）だけであり、
  中の検索・テンプレート・設定の動作そのもの（search.js, templates.js, settings.js）は
  PC版と完全に同じロジックをそのまま使っている。
*/

/*
  openDrawer() / closeDrawer() / toggleDrawer()
  --------------------------------------------------------------
  ドロワー（#sidebarDrawer）とその背景の暗い幕（#drawerBackdrop）の
  表示・非表示を切り替える。

  背景の幕を用意しているのは、
   ・ドロワーの外側をタップしたら閉じられるようにするため
   ・ドロワーが開いている間、後ろのカレンダーを誤って操作してしまわないようにするため
  の2つの理由から。
*/
function openDrawer() {
    document.getElementById('sidebarDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
}

function closeDrawer() {
    document.getElementById('sidebarDrawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
}

function toggleDrawer() {
    const drawer = document.getElementById('sidebarDrawer');
    if (drawer.classList.contains('open')) {
        closeDrawer();
    } else {
        openDrawer();
    }
}

// 縦画面でのスワイプ開閉を有効にするかどうか（設定画面のチェックボックスで変更可能）
const PORTRAIT_SWIPE_STORAGE_KEY = 'mobilePortraitSwipeEnabled';
let portraitSwipeEnabled = true;

/*
  loadPortraitSwipeSetting() / setPortraitSwipeEnabled(enabled)
  --------------------------------------------------------------
  縦画面スワイプのON/OFF設定を読み込み・保存する。
  【重要】この設定だけは、他の設定（■データ保存 等）と違って
  設定モーダルの【保存】ボタンを押すのを待たず、チェックボックスを
  切り替えたその場でlocalStorageに保存される（index.htmlのonchange参照）。
  ON/OFFをその場で試して確かめたい、という性質の設定のため。
*/
function loadPortraitSwipeSetting() {
    const saved = localStorage.getItem(PORTRAIT_SWIPE_STORAGE_KEY);
    portraitSwipeEnabled = saved === null ? true : saved === 'true';
    const toggle = document.getElementById('portraitSwipeToggle');
    if (toggle) toggle.checked = portraitSwipeEnabled;
}

function setPortraitSwipeEnabled(enabled) {
    portraitSwipeEnabled = enabled;
    localStorage.setItem(PORTRAIT_SWIPE_STORAGE_KEY, String(enabled));
}

/*
  スワイプでメニューを開閉する処理
  ==============================================================
  【2026-08-05 追加、同日中に縦画面にも対応】
  横画面表示はただでさえ高さに余裕が無く、カレンダー本体をできるだけ
  広く使いたいというご要望があるため、メニューを開くためのボタン自体を
  置いていない。その代わり、画面のどこでも「右から左へスワイプ」すると
  メニューが開き、「左から右へスワイプ」すると閉じるようにしている。

  【縦画面にも対応した経緯】
  縦画面はドロワーが画面いっぱいに広がる作りのため、以前あった右上の
  ×ボタンがノッチの真下に隠れて押せなくなり、メニューから戻れなくなる
  不具合が起きた。ボタンを廃止し、下部の「カレンダーに戻る」タブに
  加えて、横画面と同じスワイプ操作でも閉じられるようにしている
  （縦画面では開く操作としても使える）。ただし縦画面には下部タブという
  確実な代替手段が既にあるため、スワイプが誤反応して煩わしいと感じる方の
  ために、縦画面のスワイプだけは設定でOFFにできるようにしてある
  （横画面はタブが無く、OFFにすると閉じる手段が無くなるため対象外）。

  【誤動作しないための工夫】
  ・横方向にある程度の距離（SWIPE_THRESHOLD）動いた時だけスワイプとみなす。
    指が少し震えただけで反応しないようにするため。
  ・縦方向の移動量が横方向より大きい場合は「スクロールしようとしている」と
    判断してスワイプとみなさない。カレンダーを縦にスクロールする操作を
    妨げないようにするため。
  ・行動テンプレートを長押しして並び替えている間は、メニューの開閉スワイプを止める。
*/
(function () {
    const SWIPE_THRESHOLD = 60; // これ以上横に動いたらスワイプとみなす（px）

    let startX = 0;
    let startY = 0;
    let tracking = false;

    function isSwipeActive() {
        if (document.body.classList.contains('mode-landscape')) return true; // 横画面は常時有効
        if (document.body.classList.contains('mode-portrait')) return portraitSwipeEnabled; // 縦画面は設定次第
        return false;
    }

    document.addEventListener('touchstart', (e) => {
        if (window.isTemplateReordering || window.isTemplateTouch) {
            tracking = false;
            return;
        }
        if (!isSwipeActive() || e.touches.length !== 1) {
            tracking = false;
            return;
        }
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        tracking = true;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (window.isTemplateReordering || window.isTemplateTouch) {
            tracking = false;
            return;
        }
        if (!tracking) return;
        tracking = false;
        if (!isSwipeActive()) return;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - startX;
        const deltaY = touch.clientY - startY;

        if (Math.abs(deltaX) < SWIPE_THRESHOLD) return; // 横方向の移動が足りない
        if (Math.abs(deltaY) > Math.abs(deltaX)) return; // 縦方向優勢＝スクロール操作とみなす

        if (deltaX < 0) {
            openDrawer();  // 右から左へのスワイプ
        } else {
            closeDrawer(); // 左から右へのスワイプ
        }
    }, { passive: true });
})();

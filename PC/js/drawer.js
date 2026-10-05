/*
  drawer.js（PC版）
  ==============================================================
  【2026-10-05 追加】
  以前のPC版は「検索・行動テンプレート・設定」を画面右側のサイドバーに
  常時表示していたが、クライアントから「スマホ版と同じ操作体系にしたい」
  というご要望があり、下部の「メニュー」タブを押した時だけ画面の右側から
  重なるように出てくる「ドロワー（引き出し）」に変更した。
  スマホ版の Mobile/js/drawer.js と同じ考え方・同じ関数名にしている。

  【閉じ方】
   ・右上の×ボタン
   ・ドロワーの外側（暗い幕 #drawerBackdrop）のクリック
   ・ドロワーをマウスで右方向へドラッグ（このファイルの下半分）
   ・Escキー（main.js）

  【影響範囲】
  ここで開閉しているのは、あくまで見た目（表示位置）だけであり、
  中の検索・テンプレート・設定の動作そのもの（search.js, templates.js, settings.js）は
  今までと全く同じロジックをそのまま使っている。
*/

function openDrawer() {
    document.getElementById('sidebarDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
}

function closeDrawer() {
    const drawer = document.getElementById('sidebarDrawer');
    drawer.classList.remove('open');
    drawer.style.transform = ''; // ドラッグ中に付けた位置指定を外し、CSSのアニメーションに任せる
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

function isDrawerOpen() {
    const drawer = document.getElementById('sidebarDrawer');
    return !!drawer && drawer.classList.contains('open');
}

/*
  右方向へのドラッグで閉じる処理
  ==============================================================
  ドロワーをマウスで掴んで右へ動かすと、指（マウス）に合わせて
  ドロワーが右へずれていき、離した時に一定以上動いていれば閉じる。
  足りなければ元の位置へ戻る。

  【誤動作しないための工夫】
  ・入力欄・セレクト・ボタンの上で押した時はドラッグを始めない
    （文字の選択やクリックを邪魔しないため）。
  ・行動テンプレートはブラウザ標準のドラッグ＆ドロップで並び替えや
    検索欄への投げ込みに使っているため、テンプレートの上で押した時も始めない。
  ・押してから少し（DRAG_START_PX）動くまではドラッグとみなさない。
    普通のクリックがドラッグ扱いにならないようにするため。
  ・縦方向の動きの方が大きい場合はドラッグとみなさない
    （テンプレート一覧のスクロール操作などを邪魔しないため）。
*/
(function () {
    const DRAG_START_PX = 8;      // これ以上横に動いたらドラッグ開始
    const CLOSE_RATIO = 0.25;     // ドロワー幅のこの割合以上動かして離したら閉じる
    const CLOSE_MIN_PX = 80;      // ただし最低でもこのpx以上は動かす必要がある

    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let dragging = false;

    function isIgnoredTarget(target) {
        return !!target.closest('input, select, textarea, button, label, .template');
    }

    function reset(drawer) {
        pointerId = null;
        dragging = false;
        drawer.classList.remove('dragging');
    }

    document.addEventListener('DOMContentLoaded', () => {
        const drawer = document.getElementById('sidebarDrawer');
        if (!drawer) return;

        drawer.addEventListener('pointerdown', (e) => {
            if (!isDrawerOpen() || e.button !== 0 || isIgnoredTarget(e.target)) return;
            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            dragging = false;
        });

        drawer.addEventListener('pointermove', (e) => {
            if (e.pointerId !== pointerId) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!dragging) {
                if (Math.abs(dx) < DRAG_START_PX && Math.abs(dy) < DRAG_START_PX) return;
                if (dx <= 0 || Math.abs(dy) > Math.abs(dx)) {
                    reset(drawer); // 左方向・縦方向の動きはドラッグとして扱わない
                    return;
                }
                dragging = true;
                drawer.classList.add('dragging'); // drawer.css でアニメーションと文字選択を止める
                // ドロワーの外までマウスが出ても、離すまでドラッグを追い続けるため
                try { drawer.setPointerCapture(e.pointerId); } catch (_) { /* 取れなくてもドラッグ自体は続ける */ }
            }
            drawer.style.transform = `translateX(${Math.max(0, dx)}px)`;
        });

        const finish = (e) => {
            if (e.pointerId !== pointerId) return;
            const wasDragging = dragging;
            const dx = e.clientX - startX;
            reset(drawer);
            if (!wasDragging) return;
            const threshold = Math.max(CLOSE_MIN_PX, drawer.offsetWidth * CLOSE_RATIO);
            if (e.type === 'pointerup' && dx >= threshold) {
                closeDrawer();
            } else {
                drawer.style.transform = ''; // 元の位置へ戻す
            }
        };
        drawer.addEventListener('pointerup', finish);
        drawer.addEventListener('pointercancel', finish);
    });
})();

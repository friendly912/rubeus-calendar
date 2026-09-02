/*
  profiles.js
  ==============================================================
  「個人ごとにデータを分ける」ための仕組みを担当するファイル。

  【採用した方式（重要）】
  以前検討した「プルダウンでプロフィールを切り替える」方式ではなく、
  「入口URLを開いた人ごとに、自動で専用のランダムURLを発行する」
  方式を採用している。

    ・全員に同じ「入口URL」（例：.../Mobile/index.html）を伝える
    ・誰かがそれを初めて開くと、その人の端末の中だけで
      新しいランダムな合言葉（プロフィールID）が自動で作られ、
      URLの後ろに ?p=ランダムな文字列 が付け足される
    ・本人がそのURL（アドレスバーに表示されているもの）を
      ブックマークして、次回からはそのURLを使う
    ・これにより、他の人（提供者本人を含む）が、他の誰かの
      URLを一覧で見たり知ったりすることは無い
      （＝アプリの中に「プロフィール一覧」のような画面は存在しない）

  【正直な注意点】
  これは「推測されにくいランダムな文字列」による区別であり、
  パスワードのような強固な保護ではない。URLさえ他人に知られて
  しまえば、その人のデータが見られてしまう点は変わらない。

  【他のファイルへの影響】
  storage.js・themes.js は、この仕組みが提供する
  getProfileScopedKey() / getFirestoreDocId() を使って、
  保存先を「今のプロフィール専用」の場所にしている。
  新しく「プロフィールごとに分けて保存したいデータ」が増えた場合も、
  同様に getProfileScopedKey() を通した上でキー名を決めること。
*/

// このブラウザが今使っているプロフィールのIDを覚えておくキー名（固定・プロフィールに依存しない）
const ACTIVE_PROFILE_KEY = 'calendarActiveProfileId';
// プロフィール機能を導入する前から使われていた、予定データの保存キー名
const LEGACY_DATA_KEY = 'calendarData';
// 【2026-08-05 追加】設定画面の「＋ 新しいカレンダーを始める」ボタンで
// 発行した直後だけ一時的に立てる目印（詳しくは startNewCalendar() を参照）
const NEW_PROFILE_VIA_BUTTON_KEY = 'calendarNewProfileViaButton';

// 今表示しているプロフィールのID（'main' は「プロフィール機能導入前からのデータ」を表す特別なID）
let activeProfileId = 'main';
// 今回のアクセスで、新しくプロフィールが自動発行されたかどうか（お知らせ表示の判定に使う）
let isNewlyCreatedProfile = false;

/*
  generateProfileId()
  --------------------------------------------------------------
  他人からは推測できない、ランダムな文字列を作る。
  現在時刻と乱数を組み合わせているため、他の人と偶然同じ
  文字列になる心配はほぼない。
*/
function generateProfileId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
}

/*
  ensureProfilesInitialized()
  --------------------------------------------------------------
  ページ読み込み時、他の何よりも先に呼び出す関数。
  「今どのプロフィールとして扱うか」を、以下の優先順位で決める。

    1. URLに ?p=... が付いている        → そのプロフィールIDを使う
    2. このブラウザで前回使ったプロフィールを覚えている → それを使い、URLにも反映する
    3. このブラウザに、プロフィール機能導入前からのデータがある
                                        → 'main' として扱う
       （＝もともと使っていたブックマークが、そのまま動き続けるようにするための後方互換）
    4. どれにも当てはまらない（本当に初めて開いた端末） → 新しいプロフィールを自動発行する
*/
function ensureProfilesInitialized() {
    // 予定の本体はログイン中の Firebase アカウント側。
    // 以前の ?p=... は入口URLを分けてしまうため、付けない・付いていたら外す。
    activeProfileId = 'main';
    isNewlyCreatedProfile = false;
    const url = new URL(window.location.href);
    if (url.searchParams.has('p')) {
        url.searchParams.delete('p');
        history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
}

function updateUrlWithProfileId() {
    ensureProfilesInitialized();
}

/*
  getProfileScopedKey(baseKey)
  --------------------------------------------------------------
  「calendarData」のような元のキー名を、今のプロフィール専用の
  キー名に変換する。

  例：
    プロフィールが 'main'（プロフィール機能導入前からのデータ）の場合
      → 'calendarData'（元のまま。データ移行が一切不要になる）
    プロフィールが 'p1a2b3c4...' の場合
      → 'calendarData_p1a2b3c4...'
*/
function getProfileScopedKey(baseKey) {
    const user = firebase.auth && firebase.auth().currentUser;
    if (user && user.uid) return baseKey + '_' + user.uid;
    return baseKey + '_signedout';
}

/*
  getFirestoreDocId()
  --------------------------------------------------------------
  Firebase保存を使う場合の、Firestore上の保存先ドキュメント名。
  プロフィールIDをそのままドキュメント名として使う
  （'main' プロフィールなら、これまで通り "main" という保存先になる）。
*/
function getFirestoreDocId() {
    return activeProfileId;
}

/*
  showNewProfileNoticeIfNeeded()
  --------------------------------------------------------------
  「このURLをブックマークしてください」というお知らせを表示する。
  以下のどちらかに当てはまる時だけ表示する。
    ・このアクセスで初めてプロフィールが自動発行された場合
      （入口URLをそのまま開いた、本当に初めてのアクセス）
    ・設定画面の「＋ 新しいカレンダーを始める」ボタン経由で
      新しいプロフィールへ切り替えた直後の場合（NEW_PROFILE_VIA_BUTTON_KEY）
  【重要】このボタン経由のケースは、切り替え後のURLに最初から ?p=... が
  付いた状態でページが読み込まれるため、isNewlyCreatedProfile（URLに
  ?p=が無い時だけtrueになる）だけでは判定できない。そのため
  startNewCalendar() が事前に立てておいた目印をあわせて見ている。
*/
function showNewProfileNoticeIfNeeded() {
    const viaButton = localStorage.getItem(NEW_PROFILE_VIA_BUTTON_KEY) === 'true';
    if (!isNewlyCreatedProfile && !viaButton) return;
    if (viaButton) localStorage.removeItem(NEW_PROFILE_VIA_BUTTON_KEY); // 表示は1回だけにする
    const notice = document.getElementById('newProfileNotice');
    if (notice) notice.style.display = 'flex';
}

/*
  getUniversalProfileUrl()
  --------------------------------------------------------------
  【2026-08-05 追加】
  今のプロフィール（自分専用の合言葉）を、PC版・スマホ版どちらの機器でも
  正しく開ける形のURLに組み立てて返す。

  【なぜ必要か】
  以前は window.location.href（今開いている画面そのもののURL）を
  そのままコピーしていたが、これだと例えばパソコンでコピーしたURLには
  "/PC/index.html" が含まれてしまい、そのURLをスマホで開くと
  スマホ画面にPC版のレイアウトが表示されてしまっていた。
  サイトの一番外側の入口（ルートのindex.html、js自体は無くパスのみ）は
  開いた端末に応じてPC版/スマホ版へ自動振り分けする仕組みになっているため、
  そちらのURLに個人の合言葉（?p=...）だけを付け直すことで、
  「どちらの機器で開いても正しい見た目で、かつ同じデータにたどり着ける」
  URLになる。
*/
function getUniversalProfileUrl() {
    return window.location.origin + '/';
}

/*
  copyCurrentUrl()
  --------------------------------------------------------------
  お知らせの中の「URLをコピー」ボタン・設定画面の「URLをコピー」ボタンから
  呼ばれる。PC版・スマホ版どちらの機器でも開ける共通のURL
  （getUniversalProfileUrl()）をクリップボードにコピーする。
  例えば、パソコンで最初に開いて発行されたURLを、自分のスマホに
  メッセージなどで送って、スマホでも同じデータを見られるようにする時に使う。
*/
function copyCurrentUrl() {
    navigator.clipboard.writeText(getUniversalProfileUrl()).then(() => {
        alert('URLをコピーしました。');
    }).catch(() => {
        alert('コピーに失敗しました。お手数ですが、アドレスバーのURLを手動でコピーしてください。');
    });
}

function dismissNewProfileNotice() {
    const notice = document.getElementById('newProfileNotice');
    if (notice) notice.style.display = 'none';
}

/*
  startNewCalendar()
  --------------------------------------------------------------
  設定画面の「＋ 新しいカレンダーを始める」ボタンから呼ばれる。
  今の端末で、意図的に別の（空の）カレンダーを新しく始めたい時のための機能。

  【なぜ必要か】
  この仕組みは「知っている端末では、入口URLを開き直しても勝手には
  増やさない」ように作ってある（これは事故防止のための仕様）。
  そのため、今の端末で本当にもう1つ別のカレンダーを持ちたい時に、
  普通の方法（入口URLを開き直す）では実現できない。このボタンは、
  その「意図した」場合だけの抜け道として用意している。

  【処理の流れ】
  1. 確認ダイアログを出す（誤操作対策。今のURLを先にコピーするよう促す）。
  2. 新しいランダムなプロフィールIDを作る。
  3. 次回の読み込み時に「専用のカレンダーを作成しました」の案内が出るよう、
     目印（NEW_PROFILE_VIA_BUTTON_KEY）をlocalStorageに残す。
  4. 新しいIDを ?p=... に付けたURLへ実際に移動する（＝ページ全体を
     読み込み直す）。こうすることで、テンプレートや予定、配色設定などの
     画面上のあらゆる状態が、確実にまっさらな初期状態に揃う
     （中途半端にJavaScript側だけで変数をリセットしようとすると、
     どこか1つ直し忘れて前のカレンダーの情報が残ってしまう危険がある）。
*/
function startNewCalendar() {
    if (typeof createNewCalendar === 'function') createNewCalendar();
}

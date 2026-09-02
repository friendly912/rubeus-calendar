/*
  firebase-config.js
  ==============================================================
  Firebase プロジェクト（Ruby-Calendar07）の接続情報。
  利用者が設定画面に API Key などを入力しなくてよいように、
  アプリ側へ固定している。

  【読み込み順】
  state.js のあと、他の処理の前に読む。
  state.js が空の firebaseConfig を用意し、このファイルが中身を入れる。

  【注意】
  この値は Web アプリでは公開される前提の情報。
  データの保護は Firestore のルール側で行う。

  authDomain は Google ログインの戻り先として、
  プロジェクト作成時から許可されている firebaseapp.com を使う。
  web.app にすると、Google 側の許可リストに無い戻り先になり
  「このアプリのリクエストは無効です」になる。
*/
firebaseConfig = {
    apiKey: "AIzaSyDsSQR1D905TTkOho59tc-jDomDngt5ukY",
    authDomain: "ruby-calendar07.firebaseapp.com",
    projectId: "ruby-calendar07",
    storageBucket: "ruby-calendar07.firebasestorage.app",
    messagingSenderId: "49762139671",
    appId: "1:49762139671:web:201f8c0aa864ef67222652"
};

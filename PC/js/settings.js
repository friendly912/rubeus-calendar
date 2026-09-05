/*
  settings.js
  設定モーダル。アカウント表示・ログアウト、削除確認、バックアップ、テーマ。
*/

function showSettingsModal() {
    const emailEl = document.getElementById('signedInEmail');
    const user = firebase.auth && firebase.auth().currentUser;
    if (emailEl) emailEl.textContent = user ? (user.email || '(Googleアカウント)') : '';

    const urlEl = document.getElementById('currentCalendarUrl');
    if (urlEl) urlEl.value = window.location.origin + '/';

    document.getElementById('confirmBulkDelete').checked = confirmBeforeDelete;
    if (typeof renderCalendarSwitcher === 'function') renderCalendarSwitcher();
    document.getElementById('settingsModal').style.display = 'flex';
    snapshotTheme();
    snapshotFont();
}

function closeSettingsModal() {
    revertThemeIfNeeded();
    revertFontIfNeeded();
    document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
    confirmBeforeDelete = document.getElementById('confirmBulkDelete').checked;
    commitTheme();
    commitFont();
    saveAllData();
    closeSettingsModal();
}

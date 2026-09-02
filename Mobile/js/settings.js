/*
  【重要】このファイルはPC版（../PC/js/settings.js）とロジックを揃えています。
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
}

function closeSettingsModal() {
    revertThemeIfNeeded();
    document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
    confirmBeforeDelete = document.getElementById('confirmBulkDelete').checked;
    commitTheme();
    saveAllData();
    closeSettingsModal();
}

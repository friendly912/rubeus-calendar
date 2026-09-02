/*
  main.js
  起動処理。未ログインならログイン画面、ログイン後にカレンダーを始める。
*/

let calendarAppStarted = false;

async function startCalendarApp() {
    if (calendarAppStarted) return;
    calendarAppStarted = true;

    ensureProfilesInitialized();
    if (typeof resetLocalCalendarState === 'function') resetLocalCalendarState();
    loadTheme();
    applyTheme();
    renderThemeSettingsUI();

    updateTitle();
    renderTemplates();
    rebuildAllEventsCache();
    generateCalendar();

    isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    const searchInput = document.getElementById('search');
    searchInput.addEventListener('input', updateClearButton);
    const searchDropZone = document.querySelector('.search-drop-zone') || searchInput;
    searchDropZone.addEventListener('dragover', (e) => e.preventDefault(), true);
    searchDropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const templateName = e.dataTransfer.getData('text/plain');
        if (templateName) applyTemplateNameToSearch(templateName);
    }, true);

    document.addEventListener('keydown', e => {
        if (e.key === "Escape") {
            if (multiSelectMode) {
                cancelMultiSelect();
                return;
            }
            if (copiedEventData) {
                copiedEventData = null;
                document.getElementById('copyStatus').style.display = 'none';
                generateCalendar();
                return;
            }
            revertThemeIfNeeded();
            document.querySelectorAll('.modal').forEach(m => {
                if (m.style.display === 'flex') m.style.display = 'none';
            });
        }
    });

    updateClearButton();
}

window.onload = async () => {
    initializeFirebaseApp();
    bindLoginForm();

    await completeGoogleRedirectIfNeeded();

    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            document.body.classList.remove('auth-pending', 'logged-out');
            document.body.classList.add('logged-in');
            hideLoginOverlay();
            updateSignedInEmail();
            if (typeof logClientEvent === 'function') logClientEvent('login');
            await startCalendarApp();
            await restoreActiveCalendar();
            subscribeToCloudCalendar();
            if (typeof subscribeToPrefs === 'function') subscribeToPrefs();
        } else {
            document.body.classList.remove('auth-pending', 'logged-in');
            document.body.classList.add('logged-out');
            showLoginOverlay();
        }
    });
};

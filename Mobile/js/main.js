/*
  main.js（スマホ版）
*/

const useCompactEventBars = true;
let calendarAppStarted = false;

async function startCalendarApp() {
    if (calendarAppStarted) return;
    calendarAppStarted = true;

    ensureProfilesInitialized();
    if (typeof resetLocalCalendarState === 'function') resetLocalCalendarState();
    loadTheme();
    applyTheme();
    renderThemeSettingsUI();
    loadFont();
    applyFont();
    renderFontSettingsUI();

    // 【2026-09-06 追加】起動時は必ず「今日を含む月」を表示する。
    // js/state.js の currentYear / currentMonth は開発中に使っていた暫定値
    // （2026年8月）のまま残っており、それを更新する処理がここに無かったため、
    // スマホでアプリを完全に終了してから開き直した時など、前回どの月を
    // 見ていたかに関わらず常にその暫定値の月が開いてしまう不具合があった。
    const today = new Date();
    currentYear = today.getFullYear();
    currentMonth = today.getMonth();

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

    document.getElementById('menuTabBtn').addEventListener('click', toggleDrawer);
    document.getElementById('drawerReturnTab').addEventListener('click', closeDrawer);
    document.getElementById('drawerBackdrop').addEventListener('click', closeDrawer);

    loadPortraitSwipeSetting();
    initDisplayModeUI();
    initViewFormatUI();

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
            if (document.getElementById('sidebarDrawer').classList.contains('open')) {
                closeDrawer();
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

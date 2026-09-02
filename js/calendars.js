/*
  calendars.js
  同じアカウント内でカレンダーを切り替える（仕事用／プライベート用など）。
*/

function updateCalendarNameLabel() {
    const el = document.getElementById('calendarNameLabel');
    if (el) el.textContent = currentCalendarName || 'メイン';
}

function renderCalendarSwitcher() {
    beginIgnoreSwitcherChange();
    document.querySelectorAll('.calendar-switcher').forEach((sel) => {
        const previousOnChange = sel.onchange;
        sel.onchange = null;
        sel.innerHTML = '';
        calendarSummaries.forEach((cal) => {
            const opt = document.createElement('option');
            opt.value = cal.id;
            opt.textContent = cal.name;
            if (cal.id === activeCalendarId) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.value = activeCalendarId;
        sel.onchange = previousOnChange;
        sel.disabled = switchInProgress;
    });
    updateCalendarNameLabel();
}

async function onCalendarSwitcherChange(sel) {
    if (ignoreSwitcherChange || switchInProgress) {
        if (sel) sel.value = activeCalendarId;
        return;
    }
    const id = sel && sel.value;
    if (!id || id === activeCalendarId) return;
    await switchCalendar(id);
}

async function switchCalendar(id) {
    if (!id || id === activeCalendarId || switchInProgress) return;
    lockCalendarSwitch();
    try {
        await waitUntilNotApplyingRemote();
        cloudSyncPaused = false;
        pendingCloudSync = false;
        await syncToCloud();
        stopCloudCalendar();
        beginFreshCalendarLoad();
        activeCalendarId = id;
        const found = calendarSummaries.find((c) => c.id === id);
        currentCalendarName = found ? found.name : '無題';
        applyKnownCalendarTheme(found);
        updateCalendarNameLabel();
        resetLocalCalendarState();
        await saveLastCalendarId();
        renderCalendarSwitcher();
        subscribeToCloudCalendar();
        logClientEvent('switch_calendar', { to: id });
    } catch (e) {
        unlockCalendarSwitch();
        console.warn(e);
    }
}

let calendarNameModalMode = 'create';

function showCalendarNameError(msg) {
    const el = document.getElementById('calendarNameError');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function closeCalendarNameModal() {
    const modal = document.getElementById('calendarNameModal');
    if (modal) modal.style.display = 'none';
    showCalendarNameError('');
}

function openCalendarNameModal(mode) {
    calendarNameModalMode = mode === 'rename' ? 'rename' : 'create';
    const modal = document.getElementById('calendarNameModal');
    const title = document.getElementById('calendarNameModalTitle');
    const input = document.getElementById('calendarNameInput');
    if (!modal || !input) return;
    if (title) title.textContent = calendarNameModalMode === 'rename' ? 'カレンダー名を変更' : '新しいカレンダー';
    input.value = calendarNameModalMode === 'rename' ? (currentCalendarName || '') : '';
    showCalendarNameError('');
    modal.style.display = 'flex';
    setTimeout(() => input.focus(), 50);
}

function createNewCalendar() {
    openCalendarNameModal('create');
}

function renameCurrentCalendar() {
    openCalendarNameModal('rename');
}

async function submitCalendarNameModal() {
    const input = document.getElementById('calendarNameInput');
    const name = ((input && input.value) || '').trim();
    if (!name) {
        showCalendarNameError('名前を入力してください。');
        return;
    }
    if (calendarNameModalMode === 'rename') {
        closeCalendarNameModal();
        if (name === currentCalendarName) return;
        currentCalendarName = name;
        const item = calendarSummaries.find((c) => c.id === activeCalendarId);
        if (item) item.name = name;
        renderCalendarSwitcher();
        await syncToCloud();
        return;
    }
    closeCalendarNameModal();
    await createNewCalendarWithName(name);
}

async function createNewCalendarWithName(name) {
    if (switchInProgress) return;
    lockCalendarSwitch();
    const col = getCalendarsCollection();
    if (!col) {
        unlockCalendarSwitch();
        return;
    }
    try {
        await waitUntilNotApplyingRemote();
        cloudSyncPaused = false;
        pendingCloudSync = false;
        await syncToCloud();
        const id = 'c' + Date.now().toString(36);
        const themeId = (typeof currentTheme !== 'undefined' && currentTheme) ? currentTheme : 'dark';
        await col.doc(id).set({
            name,
            templates: JSON.parse(JSON.stringify(defaultTemplates)),
            schedules: {},
            weekStart: 0,
            confirmBeforeDelete: true,
            theme: themeId,
            updatedAt: new Date().toISOString()
        });
        calendarSummaries.push({ id, name, theme: themeId });
        stopCloudCalendar();
        beginFreshCalendarLoad();
        activeCalendarId = id;
        currentCalendarName = name;
        applyKnownCalendarTheme({ theme: themeId });
        updateCalendarNameLabel();
        resetLocalCalendarState();
        await saveLastCalendarId();
        renderCalendarSwitcher();
        subscribeToCloudCalendar();
        logClientEvent('create_calendar', { name: name, id: id });
    } catch (e) {
        unlockCalendarSwitch();
        console.warn(e);
        alert('カレンダーの作成に失敗しました。');
    }
}

async function deleteCurrentCalendar() {
    if (calendarSummaries.length <= 1) {
        alert('カレンダーが1つしかないため、削除できません。');
        return;
    }
    const name = currentCalendarName || 'このカレンダー';
    if (!confirm('「' + name + '」を削除します。予定も消えます。よろしいですか？')) return;
    const col = getCalendarsCollection();
    if (!col || switchInProgress) return;
    const deletingId = activeCalendarId;
    lockCalendarSwitch();
    try {
        await col.doc(deletingId).delete();
        calendarSummaries = calendarSummaries.filter((c) => c.id !== deletingId);
        const next = calendarSummaries[0];
        stopCloudCalendar();
        beginFreshCalendarLoad();
        activeCalendarId = next.id;
        currentCalendarName = next.name;
        applyKnownCalendarTheme(next);
        updateCalendarNameLabel();
        resetLocalCalendarState();
        await saveLastCalendarId();
        renderCalendarSwitcher();
        subscribeToCloudCalendar();
    } catch (e) {
        unlockCalendarSwitch();
        console.warn(e);
        alert('削除に失敗しました。');
    }
}

(function bindCalendarNameForm() {
    const form = document.getElementById('calendarNameForm');
    if (!form) return;
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitCalendarNameModal();
    });
})();

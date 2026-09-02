/*
  cloud.js
  ログインしたユーザーの予定を Firestore へ保存・購読する。
  保存先: users/{uid}/calendars/{calendarId}
*/

let calendarUnsubscribe = null;
let prefsUnsubscribe = null;
let applyingRemoteUpdate = false;
let cloudSyncPaused = false;
let switchInProgress = false;
let allowCreateIfMissing = false;
let ignoreSwitcherChange = false;
let ignoreSwitcherTimer = null;
let switchUnlockTimer = null;
let lastLocalWriteAt = 0;
let lastLocalWriteCalendarId = null;
let pendingCloudSync = false;
let calendarEpoch = 0;
let loadedCalendarId = null;
let syncChain = Promise.resolve();
let activeCalendarId = 'main';
let currentCalendarName = 'メイン';
let calendarSummaries = [];

function parseRemoteMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : 0;
}

function isLikelyIOS() {
    const ua = navigator.userAgent || '';
    if (/iP(hone|ad|od)/.test(ua)) return true;
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

function beginIgnoreSwitcherChange() {
    ignoreSwitcherChange = true;
    if (ignoreSwitcherTimer) clearTimeout(ignoreSwitcherTimer);
    ignoreSwitcherTimer = setTimeout(() => {
        ignoreSwitcherChange = false;
        ignoreSwitcherTimer = null;
    }, 600);
}

function lockCalendarSwitch() {
    switchInProgress = true;
    setSwitcherBusy(true);
    if (switchUnlockTimer) clearTimeout(switchUnlockTimer);
    switchUnlockTimer = setTimeout(() => {
        switchInProgress = false;
        setSwitcherBusy(false);
        switchUnlockTimer = null;
    }, 12000);
}

function unlockCalendarSwitch() {
    if (switchUnlockTimer) {
        clearTimeout(switchUnlockTimer);
        switchUnlockTimer = null;
    }
    switchInProgress = false;
    cloudSyncPaused = false;
    setSwitcherBusy(false);
}

function setSwitcherBusy(busy) {
    document.querySelectorAll('.calendar-switcher').forEach((sel) => {
        sel.disabled = !!busy;
    });
}

function beginFreshCalendarLoad() {
    calendarEpoch += 1;
    pendingCloudSync = false;
    lastLocalWriteAt = 0;
    lastLocalWriteCalendarId = null;
    loadedCalendarId = null;
    cloudSyncPaused = true;
}

async function waitUntilNotApplyingRemote() {
    for (let i = 0; i < 50; i++) {
        if (!applyingRemoteUpdate) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

function mapCalendarSummary(doc) {
    const data = doc.data() || {};
    return {
        id: doc.id,
        name: data.name || '無題',
        theme: data.theme || null
    };
}

function applyKnownCalendarTheme(summary) {
    const themeId = summary && summary.theme;
    if (!themeId || typeof THEMES === 'undefined' || !THEMES.some((t) => t.id === themeId)) return;
    currentTheme = themeId;
    applyTheme();
    if (typeof renderThemeSettingsUI === 'function') renderThemeSettingsUI();
}

function logClientEvent(action, extra) {
    try {
        const user = firebase.auth && firebase.auth().currentUser;
        if (!user || !db) return;
        const entry = {
            at: new Date().toISOString(),
            action: String(action || ''),
            calendarId: activeCalendarId || null,
            extra: extra || null
        };
        const ref = db.collection('users').doc(user.uid).collection('meta').doc('debug');
        ref.get().then((doc) => {
            const items = (doc.exists && Array.isArray(doc.data().items)) ? doc.data().items.slice() : [];
            items.push(entry);
            while (items.length > 30) items.shift();
            return ref.set({ last: entry, items: items }, { merge: true });
        }).catch(() => {});
    } catch (e) {
        // デバッグ用。失敗しても本体の動作は止めない
    }
}

function initializeFirebaseApp() {
    if (!firebaseConfig || !firebaseConfig.apiKey) {
        console.warn('firebaseConfig が空です');
        return;
    }
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        if (isLikelyIOS()) {
            try {
                db.settings({ experimentalForceLongPolling: true });
            } catch (e) {
                console.warn(e);
            }
        }
        firebase.auth().languageCode = 'ja';
        isFirebaseReady = true;
    } catch (e) {
        console.warn('Firebase init failed', e);
        isFirebaseReady = false;
    }
}

function getCalendarDocRef() {
    const user = firebase.auth && firebase.auth().currentUser;
    if (!user || !db) return null;
    return db.collection('users').doc(user.uid).collection('calendars').doc(activeCalendarId);
}

function getCalendarsCollection() {
    const user = firebase.auth && firebase.auth().currentUser;
    if (!user || !db) return null;
    return db.collection('users').doc(user.uid).collection('calendars');
}

function getPrefsRef() {
    const user = firebase.auth && firebase.auth().currentUser;
    if (!user || !db) return null;
    return db.collection('users').doc(user.uid).collection('meta').doc('prefs');
}

async function saveLastCalendarId() {
    const ref = getPrefsRef();
    if (!ref) return;
    try {
        await ref.set({ lastCalendarId: activeCalendarId }, { merge: true });
    } catch (e) {
        console.warn('カレンダー選択の保存に失敗しました', e);
    }
}

function normalizeSchedulesMap(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach((key) => {
        const list = raw[key];
        if (Array.isArray(list)) {
            out[key] = list.filter((ev) => ev && typeof ev === 'object');
        } else if (list && typeof list === 'object') {
            out[key] = Object.keys(list)
                .sort((a, b) => Number(a) - Number(b))
                .map((k) => list[k])
                .filter((ev) => ev && typeof ev === 'object');
        }
    });
    return out;
}

function applyCloudPayload(data, epoch) {
    if (!data) return;
    const applyEpoch = (typeof epoch === 'number') ? epoch : calendarEpoch;
    if (applyEpoch !== calendarEpoch) return;
    applyingRemoteUpdate = true;
    try {
        if (applyEpoch !== calendarEpoch) return;
        if (data.name) currentCalendarName = data.name;
        if (data.templates) templates = data.templates;
        schedules = normalizeSchedulesMap(data.schedules);
        if (typeof data.confirmBeforeDelete !== 'undefined') {
            confirmBeforeDelete = data.confirmBeforeDelete;
            const chk = document.getElementById('confirmBulkDelete');
            if (chk) chk.checked = confirmBeforeDelete;
        }
        if (typeof data.weekStart !== 'undefined') {
            weekStart = data.weekStart;
            const sel = document.getElementById('weekStart');
            if (sel) setSelectValueSilent(sel, String(weekStart));
        }
        if (data.theme && typeof THEMES !== 'undefined' && THEMES.some((t) => t.id === data.theme)) {
            currentTheme = data.theme;
            localStorage.setItem(getProfileScopedKey(THEME_STORAGE_KEY), data.theme);
            applyTheme();
            if (typeof renderThemeSettingsUI === 'function') renderThemeSettingsUI();
            const item = calendarSummaries.find((c) => c.id === activeCalendarId);
            if (item) item.theme = data.theme;
        }
        if (applyEpoch !== calendarEpoch) return;
        loadedCalendarId = activeCalendarId;
        if (typeof dbg === 'function') {
            dbg('applyCloud', {
                events: (typeof countScheduleEvents === 'function') ? countScheduleEvents() : -1,
                calendarId: activeCalendarId
            });
        }
        if (typeof updateCalendarNameLabel === 'function') updateCalendarNameLabel();
        rebuildAllEventsCache();
        if (typeof renderTemplates === 'function') renderTemplates();
        if (typeof generateCalendar === 'function') generateCalendar();
        if (typeof renderCalendarList === 'function' && document.body.classList.contains('list-view')) {
            renderCalendarList();
        }
    } finally {
        applyingRemoteUpdate = false;
        if (applyEpoch === calendarEpoch && pendingCloudSync) {
            pendingCloudSync = false;
            syncToCloud();
        }
    }
}

function syncToCloud() {
    const job = performSyncToCloud;
    const next = syncChain.then(job, job);
    syncChain = next.catch(() => {});
    return next;
}

async function performSyncToCloud() {
    if (cloudSyncPaused) {
        if (typeof dbg === 'function') dbg('sync skip', { reason: 'paused' });
        return;
    }
    if (applyingRemoteUpdate) {
        pendingCloudSync = true;
        if (typeof dbg === 'function') dbg('sync queued', { reason: 'applyingRemote' });
        return;
    }
    if (loadedCalendarId !== activeCalendarId && !allowCreateIfMissing) {
        if (typeof dbg === 'function') dbg('sync skip', {
            reason: 'id-mismatch',
            loaded: loadedCalendarId,
            active: activeCalendarId
        });
        return;
    }
    const writingId = activeCalendarId;
    const user = firebase.auth && firebase.auth().currentUser;
    if (!user || !db) {
        if (typeof dbg === 'function') dbg('sync skip', { reason: 'no-ref' });
        return;
    }
    const ref = db.collection('users').doc(user.uid).collection('calendars').doc(writingId);
    const writtenAt = new Date().toISOString();
    lastLocalWriteAt = Date.parse(writtenAt) || Date.now();
    lastLocalWriteCalendarId = writingId;
    const payload = {
        name: currentCalendarName || 'メイン',
        templates: JSON.parse(JSON.stringify(templates)),
        schedules: JSON.parse(JSON.stringify(schedules)),
        weekStart,
        confirmBeforeDelete,
        updatedAt: writtenAt
    };
    const eventCount = (typeof countScheduleEvents === 'function')
        ? countScheduleEvents(payload.schedules)
        : Object.keys(payload.schedules || {}).length;
    if (typeof dbg === 'function') {
        dbg('sync start', { eventCount: eventCount, writtenAt: writtenAt, calendarId: writingId });
    }
    try {
        /* merge と mergeFields は同時に使えない。merge:true だと schedules の
           消した日付キーがクラウド側に残り、削除がすぐ元に戻る。 */
        if (allowCreateIfMissing) {
            await ref.set(payload, { merge: true });
            if (writingId === activeCalendarId) loadedCalendarId = writingId;
            allowCreateIfMissing = false;
            if (typeof dbg === 'function') dbg('sync ok', { eventCount: eventCount, via: 'create-merge' });
        } else {
            await ref.update({
                name: payload.name,
                templates: payload.templates,
                schedules: payload.schedules,
                weekStart: payload.weekStart,
                confirmBeforeDelete: payload.confirmBeforeDelete,
                updatedAt: payload.updatedAt
            });
            if (typeof dbg === 'function') dbg('sync ok', { eventCount: eventCount, via: 'update' });
        }
    } catch (e) {
        if (typeof dbg === 'function') dbg('sync update fail', { err: String((e && e.message) || e) });
        try {
            await ref.set(payload, {
                mergeFields: ['name', 'templates', 'schedules', 'weekStart', 'confirmBeforeDelete', 'updatedAt']
            });
            if (allowCreateIfMissing && writingId === activeCalendarId) loadedCalendarId = writingId;
            if (typeof dbg === 'function') dbg('sync ok', { eventCount: eventCount, via: 'mergeFields-only' });
        } catch (e2) {
            console.warn('Firestoreへの保存に失敗しました', e2);
            if (typeof dbg === 'function') dbg('sync FAIL', { err: String((e2 && e2.message) || e2) });
        }
    }
}

async function syncThemeToCloud() {
    if (loadedCalendarId !== activeCalendarId) return;
    const ref = getCalendarDocRef();
    if (!ref || typeof currentTheme === 'undefined') return;
    try {
        await ref.set({
            theme: currentTheme,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        const item = calendarSummaries.find((c) => c.id === activeCalendarId);
        if (item) item.theme = currentTheme;
    } catch (e) {
        console.warn('配色の保存に失敗しました', e);
    }
}

function stopCloudCalendar() {
    if (calendarUnsubscribe) {
        calendarUnsubscribe();
        calendarUnsubscribe = null;
    }
}

async function refreshCalendarSummaries() {
    const col = getCalendarsCollection();
    if (!col) {
        calendarSummaries = [];
        return;
    }
    const snap = await col.get();
    calendarSummaries = snap.docs.map(mapCalendarSummary);
    if (!calendarSummaries.length) {
        calendarSummaries = [{ id: activeCalendarId || 'main', name: currentCalendarName || 'メイン' }];
    }
    if (typeof renderCalendarSwitcher === 'function') renderCalendarSwitcher();
}

async function restoreActiveCalendar() {
    const col = getCalendarsCollection();
    if (!col) return;
    const listSnap = await col.get();
    calendarSummaries = listSnap.docs.map(mapCalendarSummary);
    let lastId = 'main';
    const prefs = getPrefsRef();
    if (prefs) {
        try {
            const prefDoc = await prefs.get();
            if (prefDoc.exists && prefDoc.data().lastCalendarId) {
                lastId = prefDoc.data().lastCalendarId;
            }
        } catch (e) {
            console.warn(e);
        }
    }
    if (calendarSummaries.length) {
        allowCreateIfMissing = false;
        const found = calendarSummaries.some((c) => c.id === lastId);
        activeCalendarId = found ? lastId : calendarSummaries[0].id;
        const current = calendarSummaries.find((c) => c.id === activeCalendarId);
        if (current) currentCalendarName = current.name;
    } else {
        allowCreateIfMissing = false;
        activeCalendarId = 'main';
        currentCalendarName = 'メイン';
        templates = [...defaultTemplates];
        schedules = {};
        weekStart = 0;
        try {
            await col.doc('main').set({
                name: 'メイン',
                templates: JSON.parse(JSON.stringify(defaultTemplates)),
                schedules: {},
                weekStart: 0,
                confirmBeforeDelete: true,
                theme: 'dark',
                updatedAt: new Date().toISOString()
            });
            loadedCalendarId = 'main';
            calendarSummaries = [{ id: 'main', name: 'メイン', theme: 'dark' }];
            logClientEvent('seed_empty_main');
        } catch (e) {
            allowCreateIfMissing = true;
            calendarSummaries = [{ id: 'main', name: 'メイン' }];
            console.warn(e);
        }
    }
    if (typeof renderCalendarSwitcher === 'function') renderCalendarSwitcher();
}

function setSelectValueSilent(sel, value) {
    if (!sel) return;
    const handler = sel.onchange;
    sel.onchange = null;
    sel.value = value;
    sel.onchange = handler;
}

function resetLocalCalendarState() {
    templates = [...defaultTemplates];
    schedules = {};
    weekStart = 0;
    const sel = document.getElementById('weekStart');
    if (sel) setSelectValueSilent(sel, '0');
    rebuildAllEventsCache();
    if (typeof renderTemplates === 'function') renderTemplates();
    if (typeof generateCalendar === 'function') generateCalendar();
}

function subscribeToCloudCalendar() {
    stopCloudCalendar();
    const ref = getCalendarDocRef();
    if (!ref) {
        unlockCalendarSwitch();
        return;
    }
    const subscribedId = activeCalendarId;
    const epoch = calendarEpoch;

    const handleDoc = (doc, fromServerGet) => {
        if (epoch !== calendarEpoch || subscribedId !== activeCalendarId) return;
        if (!doc.exists) {
            if (!fromServerGet && doc.metadata && doc.metadata.fromCache) return;
            if (allowCreateIfMissing) {
                allowCreateIfMissing = false;
                templates = [...defaultTemplates];
                schedules = {};
                currentCalendarName = 'メイン';
                unlockCalendarSwitch();
                syncToCloud();
                logClientEvent('seed_from_missing_doc');
                return;
            }
            unlockCalendarSwitch();
            return;
        }
        if (!fromServerGet && isLikelyIOS() && doc.metadata && doc.metadata.fromCache) {
            if (typeof dbg === 'function') dbg('snap skip ios-cache');
            return;
        }
        const data = doc.data() || {};
        const remoteAt = parseRemoteMillis(data.updatedAt);
        const remoteEvents = (typeof countScheduleEvents === 'function') ? countScheduleEvents(data.schedules) : -1;
        const meta = doc.metadata || {};
        const sameCalendarWrite = lastLocalWriteCalendarId === subscribedId;
        /* 自分の保存より古いスナップショットは捨てる。ただし「今開いたカレンダー」の
           初回読み込みは、直前に別カレンダーへ書いた時刻で止めない。 */
        if (sameCalendarWrite && lastLocalWriteAt && (!remoteAt || remoteAt < lastLocalWriteAt)) {
            if (typeof dbg === 'function') {
                dbg('snap skip stale', {
                    remoteAt: remoteAt,
                    lastLocalWriteAt: lastLocalWriteAt,
                    fromCache: !!meta.fromCache,
                    pending: !!meta.hasPendingWrites,
                    fromServerGet: !!fromServerGet,
                    events: remoteEvents,
                    calendarId: subscribedId
                });
            }
            return;
        }
        const localEvents = (typeof countScheduleEvents === 'function') ? countScheduleEvents() : -1;
        const alreadyLoaded = loadedCalendarId === subscribedId;
        /* 削除直後に件数の多い古い見積もりが戻るのを防ぐ。切り替え直後の空の画面には使わない。 */
        if (sameCalendarWrite && alreadyLoaded && lastLocalWriteAt && remoteAt <= lastLocalWriteAt && localEvents >= 0 && remoteEvents > localEvents) {
            if (typeof dbg === 'function') {
                dbg('snap skip restore', {
                    remoteAt: remoteAt,
                    lastLocalWriteAt: lastLocalWriteAt,
                    pending: !!meta.hasPendingWrites,
                    events: remoteEvents,
                    localEvents: localEvents
                });
            }
            return;
        }
        if (typeof dbg === 'function') {
            dbg('snap apply', {
                remoteAt: remoteAt,
                lastLocalWriteAt: lastLocalWriteAt,
                fromCache: !!meta.fromCache,
                pending: !!meta.hasPendingWrites,
                fromServerGet: !!fromServerGet,
                events: remoteEvents,
                localEvents: localEvents,
                calendarId: subscribedId
            });
        }
        applyCloudPayload(data, epoch);
        if (epoch !== calendarEpoch) return;
        unlockCalendarSwitch();
        const item = calendarSummaries.find((c) => c.id === activeCalendarId);
        if (item && data.name) item.name = data.name;
        if (item && data.theme) item.theme = data.theme;
        if (typeof renderCalendarSwitcher === 'function') renderCalendarSwitcher();
    };

    ref.get({ source: 'server' }).then((doc) => {
        handleDoc(doc, true);
    }).catch((err) => {
        console.warn('サーバーからの取得に失敗しました', err);
    });

    calendarUnsubscribe = ref.onSnapshot((doc) => {
        handleDoc(doc, false);
    }, (err) => {
        unlockCalendarSwitch();
        console.warn('Firestoreの購読に失敗しました', err);
    });
}

function stopPrefs() {
    if (prefsUnsubscribe) {
        prefsUnsubscribe();
        prefsUnsubscribe = null;
    }
}

function subscribeToPrefs() {
    stopPrefs();
    const ref = getPrefsRef();
    if (!ref) return;
    prefsUnsubscribe = ref.onSnapshot((doc) => {
        if (!doc.exists) return;
        const data = doc.data() || {};
        if (typeof data.searchQuery !== 'string') return;
        if (typeof applySearchTermFromCloud === 'function') {
            applySearchTermFromCloud(data.searchQuery, data.searchUpdatedAt);
        }
    }, (err) => {
        console.warn('検索設定の購読に失敗しました', err);
    });
}

async function syncSearchQueryToCloud(query) {
    if (typeof applyingSearchFromCloud !== 'undefined' && applyingSearchFromCloud) return;
    const ref = getPrefsRef();
    if (!ref) return;
    try {
        await ref.set({
            searchQuery: query || '',
            searchUpdatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.warn('検索の同期に失敗しました', e);
    }
}

/*
  auth.js
  メール／パスワードと Google アカウントのログイン。
*/

function translateAuthError(err) {
    const code = err && err.code;
    const map = {
        'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
        'auth/user-disabled': 'このアカウントは無効です。',
        'auth/user-not-found': 'メールアドレスまたはパスワードが違います。',
        'auth/wrong-password': 'メールアドレスまたはパスワードが違います。',
        'auth/invalid-credential': 'メールアドレスまたはパスワードが違います。',
        'auth/invalid-login-credentials': 'メールアドレスまたはパスワードが違います。',
        'auth/email-already-in-use': 'このメールアドレスはすでに登録されています。',
        'auth/weak-password': 'パスワードは6文字以上にしてください。',
        'auth/popup-closed-by-user': '',
        'auth/cancelled-popup-request': '',
        'auth/unauthorized-domain': 'このサイトのドメインが Firebase に未登録です。',
        'auth/too-many-requests': '少し時間をおいてから再度お試しください。',
        'auth/network-request-failed': '通信に失敗しました。接続をご確認ください。'
    };
    if (code && map[code] === '') return '';
    return map[code] || 'ログインに失敗しました。';
}

function showAuthError(msg) {
    const el = document.getElementById('loginError');
    if (!el) return;
    el.style.color = '';
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function setLoginBusy(busy) {
    document.querySelectorAll('#loginOverlay button').forEach((b) => {
        b.disabled = busy;
    });
}

function hideLoginOverlay() {
    const el = document.getElementById('loginOverlay');
    if (el) el.style.display = 'none';
}

function showLoginOverlay() {
    const el = document.getElementById('loginOverlay');
    if (el) el.style.display = 'flex';
}

function updateSignedInEmail() {
    const el = document.getElementById('signedInEmail');
    const user = firebase.auth().currentUser;
    if (el && user) el.textContent = user.email || '(Googleアカウント)';
}

function sanitizeAsciiEmailValue(value) {
    return String(value || '').replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, '');
}

function bindAsciiEmailInput(el) {
    if (!el || el.dataset.asciiEmailBound === '1') return;
    el.dataset.asciiEmailBound = '1';
    const apply = () => {
        const next = sanitizeAsciiEmailValue(el.value);
        if (el.value !== next) el.value = next;
    };
    el.addEventListener('input', apply);
    el.addEventListener('blur', apply);
    el.addEventListener('compositionend', apply);
}

function isValidLoginEmail(email) {
    return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
}

function getLoginEmail() {
    const el = document.getElementById('loginEmail');
    const email = sanitizeAsciiEmailValue(el ? el.value : '');
    if (el) el.value = email;
    return email;
}

function getLoginPassword() {
    return document.getElementById('loginPassword').value || '';
}

async function loginWithEmail() {
    showAuthError('');
    const email = getLoginEmail();
    const password = getLoginPassword();
    if (!email || !password) {
        showAuthError('メールアドレスとパスワードを入力してください。');
        return;
    }
    if (!isValidLoginEmail(email)) {
        showAuthError('メールアドレスは半角英数字で入力してください。');
        return;
    }
    setLoginBusy(true);
    try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
    } catch (err) {
        showAuthError(translateAuthError(err));
    } finally {
        setLoginBusy(false);
    }
}

async function signUpWithEmail() {
    showAuthError('');
    const email = getLoginEmail();
    const password = getLoginPassword();
    if (!email || !password) {
        showAuthError('メールアドレスとパスワードを入力してください。');
        return;
    }
    if (!isValidLoginEmail(email)) {
        showAuthError('メールアドレスは半角英数字で入力してください。');
        return;
    }
    if (password.length < 6) {
        showAuthError('パスワードは6文字以上にしてください。');
        return;
    }
    setLoginBusy(true);
    try {
        await firebase.auth().createUserWithEmailAndPassword(email, password);
    } catch (err) {
        showAuthError(translateAuthError(err));
    } finally {
        setLoginBusy(false);
    }
}

function shouldUseGoogleRedirect() {
    return /\/Mobile\//.test(window.location.pathname) ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

function markGoogleRedirectPending() {
    try {
        sessionStorage.setItem('calGoogleRedirect', '1');
    } catch (e) {}
}

function consumeGoogleRedirectPending() {
    try {
        const pending = sessionStorage.getItem('calGoogleRedirect') === '1';
        sessionStorage.removeItem('calGoogleRedirect');
        return pending;
    } catch (e) {
        return false;
    }
}

async function completeGoogleRedirectIfNeeded() {
    const pending = consumeGoogleRedirectPending();
    try {
        await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) {}
    try {
        const cred = await firebase.auth().getRedirectResult();
        if (pending && !(cred && cred.user) && !firebase.auth().currentUser) {
            showAuthError('Googleログインを完了できませんでした。もう一度「Google でログイン」を押してください。');
        }
        return cred;
    } catch (e) {
        if (window.location.protocol === 'file:') {
            showAuthError('HTMLファイルを直接開いた状態ではログインできません。http で開いてください。');
        } else {
            const msg = translateAuthError(e);
            if (msg) showAuthError(msg);
            else if (pending) {
                showAuthError('Googleログインを完了できませんでした。もう一度「Google でログイン」を押してください。');
            }
        }
        return null;
    }
}

async function loginWithGoogle() {
    showAuthError('');
    const provider = new firebase.auth.GoogleAuthProvider();
    setLoginBusy(true);
    try {
        await firebase.auth().signInWithPopup(provider);
    } catch (err) {
        const canFallbackRedirect = err && (
            err.code === 'auth/popup-blocked' ||
            err.code === 'auth/operation-not-supported-in-this-environment'
        );
        if (canFallbackRedirect && shouldUseGoogleRedirect()) {
            markGoogleRedirectPending();
            await firebase.auth().signInWithRedirect(provider);
            return;
        }
        const msg = translateAuthError(err);
        if (msg) showAuthError(msg);
    } finally {
        setLoginBusy(false);
    }
}

function showPasswordResetPanel() {
    showAuthError('');
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.add('reset-mode');
    const resetEmail = document.getElementById('resetEmail');
    const loginEmail = document.getElementById('loginEmail');
    if (resetEmail && loginEmail) resetEmail.value = loginEmail.value.trim();
}

function showLoginPanel() {
    showAuthError('');
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.classList.remove('reset-mode');
}

async function sendPasswordReset() {
    showAuthError('');
    const resetEl = document.getElementById('resetEmail');
    const email = sanitizeAsciiEmailValue(resetEl ? resetEl.value : '');
    if (resetEl) resetEl.value = email;
    if (!email) {
        showAuthError('メールアドレスを入力してください。');
        return;
    }
    if (!isValidLoginEmail(email)) {
        showAuthError('メールアドレスは半角英数字で入力してください。');
        return;
    }
    setLoginBusy(true);
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        showAuthError('再設定用のメールを送信しました。受信箱をご確認ください。');
        const el = document.getElementById('loginError');
        if (el) el.style.color = '#8fd4a8';
    } catch (err) {
        const el = document.getElementById('loginError');
        if (el) el.style.color = '';
        showAuthError(translateAuthError(err));
    } finally {
        setLoginBusy(false);
    }
}

async function logoutCurrentUser() {
    if (typeof logClientEvent === 'function') logClientEvent('logout');
    stopCloudCalendar();
    if (typeof stopPrefs === 'function') stopPrefs();
    loadedCalendarId = null;
    calendarEpoch += 1;
    calendarSummaries = [];
    if (typeof resetLocalCalendarState === 'function') resetLocalCalendarState();
    try {
        await firebase.auth().signOut();
    } catch (e) {
        console.warn(e);
    }
    window.location.reload();
}

function copyAppEntryUrl() {
    const url = window.location.origin + '/';
    navigator.clipboard.writeText(url).then(() => {
        alert('URLをコピーしました。');
    }).catch(() => {
        alert('コピーに失敗しました。入力欄のURLを手動でコピーしてください。');
    });
}

function bindLoginForm() {
    bindAsciiEmailInput(document.getElementById('loginEmail'));
    bindAsciiEmailInput(document.getElementById('resetEmail'));
    const emailForm = document.getElementById('loginEmailForm');
    if (emailForm) {
        emailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            loginWithEmail();
        });
    }
    const resetForm = document.getElementById('loginResetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendPasswordReset();
        });
    }
}

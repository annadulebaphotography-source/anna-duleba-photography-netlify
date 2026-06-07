(function () {
    const authState = {
        ready: false,
        user: null,
        auth: null,
        provider: null,
        configLoaded: false,
        firebaseReady: false,
    };

    function isLocalPreview() {
        return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname || '');
    }

    function setAuthenticated(user) {
        authState.user = user || null;
        document.body.classList.toggle('adp-cms-authenticated', Boolean(user) || isLocalPreview());
        document.dispatchEvent(new CustomEvent('adp:cms-auth-changed', { detail: { user: authState.user } }));
    }

    function injectLoginStyles() {
        if (document.getElementById('adp-cms-login-style')) return;
        const style = document.createElement('style');
        style.id = 'adp-cms-login-style';
        style.textContent = [
            'body:not(.adp-cms-authenticated) .adp-local-cms-launcher,',
            'body:not(.adp-cms-authenticated) .adp-local-cms-toolbar{display:none!important;}',
            '.adp-cms-login-launcher{position:fixed;right:22px;bottom:22px;z-index:100000;border:0;border-radius:999px;background:#76513b;color:#fff;padding:13px 18px;font:700 12px/1.2 Georgia,serif;letter-spacing:.04em;box-shadow:0 10px 28px rgba(0,0,0,.18);cursor:pointer;}',
            'body.adp-cms-authenticated .adp-cms-login-launcher{display:none!important;}',
        ].join('\n');
        document.head.appendChild(style);
    }

    async function loadConfig() {
        if (authState.configLoaded) return authState.firebaseConfig;
        const response = await fetch('/__cms/config', { headers: { Accept: 'application/json' }, cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        authState.configLoaded = true;
        if (!response.ok || !data.ok) {
            throw new Error('Firebase CMS login is not configured in Netlify Environment Variables.');
        }
        authState.firebaseConfig = data.config;
        return authState.firebaseConfig;
    }

    async function initFirebase() {
        if (authState.firebaseReady) return authState;
        const config = await loadConfig();
        const appModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
        const authModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(config);
        authState.auth = authModule.getAuth(app);
        authState.provider = new authModule.GoogleAuthProvider();
        authModule.onAuthStateChanged(authState.auth, (user) => setAuthenticated(user));
        authState.signInWithPopup = authModule.signInWithPopup;
        authState.firebaseReady = true;
        return authState;
    }

    async function login() {
        if (isLocalPreview()) {
            setAuthenticated({ email: 'local-preview' });
            return authState.user;
        }
        await initFirebase();
        if (!authState.auth.currentUser) {
            await authState.signInWithPopup(authState.auth, authState.provider);
        }
        setAuthenticated(authState.auth.currentUser);
        return authState.auth.currentUser;
    }

    async function idToken() {
        const user = await login();
        if (!user?.getIdToken) throw new Error('Nie udalo sie zalogowac do CMS.');
        return user.getIdToken();
    }

    function ensureLoginButton() {
        if (isLocalPreview() || document.querySelector('.adp-cms-login-launcher')) return;
        injectLoginStyles();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'adp-cms-login-launcher';
        button.textContent = 'CMS Login';
        button.addEventListener('click', () => {
            button.disabled = true;
            button.textContent = 'Logowanie...';
            login().catch((error) => {
                window.alert(error.message || 'Nie udalo sie zalogowac do CMS.');
            }).finally(() => {
                button.disabled = false;
                button.textContent = 'CMS Login';
            });
        });
        document.body.appendChild(button);
    }

    async function cmsFetch(url, options) {
        if (isLocalPreview()) return fetch(url, options);
        const nextOptions = { ...(options || {}) };
        nextOptions.headers = {
            ...(nextOptions.headers || {}),
            Authorization: `Bearer ${await idToken()}`,
        };
        const response = await fetch(url, nextOptions);
        if (response.status !== 401) return response;

        const data = await response.clone().json().catch(() => ({}));
        throw new Error(data.error || 'Brak autoryzacji CMS. Zaloguj sie kontem administratora.');
    }

    window.adpCmsAuth = {
        fetch: cmsFetch,
        login,
        hasToken: () => Boolean(authState.user) || isLocalPreview(),
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (isLocalPreview()) setAuthenticated({ email: 'local-preview' });
            else ensureLoginButton();
        });
    } else {
        if (isLocalPreview()) setAuthenticated({ email: 'local-preview' });
        else ensureLoginButton();
    }
}());

(function () {
    const storageKey = 'adpCmsAccessToken';

    function isLocalPreview() {
        return /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname || '');
    }

    function readToken() {
        try {
            return window.sessionStorage.getItem(storageKey) || '';
        } catch {
            return '';
        }
    }

    function writeToken(token) {
        try {
            window.sessionStorage.setItem(storageKey, token);
        } catch {
            // Session storage can be blocked by privacy settings. In that case the prompt will reappear.
        }
    }

    function clearToken() {
        try {
            window.sessionStorage.removeItem(storageKey);
        } catch {
            // Nothing else to clear.
        }
    }

    function requestToken() {
        const current = readToken();
        const value = window.prompt(
            'Podaj CMS_ACCESS_TOKEN z Netlify Environment Variables. Token nie jest zapisywany w repozytorium.',
            current
        );
        if (value === null) return '';
        const token = value.trim();
        if (token) writeToken(token);
        return token;
    }

    function authHeaders(extraHeaders) {
        const token = readToken() || requestToken();
        if (!token) throw new Error('Brak CMS_ACCESS_TOKEN. Zapis zostal przerwany.');
        return {
            ...(extraHeaders || {}),
            Authorization: `Bearer ${token}`,
        };
    }

    async function cmsFetch(url, options) {
        if (isLocalPreview()) return fetch(url, options);
        const nextOptions = { ...(options || {}) };
        nextOptions.headers = authHeaders(nextOptions.headers);
        const response = await fetch(url, nextOptions);
        if (response.status !== 401) return response;

        clearToken();
        const data = await response.clone().json().catch(() => ({}));
        throw new Error(data.error || 'Brak autoryzacji CMS. Sprawdz CMS_ACCESS_TOKEN w Netlify i wpisany token.');
    }

    window.adpCmsAuth = {
        fetch: cmsFetch,
        clear: clearToken,
        hasToken: () => Boolean(readToken()),
    };
}());

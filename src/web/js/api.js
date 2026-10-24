/**
 * Api — cliente único de la app frente al servidor de Media Converter Pro.
 *
 * Dos modos:
 *  - Escritorio (Electron): same-origin contra el servidor local embebido,
 *    sin token (loopback). window.electronAPI existe.
 *  - Navegador / Android: URL + token de emparejamiento guardados en
 *    localStorage (clave 'mcp_server': { baseUrl, token }).
 *
 * Eventos de cola vía SSE (EventSource).
 */
'use strict';

const Api = (() => {
    let baseUrl = '';
    let token = null;
    let health = null;
    let sse = null;
    let connected = false;

    const queueUpdateListeners = [];
    const queueCompleteListeners = [];
    const connectionListeners = [];

    // =========================================
    // Configuración de conexión
    // =========================================

    function normalizeBaseUrl(raw) {
        let url = String(raw || '').trim();
        if (!url) {
            return '';
        }
        if (!/^https?:\/\//i.test(url)) {
            url = `http://${url}`;
        }
        return url.replace(/\/+$/, '');
    }

    /**
     * Inicializa el transporte. Debe llamarse antes que cualquier request.
     * @returns {{embedded: boolean, configured: boolean}}
     */
    async function init() {
        if (typeof window !== 'undefined' && window.electronAPI) {
            baseUrl = window.location.origin;
            token = null;
            try {
                health = await request('/api/health');
            } catch (e) {
                health = null;
            }
            connectEvents();
            return { embedded: true, configured: true };
        }

        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem('mcp_server') || 'null');
        } catch (e) {
            saved = null;
        }

        if (saved && saved.baseUrl) {
            baseUrl = saved.baseUrl;
            token = saved.token || null;
            try {
                health = await request('/api/health');
                connectEvents();
                return { embedded: false, configured: true };
            } catch (e) {
                health = null;
                return { embedded: false, configured: false };
            }
        }

        return { embedded: false, configured: false };
    }

    /** Guarda la conexión (móvil/navegador) */
    async function configure(rawUrl, pairingToken) {
        const normalized = normalizeBaseUrl(rawUrl);
        if (!normalized) {
            throw new Error('URL vacía');
        }
        baseUrl = normalized;
        token = pairingToken || null;

        // Verifica credenciales antes de persistir
        health = await request('/api/health');
        localStorage.setItem(
            'mcp_server',
            JSON.stringify({ baseUrl: normalized, token: pairingToken || null })
        );
        connectEvents();
        return health;
    }

    function forgetConfiguration() {
        localStorage.removeItem('mcp_server');
    }

    function getConnection() {
        return { baseUrl, token, health, connected };
    }

    // =========================================
    // HTTP
    // =========================================

    async function request(path, { method = 'GET', body } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
        if (token) {
            headers['X-Auth-Token'] = token;
        }

        const res = await fetch(baseUrl + path, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });

        if (res.status === 401) {
            const err = new Error('Token inválido');
            err.code = 'UNAUTHORIZED';
            throw err;
        }
        if (!res.ok && res.status !== 501) {
            let message = `Error HTTP ${res.status}`;
            try {
                const data = await res.json();
                if (data && data.message) {
                    message = data.message;
                }
            } catch (e) {
                /* respuesta no-JSON */
            }
            throw new Error(message);
        }

        return res.json();
    }

    // =========================================
    // SSE
    // =========================================

    function setConnected(value) {
        if (connected === value) {
            return;
        }
        connected = value;
        connectionListeners.forEach((cb) => {
            try {
                cb(value);
            } catch (e) {
                /* listener roto no debe romper el resto */
            }
        });
    }

    function connectEvents() {
        if (typeof EventSource === 'undefined') {
            return;
        }
        if (sse) {
            sse.close();
        }
        const url = `${baseUrl}/api/events${token ? `?token=${encodeURIComponent(token)}` : ''}`;
        sse = new EventSource(url);

        sse.onopen = () => setConnected(true);
        sse.onerror = () => setConnected(false);

        sse.addEventListener('queue-update', (e) => {
            queueUpdateListeners.forEach((cb) => {
                try {
                    cb(JSON.parse(e.data));
                } catch (err) {
                    /* payload inválido */
                }
            });
        });

        sse.addEventListener('queue-complete', () => {
            queueCompleteListeners.forEach((cb) => {
                try {
                    cb();
                } catch (err) {
                    /* listener roto */
                }
            });
        });
    }

    // =========================================
    // API pública (espejo de la antigua electronAPI)
    // =========================================

    return {
        init,
        configure,
        forgetConfiguration,
        getConnection,

        getHealth: () => request('/api/health'),
        getQueue: () => request('/api/queue'),
        addToQueue: ({ url, format = 'mp3', quality = null, options = {} }) =>
            request('/api/queue/add', { method: 'POST', body: { url, format, quality, options } }),
        startQueue: () => request('/api/queue/start', { method: 'POST' }),
        clearQueue: () => request('/api/queue/clear', { method: 'POST' }),
        removeFromQueue: (id) => request(`/api/queue/${id}`, { method: 'DELETE' }),
        getVideoInfo: (url) =>
            request(`/api/video/info?url=${encodeURIComponent(url)}`),
        search: (query, limit = 15, type = 'all') =>
            request(
                `/api/search?q=${encodeURIComponent(query)}&limit=${limit}&type=${encodeURIComponent(type)}`
            ),
        parseSpotifyPlaylist: (url) =>
            request('/api/spotify/parse', { method: 'POST', body: { url } }),
        addSpotifyTracks: (tracks, format = 'mp3') =>
            request('/api/spotify/download', { method: 'POST', body: { tracks, format } }),
        getSettings: () => request('/api/settings'),
        saveSettings: (settings) => request('/api/settings', { method: 'POST', body: settings }),
        selectFolder: () => request('/api/folder/select', { method: 'POST' }),
        openPath: (targetPath) => request('/api/path/open', { method: 'POST', body: { path: targetPath } }),
        clearCache: () => request('/api/cache/clear', { method: 'POST' }),

        onQueueUpdate: (cb) => queueUpdateListeners.push(cb),
        onQueueComplete: (cb) => queueCompleteListeners.push(cb),
        onConnectionChange: (cb) => connectionListeners.push(cb)
    };
})();

// Exportar para el bundle (esbuild IIFE) y para el scope global
if (typeof window !== 'undefined') {
    window.Api = Api;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Api;
}

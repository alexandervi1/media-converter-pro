/**
 * Media Converter Pro - Main App (Redesigned)
 * Simplified user flow - Standalone version
 */

'use strict';

const Api = require('./api.js');

// =========================================
// DOM References (initialized after DOM ready)
// =========================================
const $ = (id) => document.getElementById(id);
let DOM = {};

// =========================================
// State
// =========================================
const State = {
    currentTab: 'home',
    downloadFolder: null,
    downloads: [],
    currentVideoInfo: null,
    selectedQuality: 1080,
    selectedFormat: 'mp3',
    isFetchingInfo: false,
    activeUrl: null,
    searchFilter: 'all',
    currentTheme: 'dark',
    embedded: true,
    capabilities: {}
};

let urlDebounceTimeout = null;

// =========================================
// Initialize
// =========================================
function init() {
    console.log('[App] Initializing...');

    DOM = {
        // Drawer
        btnHamburger: $('btn-hamburger'),
        btnSettingsGear: $('btn-settings-gear'),
        settingsDrawer: $('settings-drawer'),
        drawerOverlay: $('drawer-overlay'),
        btnCloseDrawer: $('btn-close-drawer'),
        btnMinimize: $('btn-minimize'),
        btnClose: $('btn-close'),
        selectCookies: $('select-cookies'),

        // Conexión / servidor
        connectOverlay: $('connect-overlay'),
        connectUrl: $('connect-url'),
        connectToken: $('connect-token'),
        btnConnect: $('btn-connect'),
        connectError: $('connect-error'),
        lanToggle: $('lan-toggle'),
        lanInfo: $('lan-info'),
        serverInfoMobile: $('server-info-mobile'),
        btnChangeServer: $('btn-change-server'),
        connDot: $('conn-dot'),

        // Tabs
        tabHome: $('tab-home'),
        tabSearch: $('tab-search'),
        tabSpotify: $('tab-spotify'),
        tabDownloads: $('tab-downloads'),
        downloadsBadge: $('downloads-badge'),

        // Panels
        panelHome: $('panel-home'),
        panelSearch: $('panel-search'),
        panelSpotify: $('panel-spotify'),
        panelDownloads: $('panel-downloads'),

        // Home
        urlInput: $('url-input'),
        btnPaste: $('btn-paste'),
        loadingState: $('loading-state'),
        videoPreview: $('video-preview'),
        previewThumb: $('preview-thumb'),
        previewTitle: $('preview-title'),
        previewChannel: $('preview-channel'),
        formatSelector: $('format-selector'),
        btnFormatMp3: $('btn-format-mp3'),
        btnFormatMp4: $('btn-format-mp4'),
        btnDownload: $('btn-download'),
        downloadBtnText: $('download-btn-text'),
        btnFolder: $('btn-folder'),
        folderPath: $('folder-path'),

        // Search
        searchInput: $('search-input'),
        btnSearch: $('btn-search'),
        searchResults: $('search-results'),
        searchFilters: $('search-filters'),

        // Spotify
        spotifyInput: $('spotify-input'),
        btnLoadPlaylist: $('btn-load-playlist'),
        spotifyLoading: $('spotify-loading'),
        playlistPreview: $('playlist-preview'),
        playlistCover: $('playlist-cover'),
        playlistName: $('playlist-name'),
        playlistCount: $('playlist-count'),
        trackList: $('track-list'),
        btnDownloadPlaylist: $('btn-download-playlist'),

        // Downloads
        btnOpenFolder: $('btn-open-folder'),
        btnClear: $('btn-clear'),
        btnCache: $('btn-cache'),
        downloadsList: $('downloads-list'),
        emptyDownloads: $('empty-downloads'),

        // Toast
        toast: $('toast'),
        toastMessage: $('toast-message')
    };

    window.showToast = showToast;

    loadInitialData();
    setupEventListeners();
    setupQueueListeners();
}

async function loadInitialData() {
    try {
        const savedTheme = localStorage.getItem('mcp_theme') || 'dark';
        applyTheme(savedTheme);

        // Transporte: escritorio embebido o servidor remoto configurado
        const { embedded, configured } = await Api.init();
        State.embedded = embedded;

        if (!configured) {
            showConnectScreen();
            return;
        }

        const health = Api.getConnection().health || {};
        State.capabilities = health.capabilities || {};
        applyCapabilities();

        const settings = await Api.getSettings();
        if (settings?.downloadFolder) {
            State.downloadFolder = settings.downloadFolder;
            updateFolderDisplay();
        }
        if (DOM.selectCookies && settings?.ytdlpCookies) {
            DOM.selectCookies.value = settings.ytdlpCookies;
        }

        const queueData = await Api.getQueue();
        if (queueData) {
            State.downloads = queueData.queue || [];
            updateDownloadsList();
            updateBadge();
            if (queueData.downloadFolder) {
                State.downloadFolder = queueData.downloadFolder;
                updateFolderDisplay();
            }
        }

        setupServerSection();
    } catch (e) {
        console.error('[App] Error loading initial data:', e);
        showToast('No se pudo conectar con el servidor', 'error');
    }
}

/**
 * Oculta/muestra controles según capacidades del servidor:
 * el diálogo de carpeta y el explorador solo existen en escritorio.
 */
function applyCapabilities() {
    const { folderDialog, desktopShell } = State.capabilities;
    if (DOM.btnFolder && !folderDialog) {
        DOM.btnFolder.classList.add('hidden');
    }
    if (DOM.btnOpenFolder && !desktopShell) {
        DOM.btnOpenFolder.classList.add('hidden');
    }
}

// =========================================
// Pantalla de conexión (móvil / navegador)
// =========================================
function showConnectScreen() {
    if (!DOM.connectOverlay) {
        return;
    }
    const conn = Api.getConnection();
    if (DOM.connectUrl && !DOM.connectUrl.value && conn.baseUrl) {
        DOM.connectUrl.value = conn.baseUrl.replace(/^https?:\/\//, '');
    }
    DOM.connectOverlay.classList.remove('hidden');
}

async function handleConnect() {
    if (DOM.connectError) {
        DOM.connectError.textContent = '';
    }
    const rawUrl = DOM.connectUrl?.value.trim() || '';
    const pairingToken = DOM.connectToken?.value.trim() || '';

    if (DOM.btnConnect) {
        DOM.btnConnect.disabled = true;
        DOM.btnConnect.textContent = 'Conectando...';
    }

    try {
        await Api.configure(rawUrl, pairingToken);
        location.reload();
    } catch (e) {
        if (DOM.connectError) {
            DOM.connectError.textContent =
                e.code === 'UNAUTHORIZED'
                    ? 'Token incorrecto para este servidor'
                    : 'No se pudo conectar. Verifica que la PC tenga la app abierta y el servidor habilitado en tu red.';
        }
        if (DOM.btnConnect) {
            DOM.btnConnect.disabled = false;
            DOM.btnConnect.textContent = 'Conectar';
        }
    }
}

// =========================================
// Sección Servidor del drawer
// =========================================
function setupServerSection() {
    if (State.embedded && window.electronAPI?.getLanInfo) {
        // Escritorio: toggle LAN + info de emparejamiento
        if (DOM.serverInfoMobile) {
            DOM.serverInfoMobile.classList.add('hidden');
        }
        window.electronAPI
            .getLanInfo()
            .then((info) => renderLanInfo(info))
            .catch(() => {});
        if (DOM.lanToggle && !DOM.lanToggle.dataset.bound) {
            DOM.lanToggle.dataset.bound = '1';
            DOM.lanToggle.addEventListener('change', async () => {
                DOM.lanToggle.disabled = true;
                try {
                    const info = await window.electronAPI.setLanEnabled(
                        DOM.lanToggle.checked
                    );
                    renderLanInfo(info);
                    showToast(
                        DOM.lanToggle.checked
                            ? 'Servidor accesible desde tu red WiFi'
                            : 'Servidor limitado a esta PC',
                        'success'
                    );
                } catch (e) {
                    showToast('No se pudo cambiar el modo del servidor', 'error');
                    DOM.lanToggle.checked = !DOM.lanToggle.checked;
                } finally {
                    DOM.lanToggle.disabled = false;
                }
            });
        }
    } else {
        // Móvil: mostrar servidor actual + cambiar
        if (DOM.lanToggle?.parentElement) {
            DOM.lanToggle.parentElement.classList.add('hidden');
        }
        if (DOM.serverInfoMobile) {
            const conn = Api.getConnection();
            DOM.serverInfoMobile.textContent = conn.baseUrl || 'Servidor no configurado';
        }
        if (DOM.btnChangeServer && !DOM.btnChangeServer.dataset.bound) {
            DOM.btnChangeServer.dataset.bound = '1';
            DOM.btnChangeServer.addEventListener('click', () => {
                Api.forgetConfiguration();
                location.reload();
            });
        }
    }
}

function renderLanInfo(info) {
    if (DOM.lanToggle) {
        DOM.lanToggle.checked = !!info.enabled;
    }
    if (DOM.lanInfo) {
        if (info.enabled) {
            const urls = (info.urls || []).join('\n');
            DOM.lanInfo.innerHTML = `
                <p class="lan-line">Conecta desde el teléfono:</p>
                <code class="lan-url">${escapeHtml(urls)}</code>
                <p class="lan-line">Token: <strong>${escapeHtml(info.token || '')}</strong></p>
            `;
        } else {
            DOM.lanInfo.innerHTML =
                '<p class="lan-line">Activa el interruptor para controlar la app desde tu teléfono (misma red WiFi).</p>';
        }
    }
}

// =========================================
// Drawer & Theme Control
// =========================================
function toggleDrawer(open) {
    if (!DOM.settingsDrawer || !DOM.drawerOverlay) {
        return;
    }
    const shouldOpen = open !== undefined ? open : DOM.settingsDrawer.classList.contains('hidden');

    if (shouldOpen) {
        DOM.settingsDrawer.classList.remove('hidden');
        DOM.drawerOverlay.classList.remove('hidden');
    } else {
        DOM.settingsDrawer.classList.add('hidden');
        DOM.drawerOverlay.classList.add('hidden');
    }
}

function applyTheme(themeName) {
    State.currentTheme = themeName;
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('mcp_theme', themeName);

    // Actualizar cards activas
    document.querySelectorAll('.theme-card').forEach((card) => {
        card.classList.toggle('active', card.dataset.theme === themeName);
    });
}

// =========================================
// Event Listeners
// =========================================
function setupEventListeners() {
    // Control del Drawer (Menú Hamburguesa & Tuerquita)
    if (DOM.btnHamburger) {
        DOM.btnHamburger.addEventListener('click', () => toggleDrawer(true));
    }
    if (DOM.btnSettingsGear) {
        DOM.btnSettingsGear.addEventListener('click', () => toggleDrawer(true));
    }
    if (DOM.btnCloseDrawer) {
        DOM.btnCloseDrawer.addEventListener('click', () => toggleDrawer(false));
    }
    if (DOM.drawerOverlay) {
        DOM.drawerOverlay.addEventListener('click', () => toggleDrawer(false));
    }

    // Selector de Temas
    document.querySelectorAll('.theme-card').forEach((card) => {
        card.addEventListener('click', () => {
            const theme = card.dataset.theme;
            if (theme) {
                applyTheme(theme);
                showToast(`Tema cambiado a: ${card.textContent.trim()}`, 'success');
            }
        });
    });

    // Window controls (solo escritorio)
    if (DOM.btnMinimize && window.electronAPI?.minimizeWindow) {
        DOM.btnMinimize.addEventListener('click', () => window.electronAPI.minimizeWindow());
    }
    if (DOM.btnClose && window.electronAPI?.closeWindow) {
        DOM.btnClose.addEventListener('click', () => window.electronAPI.closeWindow());
    }

    // Pantalla de conexión (móvil / navegador)
    if (DOM.btnConnect) {
        DOM.btnConnect.addEventListener('click', () => handleConnect());
    }
    if (DOM.connectToken) {
        DOM.connectToken.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleConnect();
            }
        });
    }

    // Indicador de conexión con el servidor
    Api.onConnectionChange((online) => {
        if (DOM.connDot) {
            DOM.connDot.classList.toggle('online', online);
            DOM.connDot.title = online ? 'Conectado al servidor' : 'Sin conexión con el servidor';
        }
    });

    // Tab navigation
    if (DOM.tabHome) {
        DOM.tabHome.addEventListener('click', () => switchTab('home'));
    }
    if (DOM.tabSearch) {
        DOM.tabSearch.addEventListener('click', () => switchTab('search'));
    }
    if (DOM.tabSpotify) {
        DOM.tabSpotify.addEventListener('click', () => switchTab('spotify'));
    }
    if (DOM.tabDownloads) {
        DOM.tabDownloads.addEventListener('click', () => switchTab('downloads'));
    }

    // Home - Paste button
    if (DOM.btnPaste) {
        DOM.btnPaste.addEventListener('click', () => handlePaste());
    }

    // Home - URL input events
    if (DOM.urlInput) {
        DOM.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (urlDebounceTimeout) {
                    clearTimeout(urlDebounceTimeout);
                }
                const url = DOM.urlInput.value.trim();
                if (url && isValidYouTubeUrl(url)) {
                    fetchVideoInfo(url);
                }
            }
        });

        DOM.urlInput.addEventListener('input', () => {
            if (urlDebounceTimeout) {
                clearTimeout(urlDebounceTimeout);
            }
            const url = DOM.urlInput.value.trim();
            if (url && isValidYouTubeUrl(url)) {
                urlDebounceTimeout = setTimeout(() => {
                    fetchVideoInfo(url);
                }, 500);
            }
        });
    }

    // Home - Download button
    if (DOM.btnDownload) {
        DOM.btnDownload.addEventListener('click', () => handleDownload());
    }

    // Home - Format selector
    if (DOM.btnFormatMp3) {
        DOM.btnFormatMp3.addEventListener('click', () => setFormat('mp3'));
    }
    if (DOM.btnFormatMp4) {
        DOM.btnFormatMp4.addEventListener('click', () => setFormat('mp4'));
    }

    // Home - Folder selector
    if (DOM.btnFolder) {
        DOM.btnFolder.addEventListener('click', () => handleSelectFolder());
    }

    // Search - Actions & Enter
    if (DOM.btnSearch) {
        DOM.btnSearch.addEventListener('click', () => {
            const query = DOM.searchInput?.value.trim();
            if (query) {
                handleSearch(query);
            }
        });
    }

    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = DOM.searchInput.value.trim();
                if (query) {
                    handleSearch(query);
                }
            }
        });
    }

    if (DOM.searchFilters) {
        DOM.searchFilters.querySelectorAll('.filter-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                DOM.searchFilters
                    .querySelectorAll('.filter-chip')
                    .forEach((c) => c.classList.remove('active'));
                chip.classList.add('active');
                State.searchFilter = chip.dataset.type || 'all';

                const query = DOM.searchInput?.value.trim();
                if (query) {
                    handleSearch(query);
                }
            });
        });
    }

    // Spotify
    if (DOM.btnLoadPlaylist) {
        DOM.btnLoadPlaylist.addEventListener('click', () => {
            const url = DOM.spotifyInput?.value.trim();
            if (url) {
                handleLoadSpotifyPlaylist(url);
            }
        });
    }

    if (DOM.btnDownloadPlaylist) {
        DOM.btnDownloadPlaylist.addEventListener('click', () => handleDownloadSpotifyPlaylist());
    }

    // Selector de cookies del navegador (anti bot-check de YouTube)
    if (DOM.selectCookies) {
        DOM.selectCookies.addEventListener('change', async () => {
            const value = DOM.selectCookies.value;
            try {
                const res = await Api.saveSettings({ ytdlpCookies: value });
                if (res.success) {
                    showToast(
                        value === 'none'
                            ? 'Se desactivaron las cookies del navegador'
                            : `yt-dlp usará cookies de ${value}`,
                        'success'
                    );
                }
            } catch (e) {
                showToast('No se pudo guardar la configuración', 'error');
            }
        });
    }

    // Downloads
    if (DOM.btnOpenFolder) {
        DOM.btnOpenFolder.addEventListener('click', () => {
            if (State.downloadFolder) {
                Api.openPath(State.downloadFolder);
            }
        });
    }

    if (DOM.btnClear) {
        DOM.btnClear.addEventListener('click', async () => {
            await Api.clearQueue();
            showToast('Cola limpiada', 'info');
        });
    }

    if (DOM.btnCache) {
        DOM.btnCache.addEventListener('click', async () => {
            const res = await Api.clearCache();
            if (res.success) {
                showToast('Caché limpiado correctamente', 'success');
            }
        });
    }
}

// =========================================
// Tab Navigation
// =========================================
function switchTab(tabName) {
    State.currentTab = tabName;

    const tabs = [DOM.tabHome, DOM.tabSearch, DOM.tabSpotify, DOM.tabDownloads];
    const panels = [DOM.panelHome, DOM.panelSearch, DOM.panelSpotify, DOM.panelDownloads];

    tabs.forEach((tab) => tab?.classList.remove('active'));
    panels.forEach((panel) => panel?.classList.remove('active'));

    switch (tabName) {
    case 'home':
        DOM.tabHome?.classList.add('active');
        DOM.panelHome?.classList.add('active');
        break;
    case 'search':
        DOM.tabSearch?.classList.add('active');
        DOM.panelSearch?.classList.add('active');
        break;
    case 'spotify':
        DOM.tabSpotify?.classList.add('active');
        DOM.panelSpotify?.classList.add('active');
        break;
    case 'downloads':
        DOM.tabDownloads?.classList.add('active');
        DOM.panelDownloads?.classList.add('active');
        break;
    }
}

// =========================================
// Queue Listener Setup
// =========================================
function setupQueueListeners() {
    Api.onQueueUpdate(({ queue, downloadFolder }) => {
        State.downloads = queue || [];
        if (downloadFolder) {
            State.downloadFolder = downloadFolder;
            updateFolderDisplay();
        }
        updateDownloadsList();
        updateBadge();
    });

    Api.onQueueComplete(() => {
        showToast('¡Todas las descargas han finalizado!', 'success');
    });
}

// =========================================
// Home Handlers
// =========================================
async function handlePaste() {
    try {
        let text = '';
        if (navigator.clipboard?.readText) {
            text = await navigator.clipboard.readText();
        } else if (window.electronAPI?.readClipboard) {
            text = window.electronAPI.readClipboard();
        }
        if (text && DOM.urlInput) {
            DOM.urlInput.value = text.trim();
            if (isValidYouTubeUrl(text.trim())) {
                fetchVideoInfo(text.trim());
            } else {
                showToast('URL de YouTube no válida', 'error');
            }
        }
    } catch (e) {
        showToast('No se pudo acceder al portapapeles', 'error');
    }
}

async function fetchVideoInfo(url) {
    if (State.isFetchingInfo && State.activeUrl === url) {
        return;
    }

    State.isFetchingInfo = true;
    State.activeUrl = url;

    if (DOM.loadingState) {
        DOM.loadingState.classList.remove('hidden');
    }
    if (DOM.videoPreview) {
        DOM.videoPreview.classList.add('hidden');
    }
    if (DOM.formatSelector) {
        DOM.formatSelector.classList.add('hidden');
    }
    if (DOM.btnDownload) {
        DOM.btnDownload.classList.add('hidden');
    }

    try {
        const response = await Api.getVideoInfo(url);
        if (DOM.loadingState) {
            DOM.loadingState.classList.add('hidden');
        }

        if (!response || !response.success || !response.info) {
            showToast('No se pudo obtener información del video', 'error');
            State.activeUrl = null;
            return;
        }

        const info = response.info;
        if (DOM.previewThumb) {
            DOM.previewThumb.src = info.thumbnail || '';
        }
        if (DOM.previewTitle) {
            DOM.previewTitle.textContent = info.title || 'Sin título';
        }
        if (DOM.previewChannel) {
            DOM.previewChannel.textContent = info.uploader || 'Canal desconocido';
        }
        if (DOM.videoPreview) {
            DOM.videoPreview.classList.remove('hidden');
        }

        State.currentVideoInfo = info;
        State.selectedQuality =
            info.availableQualities?.length > 0 ? Math.max(...info.availableQualities) : 1080;

        if (DOM.formatSelector) {
            DOM.formatSelector.classList.remove('hidden');
        }
        if (DOM.btnDownload) {
            DOM.btnDownload.classList.remove('hidden');
        }
        updateDownloadButtonText();
    } catch (e) {
        console.error('Fetch error:', e);
        if (DOM.loadingState) {
            DOM.loadingState.classList.add('hidden');
        }
        showToast('Error al obtener información', 'error');
        State.activeUrl = null;
    } finally {
        State.isFetchingInfo = false;
    }
}

function setFormat(format) {
    State.selectedFormat = format;
    if (DOM.btnFormatMp3) {
        DOM.btnFormatMp3.classList.toggle('active', format === 'mp3');
    }
    if (DOM.btnFormatMp4) {
        DOM.btnFormatMp4.classList.toggle('active', format === 'mp4');
    }
    updateDownloadButtonText();
}

function updateDownloadButtonText() {
    if (DOM.downloadBtnText) {
        DOM.downloadBtnText.textContent =
            State.selectedFormat === 'mp3' ? 'Descargar MP3' : 'Descargar MP4';
    }
}

async function handleDownload() {
    if (!State.activeUrl) {
        showToast('Por favor introduce un enlace válido', 'error');
        return;
    }

    try {
        const result = await Api.addToQueue({
            url: State.activeUrl,
            format: State.selectedFormat,
            quality: State.selectedQuality,
            options: { embedMetadata: true }
        });

        if (result.success) {
            showToast('Añadido a la cola de descargas', 'success');
            await Api.startQueue();

            if (DOM.urlInput) {
                DOM.urlInput.value = '';
            }
            if (DOM.videoPreview) {
                DOM.videoPreview.classList.add('hidden');
            }
            if (DOM.formatSelector) {
                DOM.formatSelector.classList.add('hidden');
            }
            if (DOM.btnDownload) {
                DOM.btnDownload.classList.add('hidden');
            }
            State.activeUrl = null;

            switchTab('downloads');
        } else {
            showToast(result.message || 'Error al añadir', 'error');
        }
    } catch (e) {
        console.error('Download error:', e);
        showToast('Error de conexión', 'error');
    }
}

async function handleSelectFolder() {
    try {
        const result = await Api.selectFolder();
        if (result.success && result.folder) {
            State.downloadFolder = result.folder;
            updateFolderDisplay();
            showToast('Carpeta seleccionada', 'success');
        }
    } catch (e) {
        showToast('Error al seleccionar carpeta', 'error');
    }
}

function updateFolderDisplay() {
    if (DOM.folderPath) {
        DOM.folderPath.textContent = State.downloadFolder || 'Seleccionar carpeta...';
    }
}

// =========================================
// Search Handlers (Buscador Avanzado)
// =========================================
async function handleSearch(query) {
    if (!DOM.searchResults) {
        return;
    }

    DOM.searchResults.innerHTML =
        '<p class="empty-message">Buscando resultados en alta fidelidad...</p>';

    try {
        const response = await Api.search(query, 15, State.searchFilter);
        const results = response?.results || [];

        if (!results || results.length === 0) {
            DOM.searchResults.innerHTML =
                '<p class="empty-message">No se encontraron resultados</p>';
            return;
        }

        DOM.searchResults.innerHTML = results
            .map(
                (item) => `
            <div class="search-item" data-url="${item.url || item.webpage_url}">
                <img src="${item.thumbnail || ''}" alt="" class="search-thumb">
                <div class="search-info">
                    <p class="search-title">${escapeHtml(item.cleanTitle || item.title)}</p>
                    <p class="search-channel">${escapeHtml(item.cleanArtist || item.uploader || item.channel || '')}</p>
                </div>
            </div>
        `
            )
            .join('');

        DOM.searchResults.querySelectorAll('.search-item').forEach((item) => {
            item.addEventListener('click', () => {
                const url = item.dataset.url;
                if (url) {
                    if (DOM.urlInput) {
                        DOM.urlInput.value = url;
                    }
                    switchTab('home');
                    fetchVideoInfo(url);
                }
            });
        });
    } catch (e) {
        console.error('Search error:', e);
        DOM.searchResults.innerHTML = '<p class="empty-message">Error en la búsqueda</p>';
    }
}

// =========================================
// Spotify Handlers
// =========================================
async function handleLoadSpotifyPlaylist(url) {
    if (DOM.spotifyLoading) {
        DOM.spotifyLoading.classList.remove('hidden');
    }
    if (DOM.playlistPreview) {
        DOM.playlistPreview.classList.add('hidden');
    }
    if (DOM.btnDownloadPlaylist) {
        DOM.btnDownloadPlaylist.classList.add('hidden');
    }

    try {
        const response = await Api.parseSpotifyPlaylist(url);
        if (DOM.spotifyLoading) {
            DOM.spotifyLoading.classList.add('hidden');
        }

        if (!response || !response.success || !response.playlist) {
            showToast(response?.message || 'No se pudo cargar la playlist', 'error');
            return;
        }

        const playlist = response.playlist;
        if (DOM.playlistCover) {
            DOM.playlistCover.src = playlist.cover || '';
        }
        if (DOM.playlistName) {
            DOM.playlistName.textContent = playlist.name || 'Playlist';
        }
        if (DOM.playlistCount) {
            DOM.playlistCount.textContent = `${playlist.tracks?.length || 0} canciones`;
        }

        if (DOM.trackList) {
            DOM.trackList.innerHTML = (playlist.tracks || [])
                .map(
                    (track, index) => `
                <div class="track-item" data-index="${index}">
                    <span class="track-number">${index + 1}</span>
                    <div class="track-details">
                        <span class="track-title">${escapeHtml(track.name)}</span>
                        <span class="track-artist">${escapeHtml(track.artist)}</span>
                    </div>
                </div>
            `
                )
                .join('');
        }

        if (DOM.playlistPreview) {
            DOM.playlistPreview.classList.remove('hidden');
        }
        if (DOM.btnDownloadPlaylist) {
            DOM.btnDownloadPlaylist.classList.remove('hidden');
        }

        State.currentSpotifyPlaylist = playlist;
    } catch (e) {
        console.error('Spotify error:', e);
        if (DOM.spotifyLoading) {
            DOM.spotifyLoading.classList.add('hidden');
        }
        showToast('Error al cargar Spotify', 'error');
    }
}

async function handleDownloadSpotifyPlaylist() {
    if (!State.currentSpotifyPlaylist || !State.currentSpotifyPlaylist.tracks) {
        showToast('No hay playlist cargada', 'error');
        return;
    }

    try {
        const tracks = State.currentSpotifyPlaylist.tracks;
        const result = await Api.addSpotifyTracks(tracks, 'mp3');

        if (result.success) {
            showToast(`¡Añadidas ${tracks.length} canciones a la cola!`, 'success');
            await Api.startQueue();

            if (DOM.spotifyInput) {
                DOM.spotifyInput.value = '';
            }
            if (DOM.playlistPreview) {
                DOM.playlistPreview.classList.add('hidden');
            }
            if (DOM.btnDownloadPlaylist) {
                DOM.btnDownloadPlaylist.classList.add('hidden');
            }

            switchTab('downloads');
        } else {
            showToast(result.message || 'Error al añadir canciones', 'error');
        }
    } catch (e) {
        console.error('Spotify download error:', e);
        showToast('Error al procesar descargas de Spotify', 'error');
    }
}

// =========================================
// Queue UI Rendering
// =========================================
// Queue UI Rendering (incremental, keyed by id)
// =========================================
const downloadItemElements = new Map();

function updateDownloadsList() {
    if (!DOM.downloadsList) {
        return;
    }

    const list = State.downloads || [];
    DOM.emptyDownloads?.classList.toggle('hidden', list.length > 0);

    // Eliminar elementos cuya descarga ya no está en la cola
    for (const [key, el] of downloadItemElements) {
        if (!list.some((item) => String(item.id) === key)) {
            el.remove();
            downloadItemElements.delete(key);
        }
    }

    list.forEach((item) => {
        const key = String(item.id);
        const signature = `${item.status}|${item.progress}|${item.title}|${item.error || ''}|${item.filePath || ''}`;
        const el = downloadItemElements.get(key);
        if (!el) {
            const created = createDownloadItemElement(item);
            created.dataset.signature = signature;
            downloadItemElements.set(key, created);
        } else if (el.dataset.signature !== signature) {
            const fresh = createDownloadItemElement(item);
            fresh.dataset.signature = signature;
            el.replaceWith(fresh);
            downloadItemElements.set(key, fresh);
        }
    });

    // Reordenar solo si el orden relativo del DOM divergió del de la cola
    let cursor = null;
    for (const item of list) {
        const el = downloadItemElements.get(String(item.id));
        if (!el) {
            continue;
        }
        if (cursor && cursor.nextSibling !== el) {
            DOM.downloadsList.insertBefore(el, cursor.nextSibling);
        }
        cursor = el;
    }
}

function createDownloadItemElement(item) {
    const div = document.createElement('div');
    div.className = 'download-item';
    div.dataset.id = item.id;

    const isDownloading = item.status === 'downloading' || item.status === 'converting';
    const isCompleted = item.status === 'completed';

    div.innerHTML = `
        <img class="download-thumb" src="${item.thumbnail || ''}" alt="" />
        <div class="download-info">
            <h4 class="download-title">${escapeHtml(item.title || 'Descargando...')}</h4>
            <div class="download-progress ${isDownloading ? '' : 'hidden'}">
                <div class="download-progress-bar ${isCompleted ? 'complete' : ''}" style="width: ${item.progress || 0}%"></div>
            </div>
            <div class="download-status">
                <span class="download-badge ${item.format}">${item.format.toUpperCase()}</span>
                <span>${getStatusText(item.status, item.progress, item.error)}</span>
            </div>
        </div>
        <div class="download-actions">
            ${
    isCompleted && item.filePath && State.capabilities.desktopShell
        ? `
                <button class="btn-ghost btn-open-file" title="Abrir archivo" data-path="${escapeHtml(item.filePath)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
            `
        : ''
}
            <button class="btn-ghost btn-remove" title="Eliminar" data-id="${item.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;

    div.querySelector('.btn-remove')?.addEventListener('click', async () => {
        await Api.removeFromQueue(item.id);
    });

    div.querySelector('.btn-open-file')?.addEventListener('click', (e) => {
        const filePath = e.currentTarget.dataset.path;
        if (filePath) {
            Api.openPath(filePath);
        }
    });

    return div;
}

function getStatusText(status, progress, error) {
    switch (status) {
    case 'pending':
        return 'En espera...';
    case 'searching':
        return 'Buscando audio en YouTube...';
    case 'downloading':
        return `Descargando... ${progress || 0}%`;
    case 'converting':
        return `Convertiendo... ${progress || 0}%`;
    case 'completed':
        return '¡Completado!';
    case 'error':
        return `Error: ${error || 'Fallo en descarga'}`;
    default:
        return status;
    }
}

function updateBadge() {
    if (!DOM.downloadsBadge) {
        return;
    }
    const activeCount = State.downloads.filter(
        (i) => i.status === 'pending' || i.status === 'downloading' || i.status === 'converting'
    ).length;

    DOM.downloadsBadge.textContent = activeCount > 0 ? activeCount : '';
}

// =========================================
// Toast Notifications
// =========================================
let toastTimeout;
function showToast(message, type = 'info') {
    if (!DOM.toast || !DOM.toastMessage) {
        return;
    }

    DOM.toastMessage.textContent = message;
    DOM.toast.className = `toast ${type} show`;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    toastTimeout = setTimeout(() => {
        DOM.toast.classList.remove('show');
    }, 3000);
}

// =========================================
// Utilities
// =========================================
function isValidYouTubeUrl(url) {
    return /youtube\.com|youtu\.be/.test(url);
}

function escapeHtml(text) {
    if (!text) {
        return '';
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =========================================
// Initialize on DOM Ready
// =========================================
document.addEventListener('DOMContentLoaded', init);

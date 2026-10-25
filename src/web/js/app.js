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

    // Contexto web (navegador/Android): sin controles de ventana nativos
    if (!window.electronAPI) {
        document.body.classList.add('web');
    }

    // Sidebar de escritorio: estado colapsado persistido (solo UI)
    if (localStorage.getItem('mcp_sidebar_collapsed') === '1') {
        document.body.classList.add('sidebar-collapsed');
    }

    DOM = {
        // Drawer
        btnHamburger: $('btn-hamburger'),
        btnSettingsGear: $('btn-settings-gear'),
        settingsDrawer: $('settings-drawer'),
        drawerOverlay: $('drawer-overlay'),
        btnCloseDrawer: $('btn-close-drawer'),
        btnMinimize: $('btn-minimize'),
        btnMaximize: $('btn-maximize'),
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
        connStatus: $('conn-status'),

        // Tabs
        tabHome: $('tab-home'),
        tabSearch: $('tab-search'),
        tabSpotify: $('tab-spotify'),
        tabFlac: $('tab-flac'),
        tabDownloads: $('tab-downloads'),
        downloadsBadge: $('downloads-badge'),

        // Panels
        panelHome: $('panel-home'),
        panelSearch: $('panel-search'),
        panelSpotify: $('panel-spotify'),
        panelFlac: $('panel-flac'),
        panelDownloads: $('panel-downloads'),

        // FLAC
        flacViewer: $('flac-viewer'),
        flacHeroMobile: $('flac-hero-mobile'),
        flacWebview: $('flac-webview'),
        flacLoading: $('flac-loading'),
        flacBack: $('flac-back'),
        flacReload: $('flac-reload'),
        flacPopout: $('flac-popout'),
        btnOpenFlac: $('btn-open-flac'),

        // Home
        urlInput: $('url-input'),
        btnPaste: $('btn-paste'),
        previewSkeleton: $('preview-skeleton'),
        qualityPicker: $('quality-picker'),
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
        searchForm: $('search-form'),
        searchInput: $('search-input'),
        searchClear: $('btn-search-clear'),
        searchResults: $('search-results'),
        searchFilters: $('search-filters'),

        // Spotify
        spotifyForm: $('spotify-form'),
        spotifyInput: $('spotify-input'),
        spotifySkeleton: $('spotify-skeleton'),
        playlistPreview: $('playlist-preview'),
        playlistCover: $('playlist-cover'),
        playlistName: $('playlist-name'),
        playlistCount: $('playlist-count'),
        trackList: $('track-list'),
        btnSelectAll: $('btn-select-all'),
        btnSelectNone: $('btn-select-none'),
        selectionCount: $('selection-count'),
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
        DOM.btnHamburger.addEventListener('click', () => {
            if (window.matchMedia('(min-width: 1100px)').matches) {
                // Escritorio ancho: alternar sidebar colapsado (solo UI)
                const collapsed = document.body.classList.toggle('sidebar-collapsed');
                localStorage.setItem('mcp_sidebar_collapsed', collapsed ? '1' : '0');
            } else {
                toggleDrawer(true);
            }
        });
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
    if (DOM.btnMaximize && window.electronAPI?.maximizeWindow) {
        DOM.btnMaximize.addEventListener('click', async () => {
            try {
                const res = await window.electronAPI.maximizeWindow();
                document.body.classList.toggle('maximized', !!res?.maximized);
            } catch (e) {
                /* el estado llega igual por el evento */
            }
        });
        // El icono debe reflejar el estado real (doble clic en la barra, etc.)
        if (window.electronAPI.onWindowMaximized) {
            window.electronAPI.onWindowMaximized((maximized) => {
                document.body.classList.toggle('maximized', !!maximized);
                if (DOM.btnMaximize) {
                    DOM.btnMaximize.title = maximized ? 'Restaurar' : 'Maximizar';
                }
            });
        }
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

    // Estado de conexión con el servidor (texto en el drawer > Servidor)
    Api.onConnectionChange((online) => {
        if (DOM.connStatus) {
            DOM.connStatus.innerHTML = online
                ? '<span class="conn-text" style="color: var(--success)">● Conectado</span>'
                : '<span class="conn-text" style="color: var(--error)">● Sin conexión</span>';
        }
    });

    // Sidebar de escritorio: mismos destinos que las pestañas
    document.querySelectorAll('.side-item').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
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
    if (DOM.tabFlac) {
        DOM.tabFlac.addEventListener('click', () => switchTab('flac'));
    }

    // FLAC - buscador lossless (embebido en escritorio, externo en móvil)
    if (DOM.btnOpenFlac) {
        DOM.btnOpenFlac.addEventListener('click', () => handleOpenFlac());
    }
    if (DOM.flacPopout) {
        DOM.flacPopout.addEventListener('click', async () => {
            if (window.electronAPI?.openFlacView) {
                try {
                    await window.electronAPI.openFlacView();
                    showToast('Abierto en ventana aparte', 'info');
                } catch (e) {
                    showToast('No se pudo abrir la ventana FLAC', 'error');
                }
            }
        });
    }
    if (DOM.flacBack && DOM.flacWebview) {
        DOM.flacBack.addEventListener('click', () => {
            if (DOM.flacWebview.canGoBack()) {
                DOM.flacWebview.goBack();
            }
        });
    }
    if (DOM.flacReload && DOM.flacWebview) {
        DOM.flacReload.addEventListener('click', () => DOM.flacWebview.reload());
    }
    if (DOM.flacWebview) {
        DOM.flacWebview.addEventListener('dom-ready', () => {
            DOM.flacLoading?.classList.add('hidden');
        });
        DOM.flacWebview.addEventListener('did-start-loading', () => {
            DOM.flacLoading?.classList.remove('hidden');
        });
        DOM.flacWebview.addEventListener('did-stop-loading', () => {
            DOM.flacLoading?.classList.add('hidden');
        });
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

    // Search - submit (botón lupa + tecla Enter/Go del teclado móvil)
    if (DOM.searchForm) {
        DOM.searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = DOM.searchInput?.value.trim();
            if (query) {
                handleSearch(query);
                DOM.searchInput?.blur();
            }
        });
    }

    // Search - botón X para borrar (visible solo con texto)
    if (DOM.searchInput && DOM.searchClear) {
        DOM.searchInput.addEventListener('input', () => {
            DOM.searchClear.classList.toggle('hidden', !DOM.searchInput.value);
        });
        DOM.searchClear.addEventListener('click', () => {
            DOM.searchInput.value = '';
            DOM.searchClear.classList.add('hidden');
            DOM.searchInput.focus();
        });
    }

    if (DOM.searchFilters) {
        DOM.searchFilters.querySelectorAll('.filter-chip').forEach((chip) => {
            chip.addEventListener('click', () => {
                DOM.searchFilters.querySelectorAll('.filter-chip').forEach((c) => {
                    c.classList.remove('active');
                    c.setAttribute('aria-pressed', 'false');
                });
                chip.classList.add('active');
                chip.setAttribute('aria-pressed', 'true');
                State.searchFilter = chip.dataset.type || 'all';

                const query = DOM.searchInput?.value.trim();
                if (query) {
                    handleSearch(query);
                }
            });
        });
    }

    // Spotify - submit (botón + tecla Go del teclado móvil)
    if (DOM.spotifyForm) {
        DOM.spotifyForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const url = DOM.spotifyInput?.value.trim();
            if (url) {
                handleLoadSpotifyPlaylist(url);
                DOM.spotifyInput?.blur();
            }
        });
    }

    // Spotify - selección de canciones
    if (DOM.btnSelectAll) {
        DOM.btnSelectAll.addEventListener('click', () => setAllTracksSelected(true));
    }
    if (DOM.btnSelectNone) {
        DOM.btnSelectNone.addEventListener('click', () => setAllTracksSelected(false));
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
    const tabByName = {
        home: DOM.tabHome,
        search: DOM.tabSearch,
        spotify: DOM.tabSpotify,
        flac: DOM.tabFlac,
        downloads: DOM.tabDownloads
    };
    const panelByName = {
        home: DOM.panelHome,
        search: DOM.panelSearch,
        spotify: DOM.panelSpotify,
        flac: DOM.panelFlac,
        downloads: DOM.panelDownloads
    };

    tabs.forEach((tab) => {
        tab?.classList.remove('active');
        tab?.removeAttribute('aria-current');
    });
    panels.forEach((panel) => panel?.classList.remove('active'));

    const tab = tabByName[tabName];
    const panel = panelByName[tabName];
    if (tab) {
        tab.classList.add('active');
        tab.setAttribute('aria-current', 'page');
    }
    panel?.classList.add('active');

    // Sincronizar el sidebar de escritorio (mismo estado de navegación)
    document.querySelectorAll('.side-item').forEach((btn) => {
        const active = btn.dataset.tab === tabName;
        btn.classList.toggle('active', active);
        if (active) {
            btn.setAttribute('aria-current', 'page');
        } else {
            btn.removeAttribute('aria-current');
        }
    });

    // Estado vacío de búsqueda la primera vez que se entra
    if (tabName === 'search' && DOM.searchResults && !DOM.searchResults.children.length) {
        renderSearchEmptyState();
    }
    // Visor FLAC cada vez que se entra a la pestaña
    if (tabName === 'flac') {
        setupFlacViewer();
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
        syncResultCards();
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

    if (DOM.previewSkeleton) {
        DOM.previewSkeleton.classList.remove('hidden');
    }
    if (DOM.videoPreview) {
        DOM.videoPreview.classList.add('hidden');
    }
    if (DOM.formatSelector) {
        DOM.formatSelector.classList.add('hidden');
    }
    if (DOM.qualityPicker) {
        DOM.qualityPicker.classList.add('hidden');
    }
    if (DOM.btnDownload) {
        DOM.btnDownload.classList.add('hidden');
    }

    try {
        const response = await Api.getVideoInfo(url);
        if (DOM.previewSkeleton) {
            DOM.previewSkeleton.classList.add('hidden');
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
        renderQualitySelector(info.availableQualities);
        updateDownloadButtonText();
    } catch (e) {
        console.error('Fetch error:', e);
        if (DOM.previewSkeleton) {
            DOM.previewSkeleton.classList.add('hidden');
        }
        showToast('Error al obtener información', 'error');
        State.activeUrl = null;
    } finally {
        State.isFetchingInfo = false;
    }
}

/**
 * Selector de calidad para MP4 (mobile-first): chips con las calidades
 * reales del video que reporta yt-dlp. Se oculta en MP3.
 */
function renderQualitySelector(qualities) {
    if (!DOM.qualityPicker) {
        return;
    }
    const list = (qualities || []).filter((q) => Number.isFinite(q));

    if (State.selectedFormat !== 'mp4' || list.length === 0) {
        DOM.qualityPicker.classList.add('hidden');
        DOM.qualityPicker.innerHTML = '';
        return;
    }

    DOM.qualityPicker.innerHTML = '';
    [...list]
        .sort((a, b) => b - a)
        .forEach((q) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `quality-chip${  q === State.selectedQuality ? ' active' : ''}`;
            btn.textContent = q >= 2160 ? '4K' : q >= 1440 ? '2K' : `${q}p`;
            btn.setAttribute('aria-label', `Calidad ${q}p`);
            btn.addEventListener('click', () => {
                State.selectedQuality = q;
                DOM.qualityPicker
                    .querySelectorAll('.quality-chip')
                    .forEach((c) => c.classList.remove('active'));
                btn.classList.add('active');
            });
            DOM.qualityPicker.appendChild(btn);
        });

    DOM.qualityPicker.classList.remove('hidden');
}

function setFormat(format) {
    State.selectedFormat = format;
    if (DOM.btnFormatMp3) {
        DOM.btnFormatMp3.classList.toggle('active', format === 'mp3');
    }
    if (DOM.btnFormatMp4) {
        DOM.btnFormatMp4.classList.toggle('active', format === 'mp4');
    }
    renderQualitySelector(State.currentVideoInfo?.availableQualities);
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
            if (DOM.qualityPicker) {
                DOM.qualityPicker.classList.add('hidden');
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
// Search Handlers (Buscador Avanzado, mobile-first)
// =========================================
const RECENT_KEY = 'mcp_recent_searches';
const SUGGESTIONS = ['Bad Bunny', 'Quevedo', 'Rock 80s español', 'Lofi para estudiar'];

/** Descargas activas asociadas a tarjetas de resultado: url -> { qid, card } */
const resultDownloads = new Map();

function getRecentSearches() {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

function saveRecentSearch(query) {
    const list = getRecentSearches().filter((q) => q !== query);
    list.unshift(query);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 4)));
}

function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return '';
    }
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
        : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Estado vacío: recientes, sugerencias y tarjeta de pegar enlace */
function renderSearchEmptyState() {
    if (!DOM.searchResults) {
        return;
    }
    const recents = getRecentSearches();

    const recentsHtml = recents.length
        ? `
        <div class="empty-section">
            <p class="empty-title">Búsquedas recientes</p>
            ${recents
        .map(
            (q) => `
                <button type="button" class="recent-item" data-query="${escapeHtml(q)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>${escapeHtml(q)}</span>
                </button>
            `
        )
        .join('')}
        </div>`
        : '';

    DOM.searchResults.innerHTML = `
        ${recentsHtml}
        <div class="empty-section">
            <p class="empty-title">Prueba con</p>
            <div class="suggestion-row">
                ${SUGGESTIONS.map(
        (s) =>
            `<button type="button" class="suggestion-chip" data-query="${escapeHtml(s)}">${escapeHtml(s)}</button>`
    ).join('')}
            </div>
        </div>
        <div class="paste-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
            <div class="paste-card-info">
                <strong>Pegar un enlace</strong>
                <span>YouTube, Spotify o SoundCloud</span>
            </div>
            <button type="button" class="btn-paste-link" id="btn-paste-link">Pegar</button>
        </div>
    `;

    DOM.searchResults.querySelectorAll('[data-query]').forEach((el) => {
        el.addEventListener('click', () => {
            const q = el.dataset.query;
            if (DOM.searchInput) {
                DOM.searchInput.value = q;
                DOM.searchClear?.classList.remove('hidden');
            }
            handleSearch(q);
        });
    });

    DOM.searchResults.querySelector('#btn-paste-link')?.addEventListener('click', async () => {
        switchTab('home');
        await handlePaste();
    });
}

async function handleSearch(query) {
    if (!DOM.searchResults) {
        return;
    }

    // Skeleton mientras busca (mismo layout que las tarjetas de resultado)
    DOM.searchResults.innerHTML = Array.from({ length: 3 })
        .map(
            () => `
            <div class="result-card skeleton-item" aria-hidden="true">
                <div class="skeleton result-thumb-wrap"></div>
                <div class="result-info">
                    <div class="skeleton skeleton-line w-80"></div>
                    <div class="skeleton skeleton-line w-45"></div>
                    <div class="skeleton skeleton-line w-30"></div>
                </div>
            </div>
        `
        )
        .join('');

    try {
        const response = await Api.search(query, 15, State.searchFilter);
        const results = response?.results || [];

        if (!results || results.length === 0) {
            DOM.searchResults.innerHTML = `
                <div class="no-results">
                    No encontramos nada con "${escapeHtml(query)}".<br />
                    Prueba con otro filtro o revisa el enlace.
                </div>
            `;
            return;
        }

        saveRecentSearch(query);
        renderResultCards(results);
    } catch (e) {
        console.error('Search error:', e);
        DOM.searchResults.innerHTML =
            '<div class="no-results">No se pudo completar la búsqueda. Revisa la conexión con el servidor.</div>';
    }
}

function renderResultCards(results) {
    DOM.searchResults.innerHTML = results
        .map((item) => {
            const url = item.url || item.webpage_url || '';
            const artist = item.cleanArtist || item.uploader || item.channel || '';
            const duration = formatDuration(item.duration);
            return `
            <div class="result-card" data-url="${escapeHtml(url)}">
                <div class="result-thumb-wrap">
                    <img src="${item.thumbnail || ''}" alt="" class="result-thumb" loading="lazy" />
                    ${duration ? `<span class="result-duration">${duration}</span>` : ''}
                </div>
                <div class="result-info">
                    <p class="result-title">${escapeHtml(item.cleanTitle || item.title)}</p>
                    <p class="result-meta">${escapeHtml(artist)} · YouTube</p>
                    <div class="result-actions">
                        <button type="button" class="result-format-btn primary" data-format="mp3" aria-label="Descargar MP3 320k">MP3</button>
                        <button type="button" class="result-format-btn" data-format="m4a" aria-label="Descargar M4A">M4A</button>
                        <button type="button" class="result-format-btn" data-format="mp4" aria-label="Descargar MP4">MP4</button>
                    </div>
                    <div class="result-progress hidden">
                        <div class="result-progress-track"><div class="result-progress-fill"></div></div>
                        <p class="result-progress-label"></p>
                    </div>
                </div>
            </div>
        `;
        })
        .join('');

    DOM.searchResults.querySelectorAll('.result-card').forEach((card) => {
        const url = card.dataset.url;
        card.querySelectorAll('.result-format-btn').forEach((btn) => {
            btn.addEventListener('click', () => handleResultDownload(card, url, btn.dataset.format));
        });
    });
}

async function handleResultDownload(card, url, format) {
    try {
        const result = await Api.addToQueue({ url, format, quality: null });
        if (!result.success) {
            showToast(result.message || 'No se pudo agregar la descarga', 'error');
            return;
        }

        // Congelar botones y mostrar progreso dentro de la tarjeta
        card.querySelectorAll('.result-format-btn').forEach((b) => (b.disabled = true));
        const progress = card.querySelector('.result-progress');
        const fill = card.querySelector('.result-progress-fill');
        const label = card.querySelector('.result-progress-label');
        progress.classList.remove('hidden', 'done', 'error');
        fill.style.width = '0%';
        label.textContent = 'En cola...';

        resultDownloads.set(url, { qid: result.item.id, card });
        await Api.startQueue();
        switchTab('downloads');
    } catch (e) {
        console.error('Result download error:', e);
        showToast('Error de conexión', 'error');
    }
}

/** Sincroniza el progreso de las tarjetas con la cola (vía SSE) */
function syncResultCards() {
    for (const [url, entry] of resultDownloads) {
        if (!document.body.contains(entry.card)) {
            resultDownloads.delete(url);
            continue;
        }
        const item = State.downloads.find((i) => i.id === entry.qid);
        if (!item) {
            continue;
        }
        const fill = entry.card.querySelector('.result-progress-fill');
        const label = entry.card.querySelector('.result-progress-label');
        const progress = entry.card.querySelector('.result-progress');

        if (item.status === 'completed') {
            progress.classList.add('done');
            fill.style.width = '100%';
            label.textContent = '✓ Guardado en Descargas';
            entry.card
                .querySelectorAll('.result-format-btn')
                .forEach((b) => (b.disabled = false));
            resultDownloads.delete(url);
        } else if (item.status === 'error') {
            progress.classList.add('error');
            label.textContent = `Error: ${item.error || 'falló la descarga'}`;
            entry.card
                .querySelectorAll('.result-format-btn')
                .forEach((b) => (b.disabled = false));
            resultDownloads.delete(url);
        } else {
            const pct = item.progress || 0;
            fill.style.width = `${pct}%`;
            const phase =
                item.status === 'converting'
                    ? 'Convirtiendo'
                    : item.status === 'searching'
                        ? 'Buscando'
                        : 'Descargando';
            const extra = [item.speed, item.eta].filter(Boolean).join(' · ');
            label.textContent = extra ? `${phase}... ${pct}% · ${extra}` : `${phase}... ${pct}%`;
        }
    }
}

// =========================================
// FLAC Handlers (visor lossless embebido)
// =========================================

/** Activa el visor FLAC embebido (solo escritorio: webview de Electron) */
function setupFlacViewer() {
    if (!window.electronAPI || !DOM.flacViewer || !DOM.flacWebview) {
        // Móvil / navegador: mostrar el botón de abrir fuera
        DOM.flacHeroMobile?.classList.remove('hidden');
        return;
    }
    // Escritorio: el webview ya está en el DOM; cargar el sitio solo al usarlo
    if (!DOM.flacWebview.src) {
        DOM.flacWebview.src = 'https://flacdownloader.com/';
    }
    DOM.flacViewer.classList.remove('hidden');
}

async function handleOpenFlac() {
    if (window.electronAPI?.openFlacView) {
        // Escritorio (botón móvil-hero no visible, pero por si acaso)
        try {
            await window.electronAPI.openFlacView();
            showToast('Abierto en ventana aparte', 'info');
        } catch (e) {
            showToast('No se pudo abrir la ventana FLAC', 'error');
        }
    } else {
        // Móvil / navegador: abrir en pestaña nueva
        window.open('https://flacdownloader.com/', '_blank', 'noopener');
    }
}

// =========================================
// Spotify Handlers
// =========================================
async function handleLoadSpotifyPlaylist(url) {
    if (DOM.spotifySkeleton) {
        DOM.spotifySkeleton.classList.remove('hidden');
    }
    if (DOM.playlistPreview) {
        DOM.playlistPreview.classList.add('hidden');
    }
    if (DOM.btnDownloadPlaylist) {
        DOM.btnDownloadPlaylist.classList.add('hidden');
    }

    try {
        const response = await Api.parseSpotifyPlaylist(url);
        if (DOM.spotifySkeleton) {
            DOM.spotifySkeleton.classList.add('hidden');
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

        State.currentSpotifyPlaylist = playlist;
        renderTrackList(playlist.tracks || []);
        updateSelectionCount();

        if (DOM.playlistPreview) {
            DOM.playlistPreview.classList.remove('hidden');
        }
        if (DOM.btnDownloadPlaylist) {
            DOM.btnDownloadPlaylist.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Spotify error:', e);
        if (DOM.spotifySkeleton) {
            DOM.spotifySkeleton.classList.add('hidden');
        }
        showToast('Error al cargar Spotify', 'error');
    }
}

/** Lista de canciones seleccionables (tap en la fila para marcar/desmarcar) */
function renderTrackList(tracks) {
    if (!DOM.trackList) {
        return;
    }
    DOM.trackList.innerHTML = tracks
        .map((track, index) => {
            const selected = track.selected !== false;
            // Spotify embed entrega la duración en milisegundos
            const dur =
                Number.isFinite(track.duration) && track.duration > 10000
                    ? formatDuration(track.duration / 1000)
                    : Number.isFinite(track.duration) && track.duration > 0
                        ? formatDuration(track.duration)
                        : '';
            return `
            <button type="button" class="track-row${selected ? ' selected' : ''}" data-index="${index}" aria-pressed="${selected}">
                <span class="track-check" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                </span>
                <span class="track-details">
                    <span class="track-title">${escapeHtml(track.name)}</span>
                    <span class="track-artist">${escapeHtml(track.artist)}</span>
                </span>
                ${dur ? `<span class="track-duration">${dur}</span>` : ''}
            </button>
        `;
        })
        .join('');

    DOM.trackList.querySelectorAll('.track-row').forEach((row) => {
        row.addEventListener('click', () => {
            const track = State.currentSpotifyPlaylist?.tracks?.[Number(row.dataset.index)];
            if (!track) {
                return;
            }
            track.selected = track.selected === false;
            const nowSelected = track.selected !== false;
            row.classList.toggle('selected', nowSelected);
            row.setAttribute('aria-pressed', String(nowSelected));
            updateSelectionCount();
        });
    });
}

function setAllTracksSelected(selected) {
    const tracks = State.currentSpotifyPlaylist?.tracks;
    if (!tracks) {
        return;
    }
    tracks.forEach((t) => (t.selected = selected));
    DOM.trackList?.querySelectorAll('.track-row').forEach((row) => {
        row.classList.toggle('selected', selected);
        row.setAttribute('aria-pressed', String(selected));
    });
    updateSelectionCount();
}

function updateSelectionCount() {
    const tracks = State.currentSpotifyPlaylist?.tracks || [];
    const count = tracks.filter((t) => t.selected !== false).length;

    if (DOM.selectionCount) {
        DOM.selectionCount.textContent = `${count} de ${tracks.length}`;
    }
    if (DOM.playlistCount) {
        DOM.playlistCount.textContent =
            tracks.length > 0 ? `${tracks.length} canciones` : 'Sin canciones';
    }
    if (DOM.btnDownloadPlaylist) {
        DOM.btnDownloadPlaylist.disabled = count === 0;
        DOM.btnDownloadPlaylist.textContent =
            count === 0 ? 'Selecciona canciones' : `Descargar ${count} canciones`;
    }
}

async function handleDownloadSpotifyPlaylist() {
    const tracks = State.currentSpotifyPlaylist?.tracks || [];
    const selected = tracks.filter((t) => t.selected !== false);
    if (selected.length === 0) {
        showToast('Selecciona al menos una canción', 'error');
        return;
    }

    try {
        const result = await Api.addSpotifyTracks(selected, 'mp3');

        if (result.success) {
            showToast(`¡Añadidas ${selected.length} canciones a la cola!`, 'success');
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
        const signature = `${item.status}|${item.progress}|${item.title}|${item.error || ''}|${item.filePath || ''}|${item.speed || ''}|${item.eta || ''}`;
        const el = downloadItemElements.get(key);
        if (!el) {
            const created = createDownloadItemElement(item);
            created.dataset.signature = signature;
            downloadItemElements.set(key, created);
            DOM.downloadsList.appendChild(created);
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
    const isError = item.status === 'error';

    div.innerHTML = `
        <img class="download-thumb" src="${item.thumbnail || ''}" alt="" loading="lazy" />
        <div class="download-info">
            <h4 class="download-title">${escapeHtml(item.title || 'Descargando...')}</h4>
            <div class="download-progress ${isDownloading ? '' : 'hidden'}">
                <div class="download-progress-bar ${isCompleted ? 'complete' : ''}" style="width: ${item.progress || 0}%"></div>
            </div>
            <div class="download-status">
                <span class="download-badge ${item.format}">${item.format.toUpperCase()}</span>
                <span class="download-status-text${isError ? ' error' : ''}${isCompleted ? ' done' : ''}">${getStatusText(item)}</span>
            </div>
        </div>
        <div class="download-actions">
            ${
    isCompleted && item.filePath && State.capabilities.desktopShell
        ? `
                <button class="btn-ghost btn-open-file" title="Abrir archivo" aria-label="Abrir archivo" data-path="${escapeHtml(item.filePath)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </button>
            `
        : ''
}
            <button class="btn-ghost btn-remove" title="Eliminar" aria-label="Eliminar descarga" data-id="${item.id}">
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

function getStatusText(item) {
    const { status, progress, error } = item;
    switch (status) {
    case 'pending':
        return 'En espera...';
    case 'searching':
        return 'Buscando audio en YouTube...';
    case 'downloading': {
        let extra = '';
        if (item.speed) {
            extra += ` · ${item.speed}`;
        }
        if (item.eta) {
            extra += ` · ${item.eta}`;
        }
        return `Descargando... ${progress || 0}%${extra}`;
    }
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
    const activeCount = State.downloads.filter(
        (i) => i.status === 'pending' || i.status === 'downloading' || i.status === 'converting'
    ).length;

    if (DOM.downloadsBadge) {
        DOM.downloadsBadge.textContent = activeCount > 0 ? activeCount : '';
    }
    // Badge del sidebar de escritorio
    const sideBadge = document.getElementById('side-downloads-badge');
    if (sideBadge) {
        sideBadge.textContent = activeCount > 0 ? activeCount : '';
    }
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

// PWA: registrar service worker solo en contexto web real (no en Capacitor/Electron)
if (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    /^https?:$/.test(location.protocol) &&
    !window.electronAPI &&
    !window.Capacitor
) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            /* la app funciona igual sin SW */
        });
    });
}

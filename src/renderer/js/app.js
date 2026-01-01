/**
 * Media Converter Pro - Main App (Redesigned)
 * Simplified user flow - Standalone version
 */

'use strict';

// =========================================
// DOM References (initialized after DOM ready)
// =========================================
const $ = id => document.getElementById(id);
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
    selectedFormat: 'mp3'
};

// =========================================
// Initialize
// =========================================
function init() {
    console.log('[App] Initializing...');

    // Initialize DOM references AFTER DOM is ready
    DOM = {
        // Titlebar
        btnMinimize: $('btn-minimize'),
        btnClose: $('btn-close'),

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
        downloadText: $('download-text'),
        folderSelector: $('folder-selector'),
        folderPath: $('folder-path'),

        // Search
        searchInput: $('search-input'),
        btnSearch: $('btn-search'),
        searchResults: $('search-results'),

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
        downloadPlaylistText: $('download-playlist-text'),

        // Downloads
        btnOpenFolder: $('btn-open-folder'),
        btnClear: $('btn-clear'),
        downloadsList: $('downloads-list'),
        emptyDownloads: $('empty-downloads'),

        // Toast
        toast: $('toast'),
        toastMessage: $('toast-message')
    };

    console.log('[App] DOM refs:', Object.keys(DOM).filter(k => DOM[k]).length, 'found');

    // Setup toast
    window.showToast = showToast;

    // Load settings and queue
    loadInitialData();

    // Setup event listeners
    setupEventListeners();
    setupQueueListeners();

    console.log('[App] Initialized successfully');
}

async function loadInitialData() {
    try {
        const settings = await window.electronAPI.getSettings();
        if (settings?.downloadFolder) {
            State.downloadFolder = settings.downloadFolder;
            updateFolderDisplay();
        }

        const queueData = await window.electronAPI.getQueue();
        if (queueData) {
            State.downloads = queueData.queue || [];
            updateDownloadsList();
            updateBadge();
            if (queueData.downloadFolder) {
                State.downloadFolder = queueData.downloadFolder;
                updateFolderDisplay();
            }
        }
    } catch (e) {
        console.error('[App] Error loading initial data:', e);
    }
}

// =========================================
// Event Listeners
// =========================================
function setupEventListeners() {
    console.log('[App] Setting up event listeners...');

    // Window controls
    if (DOM.btnMinimize) {
        DOM.btnMinimize.addEventListener('click', () => {
            console.log('[Click] Minimize');
            window.electronAPI.minimizeWindow();
        });
    }

    if (DOM.btnClose) {
        DOM.btnClose.addEventListener('click', () => {
            console.log('[Click] Close');
            window.electronAPI.closeWindow();
        });
    }

    // Tab navigation
    if (DOM.tabHome) DOM.tabHome.addEventListener('click', () => switchTab('home'));
    if (DOM.tabSearch) DOM.tabSearch.addEventListener('click', () => switchTab('search'));
    if (DOM.tabSpotify) DOM.tabSpotify.addEventListener('click', () => switchTab('spotify'));
    if (DOM.tabDownloads) DOM.tabDownloads.addEventListener('click', () => switchTab('downloads'));

    // Home - Paste button
    if (DOM.btnPaste) {
        DOM.btnPaste.addEventListener('click', () => {
            console.log('[Click] Paste');
            handlePaste();
        });
    }

    // Home - URL input enter key
    if (DOM.urlInput) {
        DOM.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const url = DOM.urlInput.value.trim();
                if (url) fetchVideoInfo(url);
            }
        });
    }

    // Home - Download button
    if (DOM.btnDownload) {
        DOM.btnDownload.addEventListener('click', () => {
            console.log('[Click] Download');
            handleDownload();
        });
    }

    // Home - Format selector buttons
    if (DOM.btnFormatMp3) {
        DOM.btnFormatMp3.addEventListener('click', () => {
            setFormat('mp3');
        });
    }
    if (DOM.btnFormatMp4) {
        DOM.btnFormatMp4.addEventListener('click', () => {
            setFormat('mp4');
        });
    }

    // Home - Folder selector
    if (DOM.folderSelector) {
        DOM.folderSelector.addEventListener('click', () => {
            console.log('[Click] Folder selector');
            handleSelectFolder();
        });
    }

    // Search - Search button
    if (DOM.btnSearch) {
        DOM.btnSearch.addEventListener('click', () => {
            const query = DOM.searchInput?.value.trim();
            if (query) handleSearch(query);
        });
    }

    // Search - Enter key
    if (DOM.searchInput) {
        DOM.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = DOM.searchInput.value.trim();
                if (query) handleSearch(query);
            }
        });
    }

    // Spotify - Load playlist
    if (DOM.btnLoadPlaylist) {
        DOM.btnLoadPlaylist.addEventListener('click', () => {
            const url = DOM.spotifyInput?.value.trim();
            if (url) handleLoadSpotifyPlaylist(url);
        });
    }

    // Spotify - Download button
    if (DOM.btnDownloadPlaylist) {
        DOM.btnDownloadPlaylist.addEventListener('click', () => {
            handleDownloadSpotifyPlaylist();
        });
    }

    // Downloads - Open folder
    if (DOM.btnOpenFolder) {
        DOM.btnOpenFolder.addEventListener('click', () => {
            if (State.downloadFolder) {
                window.electronAPI.openFolder(State.downloadFolder);
            } else {
                showToast('No hay carpeta seleccionada', 'error');
            }
        });
    }

    // Downloads - Clear history
    if (DOM.btnClear) {
        DOM.btnClear.addEventListener('click', async () => {
            await window.electronAPI.clearQueue();
            State.downloads = [];
            updateDownloadsList();
            updateBadge();
            showToast('Historial limpiado');
        });
    }

    console.log('[App] Event listeners ready');
}

function setupQueueListeners() {
    window.electronAPI.onQueueUpdate((data) => {
        State.downloads = data.queue || [];
        updateDownloadsList();
        updateBadge();
        if (data.downloadFolder) {
            State.downloadFolder = data.downloadFolder;
            updateFolderDisplay();
        }
    });

    window.electronAPI.onQueueComplete(() => {
        showToast('¡Descargas completadas!', 'success');
    });
}

// =========================================
// Tab Navigation
// =========================================
function switchTab(tab) {
    console.log('[App] Switching to:', tab);
    State.currentTab = tab;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    const tabNames = { home: 'tabHome', search: 'tabSearch', spotify: 'tabSpotify', downloads: 'tabDownloads' };
    if (DOM[tabNames[tab]]) DOM[tabNames[tab]].classList.add('active');

    // Update panels
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    const panelNames = { home: 'panelHome', search: 'panelSearch', spotify: 'panelSpotify', downloads: 'panelDownloads' };
    if (DOM[panelNames[tab]]) DOM[panelNames[tab]].classList.add('active');
}

// =========================================
// Home - Main Flow
// =========================================
async function handlePaste() {
    try {
        const text = await navigator.clipboard.readText();
        console.log('[App] Pasted:', text.substring(0, 50));
        if (DOM.urlInput) DOM.urlInput.value = text;

        if (isValidYouTubeUrl(text)) {
            fetchVideoInfo(text);
        } else {
            showToast('Link no válido. Copia un link de YouTube.', 'error');
        }
    } catch (e) {
        console.error('Paste error:', e);
        showToast('No se pudo pegar. Intenta de nuevo.', 'error');
    }
}

async function fetchVideoInfo(url) {
    console.log('[App] Fetching video info...');

    // Show loading
    if (DOM.loadingState) DOM.loadingState.classList.remove('hidden');
    if (DOM.videoPreview) DOM.videoPreview.classList.add('hidden');
    if (DOM.btnDownload) DOM.btnDownload.classList.add('hidden');

    try {
        const result = await window.electronAPI.getYouTubeInfo(url);
        if (DOM.loadingState) DOM.loadingState.classList.add('hidden');

        // The API returns { success, info } or { success, message }
        if (!result || !result.success || !result.info) {
            showToast(result?.message || 'No se pudo obtener info del video', 'error');
            return;
        }

        const info = result.info;
        console.log('[App] Got video info:', info.title);

        // Show preview
        if (DOM.previewThumb) DOM.previewThumb.src = info.thumbnail || '';
        if (DOM.previewTitle) DOM.previewTitle.textContent = info.title || 'Sin título';
        if (DOM.previewChannel) DOM.previewChannel.textContent = info.uploader || '';
        if (DOM.videoPreview) DOM.videoPreview.classList.remove('hidden');

        // Store info
        State.currentVideoInfo = info;
        State.selectedQuality = info.availableQualities?.length > 0
            ? Math.max(...info.availableQualities)
            : 1080;

        // Show format selector and download button
        if (DOM.formatSelector) DOM.formatSelector.classList.remove('hidden');
        if (DOM.btnDownload) DOM.btnDownload.classList.remove('hidden');
        updateDownloadButtonText();

    } catch (e) {
        console.error('Fetch error:', e);
        if (DOM.loadingState) DOM.loadingState.classList.add('hidden');
        showToast('Error al obtener información', 'error');
    }
}

// Format selection
function setFormat(format) {
    State.selectedFormat = format;

    // Update button states
    if (DOM.btnFormatMp3) {
        DOM.btnFormatMp3.classList.toggle('active', format === 'mp3');
    }
    if (DOM.btnFormatMp4) {
        DOM.btnFormatMp4.classList.toggle('active', format === 'mp4');
    }

    updateDownloadButtonText();
}

function updateDownloadButtonText() {
    if (DOM.downloadText) {
        const formatLabel = State.selectedFormat === 'mp4' ? 'VIDEO' : 'MP3';
        DOM.downloadText.textContent = `DESCARGAR ${formatLabel}`;
    }
}

async function handleDownload() {
    const url = DOM.urlInput?.value.trim();
    if (!url) {
        showToast('Primero pega un link', 'error');
        return;
    }

    if (!State.downloadFolder) {
        showToast('Primero selecciona una carpeta', 'error');
        return;
    }

    try {
        const format = State.selectedFormat || 'mp3';
        const quality = State.selectedFormat === 'mp4' ? State.selectedQuality : 'best';

        const result = await window.electronAPI.addToQueue(url, format, quality);
        if (result.success) {
            showToast(`Descargando ${format.toUpperCase()}...`, 'success');
            window.electronAPI.startQueue();

            // Reset UI
            if (DOM.urlInput) DOM.urlInput.value = '';
            if (DOM.videoPreview) DOM.videoPreview.classList.add('hidden');
            if (DOM.formatSelector) DOM.formatSelector.classList.add('hidden');
            if (DOM.btnDownload) DOM.btnDownload.classList.add('hidden');
            State.currentVideoInfo = null;

            // Switch to downloads
            switchTab('downloads');
        } else {
            showToast(result.message || 'Error al añadir', 'error');
        }
    } catch (e) {
        console.error('Download error:', e);
        showToast('Error de conexión', 'error');
    }
}

// =========================================
// Search
// =========================================
async function handleSearch(query) {
    console.log('[App] Searching:', query);

    if (!DOM.searchResults) return;

    DOM.searchResults.innerHTML = '<p class="empty-message">Buscando...</p>';

    try {
        const response = await window.electronAPI.searchYouTube(query, 10);

        // API returns { success, results }
        const results = response?.results || [];

        if (!results || results.length === 0) {
            DOM.searchResults.innerHTML = '<p class="empty-message">No se encontraron resultados</p>';
            return;
        }

        DOM.searchResults.innerHTML = results.map(item => `
            <div class="search-item" data-url="${item.url || item.webpage_url}">
                <img src="${item.thumbnail || ''}" alt="" class="search-thumb">
                <div class="search-info">
                    <p class="search-title">${escapeHtml(item.title)}</p>
                    <p class="search-channel">${escapeHtml(item.uploader || item.channel || '')}</p>
                </div>
            </div>
        `).join('');

        // Add click handlers
        DOM.searchResults.querySelectorAll('.search-item').forEach(item => {
            item.addEventListener('click', () => {
                const url = item.dataset.url;
                if (url) {
                    if (DOM.urlInput) DOM.urlInput.value = url;
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
// Spotify
// =========================================
async function handleLoadSpotifyPlaylist(url) {
    console.log('[App] Loading Spotify playlist:', url);

    if (DOM.spotifyLoading) DOM.spotifyLoading.classList.remove('hidden');
    if (DOM.playlistPreview) DOM.playlistPreview.classList.add('hidden');
    if (DOM.btnDownloadPlaylist) DOM.btnDownloadPlaylist.classList.add('hidden');

    try {
        const response = await window.electronAPI.parseSpotifyPlaylist(url);

        if (DOM.spotifyLoading) DOM.spotifyLoading.classList.add('hidden');

        // API returns { success, playlist } or { success, message }
        if (!response || !response.success || !response.playlist) {
            showToast(response?.message || 'No se pudo cargar la playlist', 'error');
            return;
        }

        const playlist = response.playlist;
        console.log('[App] Got playlist:', playlist.name, playlist.tracks?.length, 'tracks');

        if (!playlist.tracks || playlist.tracks.length === 0) {
            showToast('La playlist está vacía', 'error');
            return;
        }

        // Show playlist info
        if (DOM.playlistCover) DOM.playlistCover.src = playlist.thumbnail || '';
        if (DOM.playlistName) DOM.playlistName.textContent = playlist.title || 'Playlist';
        if (DOM.playlistCount) DOM.playlistCount.textContent = `${playlist.tracks.length} canciones`;

        // Show tracks
        if (DOM.trackList) {
            DOM.trackList.innerHTML = playlist.tracks.slice(0, 50).map((track, i) => `
                <div class="track-item">
                    <span class="track-number">${i + 1}</span>
                    <div class="track-details">
                        <span class="track-title">${escapeHtml(track.name)}</span>
                        <span class="track-artist">${escapeHtml(track.artist || track.artists?.[0] || '')}</span>
                    </div>
                    <button class="btn-icon-small btn-download-track" data-index="${i}" title="Descargar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>
                </div>
            `).join('');

            // Add click handlers for single track download
            DOM.trackList.querySelectorAll('.btn-download-track').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(btn.dataset.index);
                    handleDownloadSingleSpotifyTrack(index);
                });
            });
        }

        if (DOM.playlistPreview) DOM.playlistPreview.classList.remove('hidden');
        if (DOM.btnDownloadPlaylist) {
            DOM.btnDownloadPlaylist.classList.remove('hidden');
            if (DOM.downloadPlaylistText) {
                DOM.downloadPlaylistText.textContent = `DESCARGAR TODO (${playlist.tracks.length})`;
            }
        }

        // Store tracks
        State.spotifyTracks = playlist.tracks;

    } catch (e) {
        console.error('Spotify error:', e);
        if (DOM.spotifyLoading) DOM.spotifyLoading.classList.add('hidden');
        showToast('Error al cargar playlist', 'error');
    }
}

async function handleDownloadSpotifyPlaylist() {
    const tracks = State.spotifyTracks;
    if (!tracks || tracks.length === 0) {
        showToast('No hay canciones para descargar', 'error');
        return;
    }

    if (!State.downloadFolder) {
        showToast('Selecciona una carpeta primero', 'error');
        return;
    }

    try {
        const response = await window.electronAPI.downloadSpotifyPlaylist(tracks, 'mp3', State.downloadFolder);

        if (response.success) {
            showToast(`Añadidas ${response.addedCount} canciones a la cola`, 'success');
            window.electronAPI.startQueue();

            // Switch to downloads tab
            switchTab('downloads');

            // Allow time for queues to update before switching
            setTimeout(() => {
                // Reset Spotify UI slightly if needed, or keep it visible
            }, 500);
        } else {
            showToast(response.message || 'Error al descargar playlist', 'error');
        }
    } catch (e) {
        console.error('Spotify download error:', e);
        showToast('Error al iniciar descargas', 'error');
    }
}

async function handleDownloadSingleSpotifyTrack(index) {
    const tracks = State.spotifyTracks;
    if (!tracks || !tracks[index]) return;

    const track = tracks[index];
    console.log('[App] Downloading single track:', track.name);

    if (!State.downloadFolder) {
        showToast('Selecciona una carpeta primero', 'error');
        return;
    }

    try {
        // Reuse downloadSpotifyPlaylist but send only 1 track
        const response = await window.electronAPI.downloadSpotifyPlaylist([track], 'mp3', State.downloadFolder);

        if (response.success) {
            showToast(`Añadida: ${track.name}`, 'success');
            window.electronAPI.startQueue();

            // Do NOT switch tabs, let user download more if they want
            // Update badge so they know it's happening
            updateBadge();
        } else {
            showToast(response.message || 'Error al descargar canción', 'error');
        }
    } catch (e) {
        console.error('Track download error:', e);
        showToast('Error al descargar', 'error');
    }
}

// =========================================
// Folder Selection
// =========================================
async function handleSelectFolder() {
    try {
        const result = await window.electronAPI.setDownloadFolder();
        if (result.success && result.folder) {
            State.downloadFolder = result.folder;
            updateFolderDisplay();
            showToast('Carpeta seleccionada');
        }
    } catch (e) {
        console.error('Folder select error:', e);
    }
}

function updateFolderDisplay() {
    if (DOM.folderPath && State.downloadFolder) {
        const folderName = State.downloadFolder.split(/[/\\]/).pop();
        DOM.folderPath.textContent = folderName || State.downloadFolder;
    }
}

// =========================================
// Downloads List
// =========================================
function updateDownloadsList() {
    if (!DOM.downloadsList) return;

    const downloads = State.downloads || [];

    if (downloads.length === 0) {
        DOM.downloadsList.innerHTML = `
            <p class="empty-message">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Las descargas aparecerán aquí
            </p>
        `;
        return;
    }

    DOM.downloadsList.innerHTML = downloads.map(item => `
        <div class="download-item" data-id="${item.id}">
            <img src="${item.thumbnail || ''}" alt="" class="download-thumb">
            <div class="download-info">
                <p class="download-title">${escapeHtml(item.title || 'Descargando...')}</p>
                <div class="download-progress">
                    <div class="download-progress-bar ${item.status === 'completed' ? 'complete' : ''}" 
                         style="width: ${item.progress || 0}%"></div>
                </div>
                <div class="download-status">
                    <span class="download-badge ${item.format}">${item.format?.toUpperCase() || 'MP3'}</span>
                    <span>${getStatusText(item.status, item.progress)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function getStatusText(status, progress) {
    switch (status) {
        case 'completed': return '✓ Completado';
        case 'downloading': return `${progress || 0}%`;
        case 'converting': return 'Convirtiendo...';
        case 'error': return '✗ Error';
        default: return 'Esperando...';
    }
}

function updateBadge() {
    const active = (State.downloads || []).filter(d =>
        d.status === 'downloading' || d.status === 'pending' || d.status === 'converting'
    ).length;

    if (DOM.downloadsBadge) {
        DOM.downloadsBadge.textContent = active > 0 ? active : '';
    }
}

// =========================================
// Toast
// =========================================
let toastTimeout;
function showToast(message, type = 'info') {
    console.log(`[Toast] ${type}: ${message}`);

    if (!DOM.toast || !DOM.toastMessage) return;

    DOM.toastMessage.textContent = message;
    DOM.toast.className = `toast ${type} show`;

    if (toastTimeout) clearTimeout(toastTimeout);
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
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =========================================
// Initialize on DOM Ready
// =========================================
document.addEventListener('DOMContentLoaded', init);

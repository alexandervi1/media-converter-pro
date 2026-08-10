'use strict';

/**
 * Referencias DOM centralizadas
 * @module renderer/dom
 */

const $ = (id) => document.getElementById(id);

/**
 * Referencias a elementos del DOM
 */
const DOM = {
    // Menú Hamburguesa & Drawer de Configuración de Temas
    btnHamburger: $('btn-hamburger'),
    btnSettingsGear: $('btn-settings-gear'),
    settingsDrawer: $('settings-drawer'),
    drawerOverlay: $('drawer-overlay'),
    btnCloseDrawer: $('btn-close-drawer'),

    // Input y botones principales
    urlInput: $('url-input'),
    btnDownload: $('btn-download'),
    btnPaste: $('btn-paste'),
    downloadBtnText: $('download-btn-text'),

    // Carpeta
    folderPath: $('folder-path'),
    btnFolder: $('btn-folder'),
    btnOpenFolder: $('btn-open-folder'),

    // Formato
    formatSelector: $('format-selector'),
    btnFormatMp3: $('btn-format-mp3'),
    btnFormatMp4: $('btn-format-mp4'),

    // Preview & Loading
    loadingState: $('loading-state'),
    videoPreview: $('video-preview'),
    previewThumb: $('preview-thumb'),
    previewTitle: $('preview-title'),
    previewChannel: $('preview-channel'),

    // Downloads
    downloadsList: $('downloads-list'),
    downloadsBadge: $('downloads-badge'),
    emptyDownloads: $('empty-downloads'),
    btnClear: $('btn-clear'),
    btnCache: $('btn-cache'),

    // Window controls
    btnMinimize: $('btn-minimize'),
    btnClose: $('btn-close'),

    // Toast
    toast: $('toast'),
    toastMessage: $('toast-message'),

    // Tabs
    tabHome: $('tab-home'),
    tabSearch: $('tab-search'),
    tabSpotify: $('tab-spotify'),
    tabDownloads: $('tab-downloads'),

    panelHome: $('panel-home'),
    panelSearch: $('panel-search'),
    panelSpotify: $('panel-spotify'),
    panelDownloads: $('panel-downloads'),

    // Search
    searchInput: $('search-input'),
    btnSearch: $('btn-search'),
    searchResults: $('search-results'),
    searchFilters: $('search-filters'),

    // Spotify
    spotifyInput: $('spotify-input'),
    btnLoadSpotify: $('btn-load-spotify'),
    spotifyLoading: $('spotify-loading'),
    playlistPreview: $('playlist-preview'),
    playlistCover: $('playlist-cover'),
    playlistName: $('playlist-name'),
    playlistCount: $('playlist-count'),
    trackList: $('track-list'),
    btnDownloadPlaylist: $('btn-download-playlist')
};

/**
 * Verifica que un elemento DOM exista
 * @param {string} key - Clave del elemento en DOM
 * @returns {HTMLElement|null}
 */
function getElement(key) {
    return DOM[key] || null;
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOM, $, getElement };
} else {
    window.DOM = DOM;
    window.$ = $;
    window.getElement = getElement;
}

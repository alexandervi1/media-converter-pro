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
    // Input y botones principales
    urlInput: $('url-input'),
    btnDownload: $('btn-download'),
    btnPaste: $('btn-paste'),

    // Carpeta
    folderRow: $('folder-row'),
    folderPath: $('folder-path'),
    btnFolder: $('btn-folder'),
    btnOpenFolder: $('btn-open-folder'),

    // Formato
    btnFast: $('btn-fast'),
    btnMp3: $('btn-mp3'),
    btnVideo: $('btn-video'),

    // Calidad
    qualityToggle: $('quality-toggle'),
    btn1080p: $('btn-1080p'),
    btn720p: $('btn-720p'),
    btn480p: $('btn-480p'),

    // Preview
    videoPreview: $('video-preview'),
    previewThumb: $('preview-thumb'),
    previewTitle: $('preview-title'),
    previewChannel: $('preview-channel'),

    // Downloads
    downloadsList: $('downloads-list'),
    emptyState: $('empty-state'),
    downloadCount: $('download-count'),
    btnClear: $('btn-clear'),
    btnCache: $('btn-cache'),

    // Window controls
    btnMinimize: $('btn-minimize'),
    btnClose: $('btn-close'),

    // Toast
    toast: $('toast'),
    toastMessage: $('toast-message'),

    // Tabs
    tabUrl: $('tab-url'),
    tabSearch: $('tab-search'),
    modeUrl: $('mode-url'),
    modeSearch: $('mode-search'),

    // Search
    searchInput: $('search-input'),
    btnSearch: $('btn-search'),
    resultsContainer: $('results-container'),
    resultsList: $('results-list'),

    // Tutorial
    tutorialOverlay: $('tutorial-overlay'),
    tutorialNext: $('tutorial-next'),
    tutorialSkip: $('tutorial-skip'),
    tutorialDontShow: $('tutorial-dont-show')
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

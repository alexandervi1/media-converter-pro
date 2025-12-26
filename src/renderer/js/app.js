/**
 * Media Converter Pro - YouTube Downloader
 * 
 * @description Aplicación de escritorio para descargar audio y video de YouTube
 * @version 2.0.0
 * @author Media Converter Team
 * 
 * @module renderer/app
 * 
 * Arquitectura:
 * - State: Estado centralizado de la aplicación
 * - DOM: Referencias a elementos del DOM
 * - Event Listeners: Manejadores de eventos
 * - Handlers: Funciones de descarga, búsqueda, UI
 * 
 * Módulos relacionados (ver js/ folder):
 * - state.js: Estado como módulo separado
 * - dom.js: Referencias DOM centralizadas
 * - components/toast.js: Componente de notificaciones
 * - utils/validators.js: Funciones de validación
 */

'use strict';

// =========================================
// State - Estado centralizado de la app
// =========================================
const State = {
    downloads: [],       // Lista de descargas
    downloadFolder: '',  // Carpeta de destino
    isProcessing: false, // Si hay descargas en proceso
    currentPreview: null, // Preview actual
    selectedFormat: 'm4a',  // 'm4a' = audio, 'mp3' = mp3, 'mp4' = video
    selectedQuality: 1080,  // Calidad de video: 1080, 720, 480
    searchResults: [],   // Resultados de búsqueda
    currentMode: 'url'   // 'url' o 'search'
};

// =========================================
// DOM Elements
// =========================================
const $ = (id) => document.getElementById(id);

const DOM = {
    urlInput: $('url-input'),
    btnDownload: $('btn-download'),
    btnPaste: $('btn-paste'),
    folderRow: $('folder-row'),
    folderPath: $('folder-path'),
    btnFolder: $('btn-folder'),
    btnOpenFolder: $('btn-open-folder'),
    btnFast: $('btn-fast'),
    btnMp3: $('btn-mp3'),
    btnVideo: $('btn-video'),
    qualityToggle: $('quality-toggle'),
    btn1080p: $('btn-1080p'),
    btn720p: $('btn-720p'),
    btn480p: $('btn-480p'),
    videoPreview: $('video-preview'),
    previewThumb: $('preview-thumb'),
    previewTitle: $('preview-title'),
    previewChannel: $('preview-channel'),
    downloadsList: $('downloads-list'),
    emptyState: $('empty-state'),
    downloadCount: $('download-count'),
    btnClear: $('btn-clear'),
    btnCache: $('btn-cache'),
    btnMinimize: $('btn-minimize'),
    btnClose: $('btn-close'),
    toast: $('toast'),
    toastMessage: $('toast-message'),
    // Search elements
    tabUrl: $('tab-url'),
    tabSearch: $('tab-search'),
    modeUrl: $('mode-url'),
    modeSearch: $('mode-search'),
    searchInput: $('search-input'),
    btnSearch: $('btn-search'),
    searchResults: $('search-results'),
    searchEmpty: $('search-empty'),
    resultsList: $('results-list'),
    // Tutorial elements
    tutorialOverlay: $('tutorial-overlay'),
    tutorialNext: $('tutorial-next'),
    tutorialSkip: $('tutorial-skip'),
    tutorialDontShow: $('tutorial-dont-show')
};

// =========================================
// Initialize
// =========================================
async function init() {
    setupEventListeners();
    await loadInitialState();
    setupQueueListeners();

    // Mostrar tutorial si es primera vez
    checkShowTutorial();
}

async function loadInitialState() {
    try {
        const result = await window.electronAPI.getQueue();
        State.downloads = result.queue || [];
        State.downloadFolder = result.downloadFolder || '';
        updateFolderDisplay();
        renderDownloads();
    } catch (err) {
        console.error('Error loading state:', err);
    }
}

// =========================================
// Event Listeners
// =========================================
function setupEventListeners() {
    // Window controls
    DOM.btnMinimize?.addEventListener('click', () => window.electronAPI.minimizeWindow());
    DOM.btnClose?.addEventListener('click', () => window.electronAPI.closeWindow());

    // URL input - detect paste and show preview
    DOM.urlInput?.addEventListener('input', debounce(handleUrlInput, 500));
    DOM.urlInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleDownload();
    });

    // Download button
    DOM.btnDownload?.addEventListener('click', handleDownload);

    // Folder selection
    DOM.btnFolder?.addEventListener('click', handleSelectFolder);
    DOM.folderRow?.addEventListener('click', (e) => {
        if (!e.target.closest('.folder-btn')) handleSelectFolder();
    });

    // Clear completed
    DOM.btnClear?.addEventListener('click', handleClearCompleted);

    // Clear cache
    DOM.btnCache?.addEventListener('click', handleClearCache);

    // Paste button
    DOM.btnPaste?.addEventListener('click', handlePasteFromClipboard);

    // Open folder button
    DOM.btnOpenFolder?.addEventListener('click', handleOpenFolder);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+V when input is focused - auto paste and preview
        if (e.ctrlKey && e.key === 'v' && document.activeElement === DOM.urlInput) {
            setTimeout(() => handleUrlInput(), 100);
        }
        // Escape - clear input
        if (e.key === 'Escape') {
            DOM.urlInput.value = '';
            hidePreview();
            DOM.urlInput.focus();
        }
    });

    // Delete button delegation (clicks on delete buttons in queue)
    DOM.downloadsList?.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.item-delete');
        if (deleteBtn) {
            const id = parseInt(deleteBtn.dataset.id);
            handleRemoveFromQueue(id);
        }
    });

    // Format toggle (Audio vs MP3 vs Video)
    DOM.btnFast?.addEventListener('click', () => toggleFormat('m4a'));
    DOM.btnMp3?.addEventListener('click', () => toggleFormat('mp3'));
    DOM.btnVideo?.addEventListener('click', () => toggleFormat('mp4'));

    // Video quality toggle
    DOM.btn1080p?.addEventListener('click', () => toggleQuality(1080));
    DOM.btn720p?.addEventListener('click', () => toggleQuality(720));
    DOM.btn480p?.addEventListener('click', () => toggleQuality(480));

    // Mode tabs (URL vs Search)
    DOM.tabUrl?.addEventListener('click', () => switchMode('url'));
    DOM.tabSearch?.addEventListener('click', () => switchMode('search'));

    // Search
    DOM.btnSearch?.addEventListener('click', handleSearch);
    DOM.searchInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    // Search results click delegation
    DOM.resultsList?.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.result-btn.play');
        const downloadBtn = e.target.closest('.result-btn.download');
        const item = e.target.closest('.result-item');

        if (!item) return;

        const url = item.dataset.url;
        const title = item.dataset.title;

        if (playBtn && url) {
            openInBrowser(url);
        } else if (downloadBtn && url) {
            downloadFromSearch(url, title);
        }
    });
}

function toggleFormat(format) {
    State.selectedFormat = format;

    // Update UI
    DOM.btnFast?.classList.toggle('active', format === 'm4a');
    DOM.btnMp3?.classList.toggle('active', format === 'mp3');
    DOM.btnVideo?.classList.toggle('active', format === 'mp4');

    // Show/hide quality toggle (only for video)
    DOM.qualityToggle?.classList.toggle('hidden', format !== 'mp4');

    // Show feedback
    const messages = {
        'm4a': 'Modo Audio (AAC rápido)',
        'mp3': 'Modo MP3 (320kbps)',
        'mp4': `Modo Video (${State.selectedQuality}p)`
    };
    showToast(messages[format] || format, 'success');
}

function toggleQuality(quality) {
    State.selectedQuality = quality;

    // Update UI
    DOM.btn1080p?.classList.toggle('active', quality === 1080);
    DOM.btn720p?.classList.toggle('active', quality === 720);
    DOM.btn480p?.classList.toggle('active', quality === 480);

    showToast(`Calidad: ${quality}p`, 'success');
}

function switchMode(mode) {
    State.currentMode = mode;

    // Update tabs
    DOM.tabUrl?.classList.toggle('active', mode === 'url');
    DOM.tabSearch?.classList.toggle('active', mode === 'search');

    // Update content visibility
    DOM.modeUrl?.classList.toggle('hidden', mode !== 'url');
    DOM.modeSearch?.classList.toggle('hidden', mode !== 'search');

    // Focus appropriate input
    if (mode === 'url') {
        DOM.urlInput?.focus();
    } else {
        DOM.searchInput?.focus();
    }
}

async function handleSearch() {
    const query = DOM.searchInput?.value.trim();
    if (!query || query.length < 2) {
        showToast('Escribe al menos 2 caracteres', 'error');
        return;
    }

    // Show loading state
    DOM.searchEmpty.innerHTML = '<p>Buscando...</p>';
    DOM.searchEmpty?.classList.remove('hidden');
    DOM.resultsList.innerHTML = '';

    try {
        const result = await window.electronAPI.searchYouTube(query, 10);

        if (result.success && result.results.length > 0) {
            State.searchResults = result.results;
            renderSearchResults();
            showToast(`${result.results.length} resultados`, 'success');
        } else {
            DOM.searchEmpty.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <p>No se encontraron resultados</p>
            `;
        }
    } catch (err) {
        showToast('Error al buscar', 'error');
    }
}

function renderSearchResults() {
    const list = DOM.resultsList;
    if (!list) return;

    DOM.searchEmpty?.classList.add('hidden');

    list.innerHTML = State.searchResults.map(item => `
        <div class="result-item" data-url="${escapeHtml(item.url)}" data-title="${escapeHtml(item.title)}">
            <img class="result-thumb" src="${item.thumbnail}" alt="">
            <div class="result-info">
                <div class="result-title">${escapeHtml(item.title)}</div>
                <div class="result-meta">
                    <span>${item.channel}</span>
                    <span>•</span>
                    <span>${item.durationStr}</span>
                </div>
            </div>
            <div class="result-actions">
                <button class="result-btn play" title="Reproducir en YouTube">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                </button>
                <button class="result-btn download" title="Descargar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function openInBrowser(url) {
    window.electronAPI.openExternal?.(url) || window.open(url, '_blank');
}

async function downloadFromSearch(url, title) {
    // Switch to URL mode
    switchMode('url');

    // Set URL and trigger download
    DOM.urlInput.value = url;
    showToast(`Descargando: ${title.substring(0, 30)}...`, 'success');

    handleDownload();
}

function setupQueueListeners() {
    window.electronAPI.onQueueUpdate?.((data) => {
        State.downloads = data.queue || [];
        State.downloadFolder = data.downloadFolder || '';
        updateFolderDisplay();
        renderDownloads();
    });

    window.electronAPI.onQueueComplete?.(() => {
        State.isProcessing = false;
        showToast('¡Todas las descargas completadas!', 'success');
    });
}

// =========================================
// URL Input & Preview
// =========================================
async function handleUrlInput() {
    const url = DOM.urlInput.value.trim();

    if (!url) {
        hidePreview();
        return;
    }

    if (!isValidYouTubeUrl(url)) {
        hidePreview();
        return;
    }

    // Show loading state
    DOM.videoPreview.classList.remove('hidden');
    DOM.previewTitle.textContent = 'Cargando...';
    DOM.previewChannel.textContent = '';
    DOM.previewThumb.src = '';

    try {
        const result = await window.electronAPI.getYouTubeInfo(url);
        if (result.success && result.info) {
            State.currentPreview = result.info;
            DOM.previewThumb.src = result.info.thumbnail || '';
            DOM.previewTitle.textContent = result.info.title || 'Video';
            DOM.previewChannel.textContent = result.info.uploader || '';
        } else {
            DOM.previewTitle.textContent = 'Video de YouTube';
            DOM.previewChannel.textContent = 'Listo para descargar';
        }
    } catch (err) {
        DOM.previewTitle.textContent = 'Video de YouTube';
        DOM.previewChannel.textContent = 'Listo para descargar';
    }
}

function hidePreview() {
    DOM.videoPreview.classList.add('hidden');
    State.currentPreview = null;
}

// =========================================
// Download
// =========================================
async function handleDownload() {
    const url = DOM.urlInput.value.trim();

    if (!url) {
        showToast('Pega un link de YouTube', 'error');
        return;
    }

    if (!isValidYouTubeUrl(url)) {
        showToast('Link de YouTube inválido', 'error');
        return;
    }

    // Check if folder is selected
    if (!State.downloadFolder) {
        const selected = await handleSelectFolder();
        if (!selected) {
            showToast('Selecciona una carpeta primero', 'error');
            return;
        }
    }

    // Disable button temporarily
    setDownloadButtonLoading(true);

    try {
        // Add to queue using selected format (and quality for video)
        const quality = State.selectedFormat === 'mp4' ? State.selectedQuality : null;
        const result = await window.electronAPI.addToQueue(url, State.selectedFormat, quality);

        if (result.success) {
            // Clear input and preview
            DOM.urlInput.value = '';
            hidePreview();

            // Start processing if not already
            if (!State.isProcessing) {
                State.isProcessing = true;
                await window.electronAPI.startQueue();
            }

            showToast('Descarga iniciada', 'success');
        } else {
            showToast(result.message || 'Error al agregar', 'error');
        }
    } catch (err) {
        showToast('Error inesperado', 'error');
    } finally {
        setDownloadButtonLoading(false);
        DOM.urlInput.focus();
    }
}

async function handleSelectFolder() {
    try {
        const result = await window.electronAPI.setDownloadFolder();
        if (result.success) {
            State.downloadFolder = result.folder;
            updateFolderDisplay();
            return true;
        }
    } catch (err) {
        showToast('Error al seleccionar carpeta', 'error');
    }
    return false;
}

async function handleClearCompleted() {
    try {
        await window.electronAPI.clearQueue();
        showToast('Historial limpiado', 'success');
    } catch (err) {
        showToast('Error al limpiar', 'error');
    }
}

async function handleClearCache() {
    try {
        showToast('Limpiando cache...', 'success');
        const result = await window.electronAPI.clearCache();
        if (result.success) {
            showToast('Cache limpiado correctamente', 'success');
        } else {
            showToast(result.message || 'Error al limpiar cache', 'error');
        }
    } catch (err) {
        showToast('Error al limpiar cache', 'error');
    }
}

/**
 * Pega URL desde el portapapeles
 */
async function handlePasteFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
            DOM.urlInput.value = text.trim();
            handleUrlInput();
            showToast('URL pegada', 'success');
        } else {
            showToast('Portapapeles vacío', 'error');
        }
    } catch (err) {
        showToast('No se pudo acceder al portapapeles', 'error');
    }
}

/**
 * Abre la carpeta de descargas en el explorador
 */
async function handleOpenFolder() {
    if (!State.downloadFolder) {
        showToast('Selecciona una carpeta primero', 'error');
        return;
    }

    try {
        const result = await window.electronAPI.openFolder(State.downloadFolder);
        if (!result.success) {
            showToast(result.message || 'Error al abrir carpeta', 'error');
        }
    } catch (err) {
        showToast('Error al abrir carpeta', 'error');
    }
}

async function handleRemoveFromQueue(id) {
    try {
        await window.electronAPI.removeFromQueue(id);
    } catch (err) {
        showToast('Error al eliminar', 'error');
    }
}

// =========================================
// Render Downloads
// =========================================
function renderDownloads() {
    const list = DOM.downloadsList;
    const downloads = State.downloads;

    // Update download count
    if (DOM.downloadCount) {
        DOM.downloadCount.textContent = downloads.length > 0 ? downloads.length : '';
    }

    // Show/hide empty state
    if (downloads.length === 0) {
        DOM.emptyState.style.display = 'flex';
        list.querySelectorAll('.download-item').forEach(el => el.remove());
        return;
    }

    DOM.emptyState.style.display = 'none';

    // Update or create items
    downloads.forEach(item => {
        let el = list.querySelector(`.download-item[data-id="${item.id}"]`);

        if (!el) {
            el = createDownloadItem(item);
            list.appendChild(el);
        } else {
            updateDownloadItem(el, item);
        }
    });

    // Remove items not in list
    list.querySelectorAll('.download-item').forEach(el => {
        const id = parseInt(el.dataset.id);
        if (!downloads.find(d => d.id === id)) {
            el.remove();
        }
    });
}

function createDownloadItem(item) {
    const el = document.createElement('div');
    el.className = 'download-item';
    el.dataset.id = item.id;

    const canDelete = item.status !== 'downloading';

    el.innerHTML = `
        <div class="item-icon">
            ${item.status === 'completed'
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
            : item.status === 'error'
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
        }
        </div>
        <div class="item-info">
            <p class="item-title">${escapeHtml(item.title)}</p>
            <div class="item-status">
                ${item.status === 'downloading' || item.status === 'converting'
            ? `<div class="progress-bar ${item.status}"><div class="progress-fill" style="width: ${item.progress}%"></div></div>
                       <span class="progress-text">${item.progress}%</span>`
            : `<span class="status-text status-${item.status}">${getStatusText(item.status)}</span>`
        }
            </div>
        </div>
        ${canDelete ? `
        <button class="item-delete" data-id="${item.id}" title="Eliminar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
        ` : ''}
    `;

    return el;
}

function updateDownloadItem(el, item) {
    const icon = el.querySelector('.item-icon');
    const statusDiv = el.querySelector('.item-status');
    const titleEl = el.querySelector('.item-title');

    // Update title (important for when info loads in background)
    if (titleEl && titleEl.textContent !== item.title) {
        titleEl.textContent = item.title;
    }

    // Update icon
    if (item.status === 'completed') {
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        icon.className = 'item-icon completed';
    } else if (item.status === 'error') {
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        icon.className = 'item-icon error';
    } else if (item.status === 'downloading' || item.status === 'converting') {
        icon.className = 'item-icon downloading';
    }

    // Update status
    if (item.status === 'downloading' || item.status === 'converting') {
        statusDiv.innerHTML = `
            <div class="progress-bar ${item.status}"><div class="progress-fill" style="width: ${item.progress}%"></div></div>
            <span class="progress-text">${item.progress}%</span>
        `;
    } else {
        statusDiv.innerHTML = `<span class="status-text status-${item.status}">${getStatusText(item.status)}</span>`;
    }
}

// =========================================
// UI Helpers
// =========================================
function updateFolderDisplay() {
    if (State.downloadFolder) {
        const folderName = State.downloadFolder.split(/[/\\]/).pop();
        DOM.folderPath.textContent = folderName;
        DOM.folderPath.title = State.downloadFolder;
        DOM.folderRow.classList.add('selected');
    } else {
        DOM.folderPath.textContent = 'Seleccionar carpeta...';
        DOM.folderRow.classList.remove('selected');
    }
}

function setDownloadButtonLoading(loading) {
    DOM.btnDownload.disabled = loading;
    DOM.btnDownload.classList.toggle('loading', loading);
    const span = DOM.btnDownload.querySelector('span');
    span.textContent = loading ? 'Agregando...' : 'Descargar';
}

function showToast(message, type = 'success') {
    DOM.toastMessage.textContent = message;
    DOM.toast.className = `toast ${type} show`;
    setTimeout(() => DOM.toast.classList.remove('show'), 3000);
}

function getStatusText(status) {
    const texts = {
        pending: 'En cola',
        downloading: 'Descargando',
        converting: 'Convirtiendo',
        completed: 'Completado',
        error: 'Error'
    };
    return texts[status] || status;
}

function isValidYouTubeUrl(url) {
    const patterns = [
        /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtu\.be\/[\w-]+/,
        /^(https?:\/\/)?(www\.)?youtube\.com\/shorts\/[\w-]+/
    ];
    return patterns.some(p => p.test(url));
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

// =========================================
// Tutorial
// =========================================
let tutorialStep = 1;
const TUTORIAL_KEY = 'mediaConverterPro_tutorialDone';

function checkShowTutorial() {
    // Verificar si ya vio el tutorial
    const tutorialDone = localStorage.getItem(TUTORIAL_KEY);
    if (!tutorialDone) {
        setTimeout(showTutorial, 500); // Pequeño delay para cargar la UI
    }
}

function showTutorial() {
    tutorialStep = 1;
    updateTutorialStep();
    DOM.tutorialOverlay?.classList.add('show');
}

function closeTutorial() {
    DOM.tutorialOverlay?.classList.remove('show');

    // Guardar preferencia si marcó "no mostrar de nuevo"
    if (DOM.tutorialDontShow?.checked) {
        localStorage.setItem(TUTORIAL_KEY, 'true');
    }
}

function nextTutorialStep() {
    if (tutorialStep < 3) {
        tutorialStep++;
        updateTutorialStep();
    } else {
        // Último paso - guardar preferencia y cerrar
        localStorage.setItem(TUTORIAL_KEY, 'true');
        closeTutorial();
    }
}

function goToStep(step) {
    tutorialStep = step;
    updateTutorialStep();
}

function updateTutorialStep() {
    // Actualizar pasos
    document.querySelectorAll('.tutorial-step').forEach(el => {
        el.classList.remove('active');
        if (parseInt(el.dataset.step) === tutorialStep) {
            el.classList.add('active');
        }
    });

    // Actualizar dots
    document.querySelectorAll('.tutorial-dots .dot').forEach(el => {
        el.classList.remove('active');
        if (parseInt(el.dataset.step) === tutorialStep) {
            el.classList.add('active');
        }
    });

    // Actualizar texto del botón
    if (DOM.tutorialNext) {
        DOM.tutorialNext.textContent = tutorialStep === 3 ? '¡Comenzar!' : 'Siguiente';
    }
}

// Event listeners para tutorial
document.addEventListener('DOMContentLoaded', () => {
    DOM.tutorialNext?.addEventListener('click', nextTutorialStep);
    DOM.tutorialSkip?.addEventListener('click', closeTutorial);

    // Click en dots para navegar
    document.querySelectorAll('.tutorial-dots .dot').forEach(dot => {
        dot.addEventListener('click', () => {
            goToStep(parseInt(dot.dataset.step));
        });
    });
});

// =========================================
// Start
// =========================================
document.addEventListener('DOMContentLoaded', init);

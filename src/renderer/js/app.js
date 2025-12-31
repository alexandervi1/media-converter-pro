/**
 * Media Converter Pro - YouTube Downloader
 * 
 * @description Aplicación de escritorio para descargar audio y video de YouTube
 * @version 2.0.0
 * @author Media Converter Team
 * 
 * @module renderer/app
 */

'use strict';

// =========================================
// Imports
// =========================================
import { store } from './store/store.js';
import { DownloadList } from './components/DownloadList.js';
import { SearchComponent } from './components/SearchComponent.js';
import { SpotifyComponent } from './components/SpotifyComponent.js';
import { ToastComponent } from './components/Toast.js';
import { escapeHtml } from './utils/formatters.js';

// =========================================
// State - Estado centralizado (Proxy al Store)
// =========================================
const State = new Proxy({}, {
    get: (_, prop) => store.getState()[prop],
    set: (_, prop, value) => {
        store.setState({ [prop]: value });
        return true;
    }
});

// =========================================
// DOM Elements
// =========================================
const $ = (id) => document.getElementById(id);

const DOM = {
    // Mode tabs
    tabUrl: $('tab-url'),
    tabSearch: $('tab-search'),
    tabSpotify: $('tab-spotify'),
    tabDownloads: $('tab-downloads'),
    tabDownloadsBadge: $('tab-downloads-badge'),

    // Mode Panels
    modeUrl: $('mode-url'),
    modeSearch: $('mode-search'),
    modeSpotify: $('mode-spotify'),

    // Main Actions
    urlInput: $('url-input'),
    btnDownload: $('btn-download'),
    btnPaste: $('btn-paste'),

    // Folders
    folderPath: $('folder-path'),
    folderRow: $('folder-row'),
    btnFolder: $('btn-folder'),
    btnOpenFolder: $('btn-open-folder'),

    // Downloads Actions
    btnCache: $('btn-cache'),
    btnClear: $('btn-clear'),
    btnOpenFolder: $('btn-open-folder'),

    // Global UI
    btnMinimize: $('btn-minimize'),
    btnClose: $('btn-close'),
    flyingElement: $('flying-element'),

    // Toggles
    btnMp3: $('btn-mp3'),
    btnVideo: $('btn-video'),
    btnFast: $('btn-fast'),
    qualityToggle: $('quality-toggle'),

    // Spotify Toolbar (Synced)
    spotifyBtnMp3: $('spotify-btn-mp3'),
    spotifyBtnM4a: $('spotify-btn-m4a'),
    spotifyFolderName: $('spotify-folder-name'),
    spotifyFolderBtn: $('spotify-folder-btn'),

    // Search Toolbar (Synced)
    searchBtnMp3: $('search-btn-mp3'),
    searchBtnM4a: $('search-btn-m4a'),
    searchBtnVideo: $('search-btn-video'),
    searchFolderName: $('search-folder-name'),
    searchFolderBtn: $('search-folder-btn'),

    // Tutorial
    tutorialOverlay: $('tutorial-overlay'),
    tutorialNext: $('tutorial-next'),
    tutorialSkip: $('tutorial-skip'),
    tutorialDontShow: $('tutorial-dont-show'),

    // Toasts (Legacy fallback)
    toast: $('toast'),
    toastMessage: $('toast-message')
};

// =========================================
// Initialize
// =========================================
async function init() {
    // Set initial body class
    document.body.className = 'mode-url';

    // Initialize components
    new ToastComponent();
    new DownloadList('downloads-list', window.electronAPI);
    new SearchComponent(window.electronAPI);
    new SpotifyComponent(window.electronAPI);

    setupEventListeners();
    await loadInitialState();
    setupQueueListeners();

    // Check Tutorial
    checkShowTutorial();
}

async function loadInitialState() {
    try {
        const [queueResult, settings] = await Promise.all([
            window.electronAPI.getQueue(),
            window.electronAPI.getSettings()
        ]);

        State.downloads = queueResult.queue || [];

        if (settings) {
            State.downloadFolder = settings.downloadFolder || '';
            const savedFormat = settings.format || 'mp3';
            if (savedFormat !== State.selectedFormat) {
                setToolbarFormat(null, savedFormat, false); // false = no toast
            }
        } else {
            State.downloadFolder = queueResult.downloadFolder || '';
        }

        if (State.downloadFolder) {
            updateFolderDisplay();
        }

        updateDownloadsBadge();
    } catch (err) {
        console.error('Error loading initial state:', err);
    }
}

// =========================================
// Event Listeners
// =========================================
function setupEventListeners() {
    // 1. Window Controls
    DOM.btnMinimize?.addEventListener('click', () => window.electronAPI.minimizeWindow());
    DOM.btnClose?.addEventListener('click', () => window.electronAPI.closeWindow());

    // 2. Navigation
    DOM.tabUrl?.addEventListener('click', () => switchMode('url'));
    DOM.tabSearch?.addEventListener('click', () => switchMode('search'));
    DOM.tabSpotify?.addEventListener('click', () => switchMode('spotify'));
    DOM.tabDownloads?.addEventListener('click', () => switchMode('downloads'));

    // 3. Home Tab Actions
    DOM.btnDownload?.addEventListener('click', handleMainDownload);
    DOM.btnPaste?.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (DOM.urlInput) DOM.urlInput.value = text;
            window.showToast('Pegado desde portapapeles');
        } catch (e) {
            console.error(e);
        }
    });

    DOM.urlInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleMainDownload();
    });

    // 3. Format & Options
    DOM.btnFast?.addEventListener('click', () => setToolbarFormat(DOM.btnFast, 'm4a'));
    DOM.btnMp3?.addEventListener('click', () => setToolbarFormat(DOM.btnMp3, 'mp3'));
    DOM.btnVideo?.addEventListener('click', () => setToolbarFormat(DOM.btnVideo, 'mp4'));

    // 4. Downloads Tab Actions
    DOM.btnCache?.addEventListener('click', async () => {
        const res = await window.electronAPI.clearCache();
        if (res.success) window.showToast('Cache limpiado', 'success');
    });

    DOM.btnClear?.addEventListener('click', async () => {
        const res = await window.electronAPI.clearQueue();
        if (res.success) window.showToast('Historial limpiado', 'success');
    });

    // 5. Folder Actions (Home)
    DOM.btnFolder?.addEventListener('click', selectFolder);
    DOM.folderRow?.addEventListener('click', selectFolder);
    DOM.btnOpenFolder?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (State.downloadFolder) window.electronAPI.openFolder(State.downloadFolder);
    });

    // 6. Global "Request Download" (from Components)
    document.addEventListener('request-download', (e) => {
        const { url, title } = e.detail;
        downloadFromUrl(url, title);
    });
}

// =========================================
// Logic: Main Download (Home Tab)
// =========================================
async function handleMainDownload() {
    const url = DOM.urlInput?.value.trim();
    if (!url) return;

    if (!isValidYouTubeUrl(url)) {
        window.showToast('URL no válida', 'error');
        return;
    }

    await downloadFromUrl(url);
}

async function downloadFromUrl(url, titleOverride = null) {
    if (!State.downloadFolder) {
        window.showToast('Selecciona una carpeta de destino', 'error');
        return;
    }

    const format = State.selectedFormat || 'mp3';

    // Animation
    flyToDownloads(document.activeElement || DOM.btnDownload);

    try {
        const result = await window.electronAPI.addToQueue(url, format, 'best');
        if (result.success) {
            window.showToast('Añadido a la cola', 'success');
            if (DOM.urlInput) DOM.urlInput.value = '';

            // Auto start queue
            window.electronAPI.startQueue();
        } else {
            window.showToast(result.message || 'Error al añadir', 'error');
        }
    } catch (e) {
        window.showToast('Error de conexión', 'error');
    }
}

// =========================================
// Logic: Folder & Settings
// =========================================
async function selectFolder() {
    const result = await window.electronAPI.setDownloadFolder();
    if (result.success && result.folder) {
        State.downloadFolder = result.folder;
        window.electronAPI.saveSettings({ downloadFolder: result.folder });
        updateFolderDisplay();
    }
}

function updateFolderDisplay() {
    const folderName = State.downloadFolder
        ? State.downloadFolder.split(/[/\\]/).pop()
        : 'Carpeta...';

    // Update main folder row
    if (DOM.folderPath) {
        DOM.folderPath.textContent = State.downloadFolder ? folderName : 'Seleccionar carpeta...';
        DOM.folderPath.title = State.downloadFolder || '';
    }
    if (DOM.folderRow) {
        DOM.folderRow.classList.toggle('selected', !!State.downloadFolder);
    }

    // Update Spotify toolbar folder
    if (DOM.spotifyFolderName) {
        DOM.spotifyFolderName.textContent = folderName;
    }
    if (DOM.spotifyFolderBtn) {
        DOM.spotifyFolderBtn.classList.toggle('selected', !!State.downloadFolder);
        DOM.spotifyFolderBtn.title = State.downloadFolder || 'Seleccionar carpeta';
    }

    // Update Search toolbar folder
    if (DOM.searchFolderName) {
        DOM.searchFolderName.textContent = folderName;
    }
    if (DOM.searchFolderBtn) {
        DOM.searchFolderBtn.classList.toggle('selected', !!State.downloadFolder);
        DOM.searchFolderBtn.title = State.downloadFolder || 'Seleccionar carpeta';
    }
}

function setToolbarFormat(source, format, showNotification = true) {
    State.selectedFormat = format;
    window.electronAPI.saveSettings({ format });

    // Update main
    DOM.btnFast?.classList.toggle('active', format === 'm4a');
    DOM.btnMp3?.classList.toggle('active', format === 'mp3');
    DOM.btnVideo?.classList.toggle('active', format === 'mp4');
    DOM.qualityToggle?.classList.toggle('hidden', format !== 'mp4');

    // Update Spotify
    DOM.spotifyBtnMp3?.classList.toggle('active', format === 'mp3');
    DOM.spotifyBtnM4a?.classList.toggle('active', format === 'm4a');

    // Update Search
    DOM.searchBtnMp3?.classList.toggle('active', format === 'mp3');
    DOM.searchBtnM4a?.classList.toggle('active', format === 'm4a');
    DOM.searchBtnVideo?.classList.toggle('active', format === 'mp4');

    if (showNotification) {
        const messages = {
            'm4a': 'AAC Rápido',
            'mp3': 'MP3 320kbps',
            'mp4': 'Video MP4'
        };
        window.showToast(messages[format] || format, 'success');
    }
}

// =========================================
// Logic: Navigation & Animation
// =========================================
function switchMode(mode) {
    document.body.className = `mode-${mode}`;

    // 1. Update Tabs
    [DOM.tabUrl, DOM.tabSearch, DOM.tabSpotify, DOM.tabDownloads].forEach(el =>
        el?.classList.remove('active')
    );

    if (mode === 'url') DOM.tabUrl?.classList.add('active');
    if (mode === 'search') DOM.tabSearch?.classList.add('active');
    if (mode === 'spotify') DOM.tabSpotify?.classList.add('active');
    if (mode === 'downloads') DOM.tabDownloads?.classList.add('active');

    // 2. Update Content Visibility
    // Hide all first
    [DOM.modeUrl, DOM.modeSearch, DOM.modeSpotify].forEach(el => el?.classList.add('hidden'));

    // Show active
    if (mode === 'url') DOM.modeUrl?.classList.remove('hidden');
    if (mode === 'search') DOM.modeSearch?.classList.remove('hidden');
    if (mode === 'spotify') DOM.modeSpotify?.classList.remove('hidden');
    // Note: 'downloads' mode visibility is handled by CSS body class .mode-downloads > .downloads-section
}

function flyToDownloads(sourceEl) {
    if (!sourceEl || !DOM.flyingElement || !DOM.tabDownloads) return;

    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = DOM.tabDownloads.getBoundingClientRect();

    DOM.flyingElement.style.display = 'block';
    DOM.flyingElement.classList.remove('flying');
    void DOM.flyingElement.offsetWidth; // Trigger reflow
    DOM.flyingElement.classList.add('flying');

    DOM.flyingElement.animate([
        {
            left: `${sourceRect.left + sourceRect.width / 2}px`,
            top: `${sourceRect.top + sourceRect.height / 2}px`,
            opacity: 1,
            transform: 'scale(1)'
        },
        {
            left: `${targetRect.left + targetRect.width / 2}px`,
            top: `${targetRect.top + targetRect.height / 2}px`,
            opacity: 0,
            transform: 'scale(0.2)'
        }
    ], {
        duration: 600,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
    }).onfinish = () => {
        DOM.flyingElement.style.display = 'none';
    };

    // Update badge after animation
    setTimeout(updateDownloadsBadge, 500);
}

function updateDownloadsBadge() {
    const queue = State.downloads || [];
    const activeCount = queue.filter(d =>
        d.status === 'downloading' || d.status === 'converting' || d.status === 'pending'
    ).length;

    if (DOM.tabDownloadsBadge) {
        DOM.tabDownloadsBadge.textContent = activeCount > 0 ? activeCount : '';
        DOM.tabDownloadsBadge.classList.toggle('hidden', activeCount === 0);

        if (activeCount > 0) {
            DOM.tabDownloadsBadge.classList.remove('pulse');
            void DOM.tabDownloadsBadge.offsetWidth;
            DOM.tabDownloadsBadge.classList.add('pulse');
        }
    }
}

function setupQueueListeners() {
    window.electronAPI.onQueueUpdate((data) => {
        // Only update if array is new to avoid loops, though proxy handles it
        State.downloads = data.queue;
        if (data.downloadFolder) State.downloadFolder = data.downloadFolder;

        updateFolderDisplay();
        updateDownloadsBadge();
    });

    window.electronAPI.onQueueComplete(() => {
        window.showToast('Descargas completadas', 'success');
    });
}

function isValidYouTubeUrl(url) {
    return /youtube\.com|youtu\.be/.test(url);
}

// =========================================
// Tutorial
// =========================================
let tutorialStep = 1;
const TUTORIAL_KEY = 'mediaConverterPro_tutorialDone_v2';

function checkShowTutorial() {
    if (!localStorage.getItem(TUTORIAL_KEY)) setTimeout(showTutorial, 500);
}

function showTutorial() {
    tutorialStep = 1;
    updateTutorialStep();
    DOM.tutorialOverlay?.classList.add('show');

    // Bind tutorial events
    DOM.tutorialNext?.addEventListener('click', nextTutorialStep);
    DOM.tutorialSkip?.addEventListener('click', closeTutorial);

    // Bind Step 5 Folder Select
    const btnSelect = document.getElementById('tutorial-select-folder');
    const pathDisplay = document.getElementById('tutorial-folder-path');

    if (btnSelect) {
        btnSelect.onclick = async () => {
            const result = await window.electronAPI.setDownloadFolder();
            if (result && !result.canceled && result.filePaths.length > 0) {
                const path = result.filePaths[0];
                if (pathDisplay) {
                    pathDisplay.textContent = path;
                    pathDisplay.style.color = 'var(--success)';
                }
                // Update State and Storage immediately
                State.downloadFolder = path;
                await window.electronAPI.saveSettings({ downloadFolder: path });
            }
        };
    }
}

function closeTutorial() {
    DOM.tutorialOverlay?.classList.remove('show');
    if (DOM.tutorialDontShow?.checked) localStorage.setItem(TUTORIAL_KEY, 'true');
}

function nextTutorialStep() {
    if (tutorialStep < 5) {
        tutorialStep++;
        updateTutorialStep();
    } else {
        localStorage.setItem(TUTORIAL_KEY, 'true');
        closeTutorial();
    }
}

function updateTutorialStep() {
    document.querySelectorAll('.tutorial-step').forEach(el => {
        el.classList.remove('active');
        if (parseInt(el.dataset.step) === tutorialStep) el.classList.add('active');
    });

    if (DOM.tutorialNext) DOM.tutorialNext.textContent = tutorialStep === 5 ? 'Finalizar' : 'Siguiente';
}

function goToStep(step) {
    tutorialStep = step;
    updateTutorialStep();
}

// Click en dots para navegar
document.addEventListener('DOMContentLoaded', () => {
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

// Helper for other components if they use window.showToast
window.showToast = function (msg, type) {
    // If ToastComponent is initialized, it replaces this. 
    // If not, we fall back to console or DOM direct access if available.
    if (DOM.toast && DOM.toastMessage) {
        DOM.toastMessage.textContent = msg;
        DOM.toast.className = `toast ${type} show`;
        setTimeout(() => DOM.toast.classList.remove('show'), 3000);
    } else {
        console.log(`[Toast ${type}] ${msg}`);
    }
}

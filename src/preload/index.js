'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * API expuesta al renderer de forma segura
 */
const electronAPI = {
    // =====================================
    // YouTube - Cola de Descargas
    // =====================================

    /**
     * Agrega una URL a la cola de descargas
     */
    addToQueue: (url, format = 'mp3', quality = null) =>
        ipcRenderer.invoke('youtube:add-to-queue', { url, format, quality }),

    /**
     * Obtiene la cola actual
     */
    getQueue: () => ipcRenderer.invoke('youtube:get-queue'),

    /**
     * Limpia la cola (excepto items en progreso)
     */
    clearQueue: () => ipcRenderer.invoke('youtube:clear-queue'),

    /**
     * Remueve un item de la cola
     */
    removeFromQueue: (id) => ipcRenderer.invoke('youtube:remove-from-queue', { id }),

    /**
     * Inicia el procesamiento de la cola
     */
    startQueue: () => ipcRenderer.invoke('youtube:start-queue'),

    /**
     * Obtiene información de un video de YouTube
     */
    getYouTubeInfo: (url) => ipcRenderer.invoke('youtube:get-info', { url }),

    /**
     * Verifica si yt-dlp está listo
     */
    checkReady: () => ipcRenderer.invoke('youtube:check-ready'),

    /**
     * Selecciona carpeta de descargas
     */
    setDownloadFolder: () => ipcRenderer.invoke('youtube:set-download-folder'),

    /**
     * Limpia el cache de yt-dlp
     */
    clearCache: () => ipcRenderer.invoke('youtube:clear-cache'),

    /**
     * Busca videos en YouTube
     */
    searchYouTube: (query, limit = 10) => ipcRenderer.invoke('youtube:search', { query, limit }),

    /**
     * Escucha actualizaciones de la cola
     */
    onQueueUpdate: (callback) =>
        ipcRenderer.on('youtube:queue-update', (_, data) => callback(data)),

    /**
     * Escucha cuando la cola termina
     */
    onQueueComplete: (callback) =>
        ipcRenderer.on('youtube:queue-complete', () => callback()),

    // =====================================
    // Converter
    // =====================================

    convertFile: (inputPath, targetFormat) =>
        ipcRenderer.invoke('converter:convert', { inputPath, targetFormat }),

    getMetadata: (filePath) =>
        ipcRenderer.invoke('converter:get-metadata', { filePath }),

    onConversionProgress: (callback) =>
        ipcRenderer.on('converter:progress', (_, data) => callback(data)),

    // =====================================
    // Files
    // =====================================

    selectFile: (type = 'all') =>
        ipcRenderer.invoke('files:select', { type }),

    selectMultipleFiles: (type = 'all') =>
        ipcRenderer.invoke('files:select-multiple', { type }),

    getFileInfo: (filePath) =>
        ipcRenderer.invoke('files:get-info', { filePath }),

    openFolder: (folderPath) =>
        ipcRenderer.invoke('files:open-folder', { folderPath }),

    // =====================================
    // Clipboard & External
    // =====================================

    readClipboard: () => {
        const { clipboard } = require('electron');
        return clipboard.readText();
    },

    openExternal: (url) => {
        const { shell } = require('electron');
        shell.openExternal(url);
    },

    // =====================================
    // Window Controls
    // =====================================

    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    closeWindow: () => ipcRenderer.invoke('window:close'),

    // =====================================
    // Spotify
    // =====================================

    /**
     * Parsea una playlist de Spotify
     */
    parseSpotifyPlaylist: (url) =>
        ipcRenderer.invoke('spotify:parse-playlist', { url }),

    /**
     * Descarga canciones de una playlist de Spotify
     */
    downloadSpotifyPlaylist: (tracks, format = 'mp3', folder = null) =>
        ipcRenderer.invoke('spotify:download-playlist', { tracks, format, folder }),

    /**
     * Cancela las descargas de Spotify pendientes
     */
    cancelSpotifyDownload: () =>
        ipcRenderer.invoke('spotify:cancel'),

    /**
     * Escucha progreso de descargas de Spotify
     */
    onSpotifyProgress: (callback) =>
        ipcRenderer.on('spotify:progress', (_, data) => callback(data)),

    /**
     * Escucha cuando termina la descarga de Spotify
     */
    onSpotifyComplete: (callback) =>
        ipcRenderer.on('spotify:complete', (_, data) => callback(data)),

    // =====================================
    // Settings
    // =====================================
    getSettings: () => ipcRenderer.invoke('settings:get'),
    saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings)
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

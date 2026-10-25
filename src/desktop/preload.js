'use strict';

const { contextBridge, ipcRenderer, clipboard } = require('electron');

/**
 * Puente mínimo: solo capacidades nativas que HTTP no puede cubrir.
 * Toda la lógica de la app viaja por la API HTTP local.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // Controles de ventana (titlebar custom)
    minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
    maximizeWindow: () => ipcRenderer.invoke('window:maximize-toggle'),
    closeWindow: () => ipcRenderer.invoke('window:close'),
    onWindowMaximized: (callback) =>
        ipcRenderer.on('window:maximized', (_, maximized) => callback(maximized)),

    // Portapapeles (fallback si el navegador lo restringe)
    readClipboard: () => clipboard.readText(),

    // Servidor LAN (emparejamiento con el teléfono)
    getLanInfo: () => ipcRenderer.invoke('app:get-lan'),
    setLanEnabled: (enabled) => ipcRenderer.invoke('app:set-lan', { enabled }),

    // Navegador FLAC integrado
    openFlacView: () => ipcRenderer.invoke('flac:open-view'),
    openFlacExternal: () => ipcRenderer.invoke('flac:open-external')
});

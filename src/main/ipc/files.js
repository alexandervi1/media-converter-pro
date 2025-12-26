'use strict';

const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { getMainWindow } = require('../window');

/**
 * Extensiones permitidas para selección de archivos
 */
const ALLOWED_EXTENSIONS = {
    video: ['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm'],
    audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'],
    all: ['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']
};

/**
 * Registra los handlers IPC para selección de archivos
 */
function registerFileHandlers() {
    ipcMain.handle('files:select', handleSelectFile);
    ipcMain.handle('files:select-multiple', handleSelectMultipleFiles);
    ipcMain.handle('files:get-info', handleGetFileInfo);
    ipcMain.handle('files:open-folder', handleOpenFolder);
    ipcMain.handle('window:minimize', handleMinimize);
    ipcMain.handle('window:close', handleClose);
    logger.info('Handlers de archivos registrados');
}

/**
 * Maneja la selección de un archivo
 * @param {Electron.IpcMainInvokeEvent} event 
 * @param {Object} params
 * @param {string} params.type Tipo de archivo (video, audio, all)
 * @returns {Promise<{success: boolean, path?: string, name?: string}>}
 */
async function handleSelectFile(event, { type = 'all' } = {}) {
    const mainWindow = getMainWindow();
    const extensions = ALLOWED_EXTENSIONS[type] || ALLOWED_EXTENSIONS.all;

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar archivo',
        properties: ['openFile'],
        filters: [
            { name: 'Archivos multimedia', extensions }
        ]
    });

    if (canceled || filePaths.length === 0) {
        return { success: false };
    }

    const filePath = filePaths[0];
    const fileName = path.basename(filePath);

    logger.info(`Archivo seleccionado: ${fileName}`);

    return {
        success: true,
        path: filePath,
        name: fileName
    };
}

/**
 * Maneja la selección de múltiples archivos
 * @param {Electron.IpcMainInvokeEvent} event 
 * @param {Object} params
 * @param {string} params.type Tipo de archivo
 * @returns {Promise<{success: boolean, files?: Array}>}
 */
async function handleSelectMultipleFiles(event, { type = 'all' } = {}) {
    const mainWindow = getMainWindow();
    const extensions = ALLOWED_EXTENSIONS[type] || ALLOWED_EXTENSIONS.all;

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar archivos',
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Archivos multimedia', extensions }
        ]
    });

    if (canceled || filePaths.length === 0) {
        return { success: false };
    }

    const files = filePaths.map(fp => ({
        path: fp,
        name: path.basename(fp)
    }));

    logger.info(`${files.length} archivo(s) seleccionado(s)`);

    return {
        success: true,
        files
    };
}

/**
 * Obtiene información básica de un archivo
 * @param {Electron.IpcMainInvokeEvent} event 
 * @param {Object} params
 * @param {string} params.filePath Ruta del archivo
 * @returns {Promise<{success: boolean, info?: Object}>}
 */
async function handleGetFileInfo(event, { filePath }) {
    try {
        const stats = fs.statSync(filePath);
        const ext = path.extname(filePath).slice(1).toLowerCase();

        return {
            success: true,
            info: {
                name: path.basename(filePath),
                size: stats.size,
                sizeFormatted: formatFileSize(stats.size),
                extension: ext,
                isVideo: ALLOWED_EXTENSIONS.video.includes(ext),
                isAudio: ALLOWED_EXTENSIONS.audio.includes(ext),
                modifiedAt: stats.mtime
            }
        };
    } catch (error) {
        logger.error('Error obteniendo info de archivo:', error.message);
        return { success: false };
    }
}

/**
 * Minimiza la ventana
 */
async function handleMinimize() {
    const mainWindow = getMainWindow();
    if (mainWindow) {
        mainWindow.minimize();
    }
}

/**
 * Cierra la ventana
 */
async function handleClose() {
    const mainWindow = getMainWindow();
    if (mainWindow) {
        mainWindow.close();
    }
}

/**
 * Abre una carpeta en el explorador de archivos
 * @param {Electron.IpcMainInvokeEvent} event 
 * @param {Object} params
 * @param {string} params.folderPath Ruta de la carpeta
 */
async function handleOpenFolder(event, { folderPath }) {
    const { shell } = require('electron');

    if (!folderPath || !fs.existsSync(folderPath)) {
        logger.warn('Carpeta no encontrada:', folderPath);
        return { success: false, message: 'Carpeta no encontrada' };
    }

    try {
        await shell.openPath(folderPath);
        logger.info('Carpeta abierta:', folderPath);
        return { success: true };
    } catch (error) {
        logger.error('Error abriendo carpeta:', error.message);
        return { success: false, message: 'Error al abrir carpeta' };
    }
}

/**
 * Formatea el tamaño de archivo en formato legible
 * @param {number} bytes 
 * @returns {string}
 */
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { registerFileHandlers };

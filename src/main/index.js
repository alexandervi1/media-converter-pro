'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createMainWindow, getMainWindow } = require('./window');
const { registerYouTubeHandlers } = require('./ipc/youtube');
const { registerConverterHandlers } = require('./ipc/converter');
const { registerFileHandlers } = require('./ipc/files');
const logger = require('./utils/logger');

// Configurar FFmpeg path globalmente - diferente en desarrollo vs producción
const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

/**
 * Inicializa la aplicación y sus handlers
 */
async function initializeApp() {
    logger.info('Inicializando Media Converter Pro...');

    // Registrar todos los handlers IPC
    registerYouTubeHandlers();
    registerConverterHandlers();
    registerFileHandlers();

    // Crear la ventana principal
    createMainWindow();

    logger.info('Aplicación iniciada correctamente');
}

// Evento: App lista
app.whenReady().then(initializeApp);

// Evento: Todas las ventanas cerradas
app.on('window-all-closed', () => {
    logger.info('Cerrando aplicación...');
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Evento: Activar (macOS)
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
    logger.error('Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Promesa rechazada no manejada:', reason);
});

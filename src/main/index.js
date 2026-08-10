'use strict';

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { createMainWindow } = require('./window');
const { registerYouTubeHandlers } = require('./ipc/youtube');
const { registerConverterHandlers } = require('./ipc/converter');
const { registerFileHandlers } = require('./ipc/files');
const { registerSpotifyHandlers } = require('./ipc/spotify');
const DownloadService = require('./services/DownloadService');
const logger = require('./utils/logger');

// Desactivar flags de GPU Shader Cache para evitar 'Acceso denegado (0x5) GPU Cache Creation failed' en Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

// Configurar FFmpeg path globalmente
const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : require('ffmpeg-static');
process.env.FFMPEG_PATH = ffmpegPath;

/**
 * Inicializa la aplicación y sus handlers
 */
async function initializeApp() {
    logger.info('Inicializando Media Converter Pro...');

    registerYouTubeHandlers();
    registerConverterHandlers();
    registerFileHandlers();
    registerSpotifyHandlers();

    createMainWindow();

    logger.info('Aplicación iniciada correctamente');
}

app.whenReady().then(initializeApp);

// Cancelar subprocesos activos y salir al cerrar todas las ventanas
app.on('window-all-closed', () => {
    logger.info('Todas las ventanas cerradas. Limpiando procesos...');
    DownloadService.cancelAll();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    DownloadService.cancelAll();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

process.on('uncaughtException', (error) => {
    logger.error('Error no capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Promesa rechazada no manejada:', reason);
});

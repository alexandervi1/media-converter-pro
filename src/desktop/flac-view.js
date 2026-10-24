'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../core/utils/logger');

const FLAC_SITE_URL = 'https://flacdownloader.com/';
let flacWindow = null;

/**
 * Ventana Chromium integrada para navegar el buscador FLAC.
 * El usuario navega y descarga manualmente; la app solo enruta
 * los archivos hacia la carpeta flac/ organizada del core.
 */
function openFlacView(core) {
    if (flacWindow && !flacWindow.isDestroyed()) {
        flacWindow.focus();
        return { success: true, reused: true, window: flacWindow };
    }

    flacWindow = new BrowserWindow({
        width: 1100,
        height: 820,
        title: 'FLAC Downloader',
        autoHideMenuBar: true,
        backgroundColor: '#0a1220',
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    flacWindow.loadURL(FLAC_SITE_URL);
    attachFlacDownloadHandler(core, flacWindow);
    logger.info(`Ventana FLAC abierta: ${FLAC_SITE_URL}`);

    flacWindow.on('closed', () => {
        flacWindow = null;
    });
    return { success: true, reused: false, window: flacWindow };
}

/**
 * Enruta las descargas de la ventana FLAC hacia la carpeta flac/.
 */
function attachFlacDownloadHandler(core, win) {
    win.webContents.session.on('will-download', (event, item) => {
        try {
            const tempPath = path.join(
                require('electron').app.getPath('temp'),
                `flac-${Date.now()}-${item.getFilename()}`
            );
            item.setSavePath(tempPath);
            item.once('done', (e, state) => {
                if (state === 'completed' && fs.existsSync(tempPath)) {
                    core.organizeIncomingFile(tempPath, item.getFilename());
                } else if (state === 'interrupted') {
                    logger.warn(`Descarga FLAC interrumpida: ${item.getFilename()}`);
                }
            });
        } catch (e) {
            logger.error('Error enrutando descarga FLAC:', e.message);
        }
    });
}

module.exports = { openFlacView, attachFlacDownloadHandler, FLAC_SITE_URL };

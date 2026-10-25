'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../core/utils/logger');

const FLAC_SITE_URL = 'https://flacdownloader.com/';
const FLAC_PARTITION = 'persist:flac';

let flacWindow = null;

/**
 * Interceptor a nivel de sesión: cualquier descarga hecha desde el webview
 * embebido o desde la ventana aparte (partición persist:flac) se guarda en
 * temp y luego el core la organiza en <descargas>/flac/. El usuario navega
 * y descarga manualmente; la app solo ordena el resultado.
 */
function attachFlacDownloadHandler(core, flacSession) {
    flacSession.on('will-download', (event, item) => {
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
    logger.info('Interceptor de descargas FLAC activo (sesión persist:flac)');
}

/**
 * Ventana aparte opcional para el buscador FLAC (misma partición de sesión,
 * así sus descargas también pasan por el interceptor).
 */
function openFlacView(core, flacSession) {
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
            nodeIntegration: false,
            partition: FLAC_PARTITION
        }
    });
    flacWindow.loadURL(FLAC_SITE_URL);
    logger.info(`Ventana FLAC abierta: ${FLAC_SITE_URL}`);

    flacWindow.on('closed', () => {
        flacWindow = null;
    });
    return { success: true, reused: false, window: flacWindow };
}

module.exports = {
    openFlacView,
    attachFlacDownloadHandler,
    FLAC_SITE_URL,
    FLAC_PARTITION
};

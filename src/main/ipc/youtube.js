'use strict';

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { getMainWindow } = require('../window');
const { loadConfig, saveConfig } = require('../utils/config');
const { parseCleanMetadata, sanitizeFileName } = require('../utils/validators');

// Services
const QueueService = require('../services/QueueService');
const DownloadService = require('../services/DownloadService');

// Configuración inicial
let config = loadConfig();
let downloadFolder = config.downloadFolder || app.getPath('downloads');

/**
 * Controller: YouTubeController
 * Orquestador entre QueueService, DownloadService y la UI.
 */
function registerYouTubeHandlers() {
    ipcMain.handle('youtube:add-to-queue', handleAddToQueue);
    ipcMain.handle('youtube:get-queue', handleGetQueue);
    ipcMain.handle('youtube:clear-queue', handleClearQueue);
    ipcMain.handle('youtube:remove-from-queue', handleRemoveFromQueue);
    ipcMain.handle('youtube:start-queue', handleStartQueue);
    ipcMain.handle('youtube:get-info', handleGetVideoInfo);
    ipcMain.handle('youtube:check-ready', checkReady);
    ipcMain.handle('youtube:set-download-folder', handleSetDownloadFolder);
    ipcMain.handle('youtube:clear-cache', handleClearCache);
    ipcMain.handle('youtube:search', handleSearch);
    ipcMain.handle('settings:save', handleSaveSettings);
    ipcMain.handle('settings:get', () => config);

    DownloadService.initialize();

    logger.info('Handlers de YouTube registrados (Architecture: Controller-Service)');
}

// ==========================================
// Handlers IPC
// ==========================================

async function handleSetDownloadFolder() {
    const mainWindow = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de descargas',
        defaultPath: downloadFolder,
        properties: ['openDirectory']
    });

    if (!canceled && filePaths.length > 0) {
        downloadFolder = filePaths[0];
        saveConfig({ downloadFolder });
        return { success: true, folder: downloadFolder };
    }
    return { success: false };
}

async function handleSaveSettings(event, newSettings) {
    const updated = saveConfig(newSettings);
    if (updated) {
        config = updated;
        if (updated.downloadFolder) {
            downloadFolder = updated.downloadFolder;
        }
        return { success: true };
    }
    return { success: false };
}

async function handleAddToQueue(event, { url, format = 'mp3', quality = null, options = {} }) {
    if (!url || (!url.includes('youtube') && !url.includes('youtu.be'))) {
        return { success: false, message: 'URL de YouTube inválida' };
    }

    const item = QueueService.add({
        url,
        format,
        quality,
        embedMetadata: options?.embedMetadata !== false
    });
    sendQueueUpdate();

    logger.info(`Añadido a cola: ID ${item.id}`);

    // Obtener metadata en segundo plano
    const infoPromise = DownloadService.getVideoInfo(url).then((info) => {
        if (info) {
            const cleanMeta = parseCleanMetadata(info.title, info.uploader);
            QueueService.updateItem(item.id, {
                title: cleanMeta.title,
                thumbnail: info.thumbnail,
                duration: info.duration,
                metadata: {
                    title: cleanMeta.title,
                    artist: cleanMeta.artist,
                    album: 'Media Converter Pro',
                    comment: info.url || '',
                    thumbnailUrl: info.thumbnail || null
                }
            });
            sendQueueUpdate();
        }
        return info;
    });

    QueueService.setInfoPromise(item.id, infoPromise);

    return { success: true, item };
}

async function handleGetQueue() {
    return { queue: QueueService.getAll(), downloadFolder };
}

async function handleClearQueue() {
    QueueService.clearCompleted();
    sendQueueUpdate();
    return { success: true };
}

async function handleRemoveFromQueue(event, { id }) {
    DownloadService.cancelDownload(id);
    QueueService.remove(id);
    sendQueueUpdate();
    return { success: true };
}

async function handleStartQueue() {
    if (QueueService.getProcessing()) {
        return { success: false, message: 'Ya hay una descarga en proceso' };
    }

    processQueueLoop();
    return { success: true };
}

async function handleGetVideoInfo(event, { url }) {
    const info = await DownloadService.getVideoInfo(url);
    if (info) {
        return { success: true, info };
    }
    return { success: false, message: 'No se pudo obtener información' };
}

async function checkReady() {
    const ready = fs.existsSync(DownloadService.ytDlpPath);
    return { ready, downloadFolder };
}

async function handleClearCache() {
    await DownloadService.clearCache();
    return { success: true, message: 'Cache limpiado' };
}

async function handleSearch(event, { query, limit = 15, type = 'all' }) {
    const results = await DownloadService.search(query, limit, type);
    return { success: true, results };
}

// ==========================================
// Lógica de Orquestación
// ==========================================

async function processQueueLoop() {
    if (QueueService.getProcessing()) {
        return;
    }

    const pending = QueueService.getPending();
    if (pending.length === 0) {
        logger.info('Cola vacía');
        return;
    }

    QueueService.setProcessing(true);

    for (;;) {
        const nextItem = QueueService.getPending()[0];
        if (!nextItem) {
            break;
        }

        await processSingleItem(nextItem);
    }

    QueueService.setProcessing(false);

    const mainWindow = getMainWindow();
    if (mainWindow) {
        mainWindow.webContents.send('youtube:queue-complete');
    }
}

async function processSingleItem(item) {
    try {
        if (!item.url && (item.searchQuery || (item.artist && item.name))) {
            QueueService.updateItem(item.id, { status: 'searching' });
            sendQueueUpdate();

            const query = item.searchQuery || `${item.artist} - ${item.name} audio`;
            logger.info(`Resolviendo URL para item ${item.id}. Query: "${query}"`);

            try {
                const results = await DownloadService.search(query, 1);

                if (results && results.length > 0) {
                    item.url = results[0].url;
                    const cleanMeta = parseCleanMetadata(results[0].title, results[0].uploader);
                    QueueService.updateItem(item.id, {
                        url: results[0].url,
                        title: cleanMeta.title,
                        thumbnail: results[0].thumbnail,
                        duration: results[0].duration,
                        metadata: {
                            title: cleanMeta.title,
                            artist: item.artist || cleanMeta.artist,
                            album: 'Media Converter Pro'
                        }
                    });
                } else {
                    throw new Error(`No se encontró video en YouTube para: ${query}`);
                }
            } catch (e) {
                logger.error('Excepción interna en búsqueda:', e);
                throw new Error(`Falló búsqueda en YouTube: ${  e.message}`);
            }
        }

        QueueService.updateItem(item.id, { status: 'downloading', progress: 0 });
        sendQueueUpdate();

        const videoId =
            item.url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1] ||
            `video_${item.id}`;
        const ext = ['mp3', 'm4a', 'aac', 'mp4'].includes(item.format) ? item.format : 'mp3';

        const subfolderName = item.format === 'mp4' ? 'mp4' : 'mp3';
        const subfolderPath = path.join(downloadFolder, subfolderName);

        if (!fs.existsSync(subfolderPath)) {
            try {
                fs.mkdirSync(subfolderPath, { recursive: true });
            } catch (e) {
                logger.error('Error creando subcarpeta:', e);
            }
        }

        const tempDir = path.join(app.getPath('userData'), 'temp');
        fs.mkdirSync(tempDir, { recursive: true });

        const tempFileName = `${videoId}.${ext}`;
        const tempFilePath = path.join(tempDir, tempFileName);

        // --- FASE 1: DESCARGA ---
        const onProgress = (pct) => {
            const maxDownloadPct = item.format === 'mp4' ? 99 : 75;
            const normalized = Math.min(Math.round(pct * (maxDownloadPct / 100)), maxDownloadPct);
            QueueService.updateItem(item.id, { progress: normalized });
            sendQueueUpdate();
        };

        if (item.format === 'mp4') {
            await DownloadService.downloadVideo(
                item.url,
                tempFilePath,
                item.quality,
                onProgress,
                item.format,
                item.id
            );
        } else {
            const tempWebmPath = path.join(tempDir, `${videoId}.webm`);
            await DownloadService.downloadBestAudio(
                item.url,
                tempWebmPath,
                (pct) => {
                    const finalPct = Math.min(Math.round(pct * 0.75), 75);
                    QueueService.updateItem(item.id, { progress: finalPct });
                    sendQueueUpdate();
                },
                item.id
            );

            // 2. Convertir
            QueueService.updateItem(item.id, { status: 'converting' });
            sendQueueUpdate();

            const conversionProgress = (pct) => {
                const finalPct = Math.min(75 + Math.round(pct * 0.25), 99);
                QueueService.updateItem(item.id, { progress: finalPct });
                sendQueueUpdate();
            };

            if (item.format === 'm4a' || item.format === 'aac') {
                await DownloadService.convertToAAC(tempWebmPath, tempFilePath, conversionProgress);
            } else {
                await DownloadService.convertToMp3(tempWebmPath, tempFilePath, conversionProgress);
            }

            try {
                fs.unlinkSync(tempWebmPath);
            } catch (e) {
                /* el temporal ya pudo haber sido limpiado */
            }
        }

        // --- FASE 2: RENOMBRADO Y METADATOS LIMPIOS ---
        let finalPath = tempFilePath;
        if (item.title === 'Obteniendo título...') {
            const p = QueueService.getInfoPromise(item.id);
            if (p) {
                await Promise.race([p, new Promise((r) => setTimeout(r, 15000))]);
            }

            const currentItem = QueueService.getAll().find((i) => i.id === item.id);
            if (!currentItem || currentItem.title === 'Obteniendo título...') {
                try {
                    const info = await DownloadService.getVideoInfo(item.url);
                    if (info) {
                        const cleanMeta = parseCleanMetadata(info.title, info.uploader);
                        QueueService.updateItem(item.id, {
                            title: cleanMeta.title,
                            thumbnail: info.thumbnail,
                            duration: info.duration,
                            metadata: {
                                title: cleanMeta.title,
                                artist: cleanMeta.artist,
                                album: 'Media Converter Pro'
                            }
                        });
                    }
                } catch (e) {
                    logger.warn('Fallo intento final de obtener titulo', e);
                }
            }

            QueueService.removeInfoPromise(item.id);
        }

        const freshItem = QueueService.getAll().find((i) => i.id === item.id);
        const rawTitle =
            freshItem && freshItem.title && freshItem.title !== 'Obteniendo título...'
                ? freshItem.title
                : item.title && item.title !== 'Obteniendo título...'
                    ? item.title
                    : videoId;

        const cleanMeta = parseCleanMetadata(rawTitle, freshItem?.uploader || item.artist);
        const desiredBaseName = sanitizeFileName(cleanMeta.title);
        const targetDir = path.join(downloadFolder, subfolderName);
        const targetPath = path.join(targetDir, `${desiredBaseName}.${ext}`);

        try {
            fs.mkdirSync(targetDir, { recursive: true });

            if (fs.existsSync(tempFilePath) && tempFilePath !== targetPath) {
                try {
                    if (fs.existsSync(targetPath)) {
                        fs.unlinkSync(targetPath);
                    }
                    fs.renameSync(tempFilePath, targetPath);
                    finalPath = targetPath;
                    logger.info(`Renombrado a metadatos limpios: ${desiredBaseName}.${ext}`);
                } catch (e) {
                    logger.warn('No se pudo mover el archivo temporal al destino:', e.message);
                    finalPath = tempFilePath;
                }
            } else if (fs.existsSync(tempFilePath)) {
                finalPath = tempFilePath;
            }

            // Inyección limpia de metadatos ID3v2 + Portada
            if (
                item.embedMetadata &&
                fs.existsSync(finalPath) &&
                ['.mp3', '.m4a', '.aac'].includes(path.extname(finalPath).toLowerCase())
            ) {
                const metadata = {
                    title: cleanMeta.title,
                    artist: freshItem?.metadata?.artist || item.artist || cleanMeta.artist,
                    album: freshItem?.metadata?.album || 'Media Converter Pro',
                    comment: freshItem?.metadata?.comment || item.url || '',
                    thumbnailUrl: freshItem?.metadata?.thumbnailUrl || freshItem?.thumbnail || null
                };
                const coverPath = path.join(tempDir, `cover_${item.id}.jpg`);
                if (metadata.thumbnailUrl) {
                    try {
                        await DownloadService.downloadThumbnail(metadata.thumbnailUrl, coverPath);
                    } catch (e) {
                        logger.warn('Error descargando portada:', e.message);
                    }
                }
                try {
                    await DownloadService.applyMediaMetadata(
                        finalPath,
                        `${finalPath}.tmp`,
                        metadata,
                        fs.existsSync(coverPath) ? coverPath : null
                    );
                    if (fs.existsSync(`${finalPath}.tmp`)) {
                        fs.renameSync(`${finalPath}.tmp`, finalPath);
                    }
                    // Eliminar la portada borrador temporal para mantener el disco limpio
                    if (fs.existsSync(coverPath)) {
                        try {
                            fs.unlinkSync(coverPath);
                        } catch (e) {
                            /* limpieza best-effort */
                        }
                    }
                } catch (e) {
                    logger.warn('Error aplicando metadatos:', e.message);
                }
            }
        } catch (e) {
            logger.warn('Error renombrando', e.message);
        }

        QueueService.updateItem(item.id, {
            status: 'completed',
            progress: 100,
            filePath: finalPath,
            title: cleanMeta.title
        });
        logger.info(`Completo con metadatos limpios: ${item.id}`);
    } catch (error) {
        logger.error(`Error procesando item ${item.id}:`, error.stack || error);
        QueueService.updateItem(item.id, {
            status: 'error',
            error: error.message || 'Error desconocido'
        });
    }

    sendQueueUpdate();
}

function sendQueueUpdate() {
    const mainWindow = getMainWindow();
    if (mainWindow) {
        mainWindow.webContents.send('youtube:queue-update', {
            queue: QueueService.getAll(),
            downloadFolder
        });
    }
}

module.exports = { registerYouTubeHandlers };

'use strict';

const { ipcMain, dialog, app } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { getMainWindow } = require('../window');
const { loadConfig, saveConfig } = require('../utils/config');

// Services
const QueueService = require('../services/QueueService');
const DownloadService = require('../services/DownloadService');

// Configuración inicial
let config = loadConfig();
let downloadFolder = config.downloadFolder || app.getPath('downloads');

/**
 * Controller: YouTubeController (implementado en el archivo IPC por compatibilidad)
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

    // Inicializar servicio de descargas (verifica binarios)
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
        if (updated.downloadFolder) downloadFolder = updated.downloadFolder;
        return { success: true };
    }
    return { success: false };
}

async function handleAddToQueue(event, { url, format = 'mp3', quality = null }) {
    // La validación simple se puede hacer aquí o en el servicio. 
    // Por simplicidad, delegamos la creación al servicio pero validamos URL aquí.
    if (!url || !url.includes('youtube') && !url.includes('youtu.be')) {
        return { success: false, message: 'URL de YouTube inválida' };
    }

    const item = QueueService.add({ url, format, quality });
    sendQueueUpdate(); // Notificar UI

    logger.info(`Añadido a cola: ID ${item.id}`);

    // Obtener metadata en segundo plano
    const infoPromise = DownloadService.getVideoInfo(url).then(info => {
        if (info) {
            QueueService.updateItem(item.id, {
                title: info.title,
                thumbnail: info.thumbnail,
                duration: info.duration
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
    QueueService.remove(id);
    sendQueueUpdate();
    return { success: true };
}

async function handleStartQueue() {
    if (QueueService.getProcessing()) {
        return { success: false, message: 'Ya hay una descarga en proceso' };
    }

    // Iniciar loop de procesamiento (sin await para no bloquear IPC)
    processQueueLoop();

    return { success: true };
}

async function handleGetVideoInfo(event, { url }) {
    const info = await DownloadService.getVideoInfo(url);
    if (info) return { success: true, info };
    return { success: false, message: 'No se pudo obtener información' };
}

async function checkReady() {
    // Verificamos si los binarios existen
    // Para simplificar, asumimos true si initializó, o podemos preguntar al servicio
    // Como DownloadService inicializa async, verificamos existencia de yt-dlp
    const fs = require('fs');
    const ready = fs.existsSync(DownloadService.ytDlpPath);
    return { ready, downloadFolder };
}

async function handleClearCache() {
    await DownloadService.clearCache();
    return { success: true, message: 'Cache limpiado' };
}

async function handleSearch(event, { query, limit = 10 }) {
    const results = await DownloadService.search(query, limit);
    return { success: true, results };
}

// ==========================================
// Lógica de Orquestación (The Loop)
// ==========================================

async function processQueueLoop() {
    if (QueueService.getProcessing()) return;

    const pending = QueueService.getPending();
    if (pending.length === 0) {
        logger.info('Cola vacía');
        return;
    }

    QueueService.setProcessing(true);

    // Procesamos items uno por uno
    // Nota: Obtenemos la lista actualizada en cada iteración por si se añaden/borran cosas
    while (true) {
        const nextItem = QueueService.getPending()[0];
        if (!nextItem) break;

        await processSingleItem(nextItem);
    }

    QueueService.setProcessing(false);

    // Notificar UI fin
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('youtube:queue-complete');
}

async function processSingleItem(item) {
    try {
        // FASE 0: RESOLUCIÓN DE URL (Si es necesario)
        if (!item.url && (item.searchQuery || (item.artist && item.name))) {
            QueueService.updateItem(item.id, { status: 'searching' });
            sendQueueUpdate();

            const query = item.searchQuery || `${item.artist} - ${item.name} audio`;
            logger.info(`[DEBUG] Resolviendo URL para item ${item.id}. Query: "${query}"`);

            try {
                // Usamos search (lista) y tomamos el primero, O una función específica de single URL
                // DownloadService.search devuelve lista de objetos {url, title...}. Necesitamos la URL.
                const results = await DownloadService.search(query, 1);
                logger.info(`[DEBUG] Resultados búsqueda: ${results ? results.length : 'null'}`);

                if (results && results.length > 0) {
                    item.url = results[0].url;
                    QueueService.updateItem(item.id, {
                        url: results[0].url,
                        title: results[0].title, // Aprovechamos para setear titulo real
                        thumbnail: results[0].thumbnail,
                        duration: results[0].duration
                    });
                    // Continuar abajo con la URL resuelta
                } else {
                    logger.warn(`[DEBUG] Búsqueda vacía para: ${query}`);
                    throw new Error(`No se encontró video en YouTube para: ${query}`);
                }
            } catch (e) {
                logger.error(`[DEBUG] Excepción interna en búsqueda:`, e); // Log raw exception
                throw new Error('Falló búsqueda en YouTube: ' + e.message);
            }
        }

        QueueService.updateItem(item.id, { status: 'downloading', progress: 0 });
        sendQueueUpdate();

        // Determinar ID del video para nombre temporal
        // Si falló la búsqueda arriba, ya saltó al catch
        const videoId = item.url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1] || `video_${item.id}`;
        const ext = item.format === 'm4a' ? 'm4a' : item.format; // map format

        // Paths
        // Usar título limpio si existe para el temporal, o videoId
        const baseName = item.title && item.title !== 'Obteniendo título...'
            ? require('../utils/validators').sanitizeFileName(item.title)
            : videoId;

        // Determinar subcarpeta basada en formato/extensión
        // Usuario pidió carpeta para mp3 y carpeta para mp4
        // Todo lo que no sea video (mp4) va a "mp3" (incluyendo m4a)
        const subfolderName = (item.format === 'mp4') ? 'mp4' : 'mp3';
        const subfolderPath = path.join(downloadFolder, subfolderName);

        if (!fs.existsSync(subfolderPath)) {
            try {
                fs.mkdirSync(subfolderPath, { recursive: true });
            } catch (e) {
                logger.error('Error creando subcarpeta:', e);
                // Fallback to root if fails
            }
        }

        // Use subfolder path effectively
        const effectiveFolder = fs.existsSync(subfolderPath) ? subfolderPath : downloadFolder;

        // Use videoId for absolute safety in temp file to avoid issues
        const tempFileName = `${videoId}.${ext}`;
        const tempFilePath = path.join(effectiveFolder, tempFileName);

        // --- FASE 1: DESCARGA ---
        const onProgress = (pct) => {
            // Normalizar progreso: Descarga es 0-75% del total si hay conversión, sino 0-100%
            const maxDownloadPct = item.format === 'mp4' ? 99 : 75;
            const normalized = Math.min(Math.round(pct * (maxDownloadPct / 100)), maxDownloadPct);
            QueueService.updateItem(item.id, { progress: normalized });
            sendQueueUpdate();
        };

        if (item.format === 'mp4') {
            await DownloadService.downloadVideo(item.url, tempFilePath, item.quality, onProgress);
        } else {
            // Audio Flow: Best Audio -> Convert
            const tempWebmPath = tempFilePath.replace(/\.[^/.]+$/, '.temp.webm');

            // 1. Descargar mejor audio
            await DownloadService.downloadBestAudio(item.url, tempWebmPath, (pct) => {
                // Descarga es el primer 75%
                const finalPct = Math.min(Math.round(pct * 0.75), 75);
                QueueService.updateItem(item.id, { progress: finalPct });
                sendQueueUpdate();
            });

            // 2. Convertir
            QueueService.updateItem(item.id, { status: 'converting' });
            sendQueueUpdate();

            const conversionProgress = (pct) => {
                // Conversión es el último 25% (75 -> 100)
                const finalPct = Math.min(75 + Math.round(pct * 0.25), 99);
                QueueService.updateItem(item.id, { progress: finalPct });
                sendQueueUpdate();
            };

            if (item.format === 'm4a') {
                await DownloadService.convertToAAC(tempWebmPath, tempFilePath, conversionProgress);
            } else {
                await DownloadService.convertToMp3(tempWebmPath, tempFilePath, conversionProgress);
            }

            // Limpiar temporal
            try { fs.unlinkSync(tempWebmPath); } catch (e) { }
        }

        // --- FASE 2: RENOMBRADO FINAL ---
        // Esperamos metadata si no está. Aumentamos tiempo de espera.
        let finalPath = tempFilePath;
        if (item.title === 'Obteniendo título...') {
            const p = QueueService.getInfoPromise(item.id);
            if (p) {
                // Wait up to 15 seconds for metadata (network can be slow)
                await Promise.race([p, new Promise(r => setTimeout(r, 15000))]);
            }

            // If still missing, try one last check directly
            const currentItem = QueueService.getAll().find(i => i.id === item.id);
            if (!currentItem || currentItem.title === 'Obteniendo título...') {
                try {
                    const info = await DownloadService.getVideoInfo(item.url);
                    if (info) {
                        QueueService.updateItem(item.id, {
                            title: info.title,
                            thumbnail: info.thumbnail,
                            duration: info.duration
                        });
                        // Update local var checking queue again
                    }
                } catch (e) { logger.warn('Fallo intento final de obtener titulo', e); }
            }

            QueueService.removeInfoPromise(item.id);
        }

        // Actualizar item con datos frescos del servicio por si la promesa resolvió
        const freshItem = QueueService.getAll().find(i => i.id === item.id);
        if (freshItem && freshItem.title && freshItem.title !== 'Obteniendo título...') {
            const { sanitizeFileName } = require('../utils/validators');
            const newName = sanitizeFileName(freshItem.title) + '.' + ext;
            // Usamos el mismo directorio donde está el temporal (ya sea la subcarpeta o root)
            const targetDir = path.dirname(tempFilePath);
            const newPath = path.join(targetDir, newName);

            try {
                if (fs.existsSync(tempFilePath) && tempFilePath !== newPath) {
                    fs.renameSync(tempFilePath, newPath);
                    finalPath = newPath;
                    logger.info(`Renombrado: ${newName}`);
                }
            } catch (e) { logger.warn('Error renombrando', e.message); }
        }

        // Éxito
        QueueService.updateItem(item.id, {
            status: 'completed',
            progress: 100,
            filePath: finalPath,
            title: (freshItem && freshItem.title !== 'Obteniendo título...') ? freshItem.title : videoId
        });
        logger.info(`Completo: ${item.id}`);

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

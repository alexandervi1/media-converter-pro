'use strict';

const { ipcMain, dialog, app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const logger = require('../utils/logger');
const { isValidYouTubeUrl, sanitizeFileName, extractVideoId } = require('../utils/validators');
const { getMainWindow } = require('../window');
const {
    DOWNLOAD_STATUS,
    DOWNLOAD_CONFIG,
    TIMEOUTS
} = require('../../config/constants');

// FFmpeg path - diferente en desarrollo vs producción
const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')  // Producción: extraResources
    : require('ffmpeg-static');                        // Desarrollo: node_modules

// Path donde se guardará yt-dlp
const YT_DLP_DIR = path.join(app.getPath('userData'), 'bin');
const YT_DLP_PATH = path.join(YT_DLP_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

// Cola de descargas
let downloadQueue = [];
let isProcessingQueue = false;
let currentDownloadId = 0;

/**
 * Registra los handlers IPC para descargas de YouTube
 */
function registerYouTubeHandlers() {
    ipcMain.handle('youtube:add-to-queue', handleAddToQueue);
    ipcMain.handle('youtube:get-queue', handleGetQueue);
    ipcMain.handle('youtube:clear-queue', handleClearQueue);
    ipcMain.handle('youtube:remove-from-queue', handleRemoveFromQueue);
    ipcMain.handle('youtube:start-queue', handleStartQueue);
    ipcMain.handle('youtube:get-info', handleGetVideoInfo);
    ipcMain.handle('youtube:check-ready', checkYtDlpReady);
    ipcMain.handle('youtube:set-download-folder', handleSetDownloadFolder);
    ipcMain.handle('youtube:clear-cache', handleClearCache);
    ipcMain.handle('youtube:search', handleSearch);

    // Descargar yt-dlp si no existe
    ensureYtDlpExists();

    logger.info('Handlers de YouTube registrados');
}

// Carpeta de descargas por defecto
let downloadFolder = app.getPath('downloads');

async function handleSetDownloadFolder() {
    const mainWindow = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Seleccionar carpeta de descargas',
        properties: ['openDirectory']
    });

    if (!canceled && filePaths.length > 0) {
        downloadFolder = filePaths[0];
        return { success: true, folder: downloadFolder };
    }
    return { success: false };
}

/**
 * Agrega una URL a la cola de descargas (fast - no blocking)
 */
// Map para guardar promesas de info (separado del item para evitar problemas de serialización)
const infoPromises = new Map();

async function handleAddToQueue(event, { url, format = 'mp3', quality = null }) {
    if (!url || !isValidYouTubeUrl(url)) {
        return { success: false, message: 'URL de YouTube inválida' };
    }

    const itemId = ++currentDownloadId;

    // Crear item inmediatamente (sin propiedades no serializables)
    const item = {
        id: itemId,
        url,
        format,
        quality: quality || 1080,  // Calidad de video (1080, 720, 480)
        title: 'Obteniendo título...',
        thumbnail: null,
        duration: 0,
        status: 'pending',
        progress: 0,
        error: null,
        filePath: null
    };

    downloadQueue.push(item);
    sendQueueUpdate();

    logger.info(`Añadido a cola: ID ${item.id}`);

    // Guardar promesa en Map separado (no en el item)
    const infoPromise = getVideoInfoInternal(url).then(info => {
        if (info) {
            item.title = info.title || 'Video';
            item.thumbnail = info.thumbnail;
            item.duration = info.duration;
            sendQueueUpdate();
        }
        return info;
    }).catch(() => null);

    infoPromises.set(itemId, infoPromise);

    return { success: true, item };
}

/**
 * Obtiene la cola actual
 */
async function handleGetQueue() {
    return { queue: downloadQueue, downloadFolder };
}

/**
 * Limpia la cola
 */
async function handleClearQueue() {
    downloadQueue = downloadQueue.filter(item => item.status === 'downloading');
    sendQueueUpdate();
    return { success: true };
}

/**
 * Remueve un item de la cola
 */
async function handleRemoveFromQueue(event, { id }) {
    downloadQueue = downloadQueue.filter(item => item.id !== id || item.status === 'downloading');
    sendQueueUpdate();
    return { success: true };
}

/**
 * Inicia el procesamiento de la cola
 */
async function handleStartQueue() {
    if (isProcessingQueue) {
        return { success: false, message: 'Ya hay una descarga en proceso' };
    }

    processQueue();
    return { success: true };
}

/**
 * Procesa la cola de descargas
 */
async function processQueue() {
    if (isProcessingQueue) return;

    const pendingItems = downloadQueue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) {
        logger.info('Cola de descargas vacía');
        return;
    }

    isProcessingQueue = true;

    for (const item of downloadQueue) {
        if (item.status !== 'pending') continue;

        try {
            item.status = 'downloading';
            item.progress = 0;
            sendQueueUpdate();

            // OPTIMIZACIÓN: Extraer video ID inmediatamente (no esperar metadata)
            const videoId = item.url.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1] || `video_${item.id}`;

            // Usar nombre temporal basado en video ID (instantáneo)
            const ext = item.format === 'm4a' ? 'm4a' : item.format;
            const tempFileName = `${videoId}.${ext}`;
            const tempFilePath = path.join(downloadFolder, tempFileName);

            // Descargar inmediatamente (no esperar título)
            logger.info('Descarga rápida iniciada:', videoId);
            await executeYtDlpWithProgress(item, tempFilePath);

            // Después de descargar, intentar renombrar con título real
            let finalPath = tempFilePath;

            // Esperar promesa de info solo si aún está pendiente (máx 2 seg)
            const infoPromise = infoPromises.get(item.id);
            if (infoPromise && item.title === 'Obteniendo título...') {
                try {
                    const info = await Promise.race([
                        infoPromise,
                        new Promise(resolve => setTimeout(() => resolve(null), 2000))
                    ]);
                    if (info && info.title) {
                        item.title = info.title;
                        item.thumbnail = info.thumbnail;
                        item.duration = info.duration;
                    }
                } catch (e) { /* ignorar */ }
                infoPromises.delete(item.id);
            }

            // Renombrar archivo si tenemos título real
            if (item.title && item.title !== 'Obteniendo título...' && item.title !== videoId) {
                const newFileName = sanitizeFileName(item.title) + '.' + ext;
                const newFilePath = path.join(downloadFolder, newFileName);
                try {
                    if (fs.existsSync(tempFilePath) && tempFilePath !== newFilePath) {
                        fs.renameSync(tempFilePath, newFilePath);
                        finalPath = newFilePath;
                        logger.info('Archivo renombrado a:', newFileName);
                    }
                } catch (e) {
                    logger.warn('No se pudo renombrar:', e.message);
                }
            }

            // Verificar que el archivo existe
            if (!fs.existsSync(finalPath)) {
                // Buscar archivo con extensiones alternativas
                const baseName = path.join(downloadFolder, videoId);
                const extensions = ['.m4a', '.aac', '.webm', '.opus', '.mp3'];
                for (const altExt of extensions) {
                    if (fs.existsSync(baseName + altExt)) {
                        finalPath = baseName + altExt;
                        break;
                    }
                }
            }

            item.status = 'completed';
            item.progress = 100;
            item.filePath = finalPath;
            if (item.title === 'Obteniendo título...') {
                item.title = videoId; // Usar ID si no hay título
            }
            logger.info(`Descarga completada: ${item.title} -> ${path.basename(finalPath)}`);

        } catch (error) {
            item.status = 'error';
            item.error = error.message;
            logger.error(`Error descargando:`, error.message);
        }

        sendQueueUpdate();
    }

    isProcessingQueue = false;

    // Notificar que la cola terminó
    const mainWindow = getMainWindow();
    if (mainWindow) {
        mainWindow.webContents.send('youtube:queue-complete');
    }
}

/**
 * FLUJO HONESTO DE DESCARGA:
 * 1. Descargar el mejor audio de YouTube (Opus/WebM - máxima calidad nativa)
 * 2. Convertir localmente a:
 *    - AAC (m4a): Conversión rápida, casi sin pérdida
 *    - MP3: Conversión a 320kbps CBR
 */
async function executeYtDlpWithProgress(item, outputPath) {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);

    // Si es video MP4, descargar directamente con yt-dlp
    if (item.format === 'mp4') {
        await downloadVideo(item, outputPath);
        return;
    }

    // Archivo temporal para el audio original (mejor calidad)
    const tempPath = outputPath.replace(/\.[^/.]+$/, '.temp.webm');

    // Paso 1: Descargar el MEJOR audio disponible (Opus/WebM)
    await downloadBestAudio(item, tempPath);

    // Paso 2: Convertir al formato elegido
    item.status = 'converting';
    item.progress = 75;
    sendQueueUpdate();

    if (item.format === 'm4a') {
        // AAC: Conversión rápida, alta calidad
        await convertToAAC(tempPath, outputPath, item);
    } else {
        // MP3: 320kbps CBR
        await convertToMp3(tempPath, outputPath, item);
    }

    // Eliminar archivo temporal
    try {
        fs.unlinkSync(tempPath);
        logger.info('Archivo temporal eliminado');
    } catch (e) {
        logger.warn('No se pudo eliminar archivo temporal:', e.message);
    }
}

/**
 * Descarga video MP4 con la calidad seleccionada
 */
function downloadVideo(item, outputPath) {
    return new Promise((resolve, reject) => {
        const quality = item.quality || 1080;

        // Formato de video según calidad seleccionada
        const formatStr = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`;

        const args = [
            item.url,
            '-o', outputPath,
            '--no-warnings',
            '-f', formatStr,
            '--no-playlist',
            '--merge-output-format', 'mp4',
            '--ffmpeg-location', ffmpegPath,
            '-N', '4',
            '--no-mtime',
            '--socket-timeout', '15',
            '--retries', '5',
            '--force-overwrites',
            '--newline',
            '--progress-template', '%(progress._percent_str)s'
        ];

        logger.info(`Descargando video MP4 (${quality}p):`, item.url);

        const ytdlp = spawn(YT_DLP_PATH, args, { windowsHide: true });

        let stderr = '';

        ytdlp.stdout.on('data', (data) => {
            const output = data.toString();
            const percentMatch = output.match(/(\d+\.?\d*)%/);
            if (percentMatch) {
                const percent = parseFloat(percentMatch[1]);
                if (!isNaN(percent)) {
                    item.progress = Math.min(Math.round(percent), 99);
                    sendQueueUpdate();
                }
            }
        });

        ytdlp.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            stderr += msg + '\n';
            if (msg.length > 0) {
                logger.warn('yt-dlp:', msg);
            }
        });

        ytdlp.on('close', (code) => {
            logger.info('Descarga video terminada. Código:', code);
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(parseYtDlpError(stderr) || 'Error al descargar video'));
            }
        });

        ytdlp.on('error', (err) => {
            logger.error('Error spawn yt-dlp:', err.message);
            reject(err);
        });
    });
}

/**
 * Descarga el MEJOR audio disponible sin conversión (Opus/WebM nativo)
 * OPTIMIZADO para velocidad máxima (estilo aTube Catcher)
 */
function downloadBestAudio(item, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            item.url,
            '-o', outputPath,
            '--no-warnings',
            '-f', 'bestaudio',           // Mejor audio disponible
            '--no-playlist',             // Solo el video, no toda la playlist
            '-N', '4',                   // 4 conexiones (más compatible que 16)
            '--no-mtime',                // No ajustar fecha de modificación
            '--socket-timeout', '15',    // Timeout razonable
            '--retries', '5',            // Reintentos normales
            '--force-overwrites',        // Sobrescribir si existe
            '--newline',
            '--progress-template', '%(progress._percent_str)s'
        ];

        logger.info('Descarga rápida (4 conexiones):', item.url);

        const ytdlp = spawn(YT_DLP_PATH, args, { windowsHide: true });

        let stderr = '';

        ytdlp.stdout.on('data', (data) => {
            const output = data.toString();
            const percentMatch = output.match(/(\d+\.?\d*)%/);
            if (percentMatch) {
                const percent = parseFloat(percentMatch[1]);
                if (!isNaN(percent)) {
                    // Descarga es 0-75% del total
                    item.progress = Math.min(Math.round(percent * 0.75), 74);
                    sendQueueUpdate();
                }
            }
        });

        ytdlp.stderr.on('data', (data) => {
            const msg = data.toString().trim();
            stderr += msg + '\n';
            if (msg.length > 0) {
                logger.warn('yt-dlp:', msg);
            }
        });

        ytdlp.on('close', (code) => {
            logger.info('Descarga terminada. Código:', code);
            if (code === 0) {
                resolve();
            } else {
                logger.error('Error descarga:', stderr.slice(0, 300));
                reject(new Error(parseYtDlpError(stderr) || `Exit code: ${code}`));
            }
        });

        ytdlp.on('error', (err) => {
            logger.error('Error spawn yt-dlp:', err.message);
            reject(err);
        });
    });
}

/**
 * Convierte audio a AAC (M4A) - Rápido y alta calidad
 */
function convertToAAC(inputPath, outputPath, item) {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);

    const os = require('os');
    const threads = Math.max(os.cpus().length, 2);

    return new Promise((resolve, reject) => {
        logger.info('Convirtiendo a AAC (rápido):', inputPath);

        ffmpeg(inputPath)
            .audioCodec('aac')
            .audioBitrate(256)          // 256kbps AAC = excelente calidad
            .audioChannels(2)
            .outputOptions([
                `-threads ${threads}`
            ])
            .on('progress', (progress) => {
                const convertPercent = progress.percent || 0;
                item.progress = Math.min(75 + Math.round(convertPercent * 0.25), 99);
                sendQueueUpdate();
            })
            .on('end', () => {
                logger.info('Conversión AAC completada');
                resolve();
            })
            .on('error', (err) => {
                logger.error('Error conversión AAC:', err.message);
                reject(new Error('Error convirtiendo a AAC: ' + err.message));
            })
            .save(outputPath);
    });
}

// [REMOVED] downloadAudioDirect - función no utilizada

// [REMOVED] downloadAudio - función no utilizada

/**
 * Convierte audio a MP3 con ffmpeg (optimizado para velocidad)
 */
function convertToMp3(inputPath, outputPath, item) {
    const ffmpeg = require('fluent-ffmpeg');
    ffmpeg.setFfmpegPath(ffmpegPath);

    // Obtener número de CPUs para multithreading
    const os = require('os');
    const threads = Math.max(os.cpus().length, 2);

    return new Promise((resolve, reject) => {
        logger.info('Convirtiendo a MP3 (threads:', threads + '):', inputPath);

        ffmpeg(inputPath)
            .audioCodec('libmp3lame')
            .audioBitrate(320)
            .audioChannels(2)
            // Opciones de velocidad
            .outputOptions([
                `-threads ${threads}`,     // Usar múltiples núcleos
                '-q:a 0',                  // Mejor calidad VBR
                '-compression_level 0'     // Velocidad máxima (menos compresión)
            ])
            .on('progress', (progress) => {
                const convertPercent = progress.percent || 0;
                item.progress = Math.min(80 + Math.round(convertPercent * 0.2), 99);
                sendQueueUpdate();
            })
            .on('end', () => {
                logger.info('Conversión completada:', outputPath);
                resolve();
            })
            .on('error', (err) => {
                logger.error('Error en conversión:', err.message);
                reject(new Error('Error convirtiendo a MP3: ' + err.message));
            })
            .save(outputPath);
    });
}

/**
 * Envía actualización de la cola al renderer
 */
function sendQueueUpdate() {
    const mainWindow = getMainWindow();
    if (mainWindow) {
        mainWindow.webContents.send('youtube:queue-update', {
            queue: downloadQueue,
            downloadFolder
        });
    }
}

/**
 * Verifica si yt-dlp está listo
 */
async function checkYtDlpReady() {
    const ready = fs.existsSync(YT_DLP_PATH);
    return { ready, downloadFolder };
}

/**
 * Asegura que yt-dlp exista
 */
async function ensureYtDlpExists() {
    if (fs.existsSync(YT_DLP_PATH)) {
        logger.info('yt-dlp encontrado en:', YT_DLP_PATH);
        return;
    }

    if (!fs.existsSync(YT_DLP_DIR)) {
        fs.mkdirSync(YT_DLP_DIR, { recursive: true });
    }

    logger.info('Descargando yt-dlp...');

    const downloadUrl = process.platform === 'win32'
        ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
        : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

    try {
        await downloadFile(downloadUrl, YT_DLP_PATH);
        if (process.platform !== 'win32') {
            fs.chmodSync(YT_DLP_PATH, '755');
        }
        logger.info('yt-dlp descargado correctamente');
    } catch (error) {
        logger.error('Error descargando yt-dlp:', error.message);
    }
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const request = (url) => {
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    request(response.headers.location);
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(destPath, () => { });
                reject(err);
            });
        };
        request(url);
    });
}

/**
 * Handler para obtener info de video
 */
async function handleGetVideoInfo(event, { url }) {
    const info = await getVideoInfoInternal(url);
    if (info) {
        return { success: true, info };
    }
    return { success: false, message: 'No se pudo obtener información' };
}

/**
 * Obtiene información del video internamente (con timeout)
 */
async function getVideoInfoInternal(url) {
    if (!url || !isValidYouTubeUrl(url)) {
        logger.warn('URL inválida para obtener info:', url);
        return null;
    }

    if (!fs.existsSync(YT_DLP_PATH)) {
        logger.warn('yt-dlp no encontrado en:', YT_DLP_PATH);
        return null;
    }

    logger.info('Obteniendo info del video:', url);

    return new Promise((resolve) => {
        // Parámetros optimizados para velocidad
        const args = [
            url,
            '-j',
            '--no-warnings',
            '--no-playlist',             // Ignorar playlist
            '--playlist-items', '1',     // Solo primer video
            '--socket-timeout', '5',     // Timeout rápido
            '--no-cache-dir'             // Sin cache
        ];
        const ytdlp = spawn(YT_DLP_PATH, args, { windowsHide: true });

        let stdout = '';
        let stderr = '';

        // Timeout reducido a 10 segundos (era 30)
        const timeout = setTimeout(() => {
            logger.warn('Timeout obteniendo info (10s)');
            ytdlp.kill();
            resolve(null);
        }, 10000);

        ytdlp.stdout.on('data', (data) => { stdout += data.toString(); });
        ytdlp.stderr.on('data', (data) => { stderr += data.toString(); });

        ytdlp.on('close', (code) => {
            clearTimeout(timeout);

            if (code === 0 && stdout) {
                try {
                    const info = JSON.parse(stdout);

                    // Obtener el mejor thumbnail disponible
                    let thumbnailUrl = info.thumbnail;
                    if (!thumbnailUrl && info.thumbnails && info.thumbnails.length > 0) {
                        // Intentar obtener el de mayor resolución
                        const sorted = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
                        thumbnailUrl = sorted[0]?.url;
                    }

                    // Construir URL de thumbnail de YouTube directamente si no hay
                    if (!thumbnailUrl && info.id) {
                        thumbnailUrl = `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;
                    }

                    logger.info('Info obtenida:', info.title, '| Thumbnail:', thumbnailUrl ? 'Sí' : 'No');

                    resolve({
                        title: info.title,
                        duration: info.duration,
                        thumbnail: thumbnailUrl,
                        uploader: info.uploader || info.channel
                    });
                } catch (e) {
                    logger.error('Error parseando JSON:', e.message);
                    resolve(null);
                }
            } else {
                logger.warn('yt-dlp falló. Code:', code, 'Error:', stderr.slice(0, 200));
                resolve(null);
            }
        });

        ytdlp.on('error', (err) => {
            clearTimeout(timeout);
            logger.error('Error spawning yt-dlp:', err.message);
            resolve(null);
        });
    });
}

// isValidYouTubeUrl y sanitizeFileName movidos a ../utils/validators.js

function parseYtDlpError(errorMessage) {
    if (errorMessage.includes('Video unavailable')) return 'El video no está disponible';
    if (errorMessage.includes('Private video')) return 'El video es privado';
    if (errorMessage.includes('Sign in')) return 'El video requiere iniciar sesión';
    if (errorMessage.includes('age-restricted')) return 'Restricción de edad';
    if (errorMessage.includes('ffmpeg')) return 'FFmpeg no encontrado para convertir';
    if (errorMessage.includes('Unable to extract')) return 'Error extrayendo video';
    return 'Error al descargar';
}

/**
 * Limpia el cache de yt-dlp
 */
async function handleClearCache() {
    return new Promise((resolve) => {
        const args = ['--rm-cache-dir'];
        const ytdlp = spawn(YT_DLP_PATH, args, { windowsHide: true });

        ytdlp.on('close', (code) => {
            if (code === 0) {
                logger.info('Cache de yt-dlp limpiado');
                resolve({ success: true, message: 'Cache limpiado correctamente' });
            } else {
                logger.warn('Error limpiando cache');
                resolve({ success: false, message: 'Error al limpiar cache' });
            }
        });

        ytdlp.on('error', () => {
            resolve({ success: false, message: 'Error ejecutando yt-dlp' });
        });
    });
}

/**
 * Busca videos en YouTube
 * @param {string} query - Texto a buscar
 * @param {number} limit - Cantidad de resultados (default 10)
 */
async function handleSearch(event, { query, limit = 10 }) {
    if (!query || query.trim().length < 2) {
        return { success: false, results: [], message: 'Búsqueda muy corta' };
    }

    return new Promise((resolve) => {
        const searchQuery = `ytsearch${limit}:${query}`;
        const args = [
            searchQuery,
            '--dump-json',
            '--flat-playlist',
            '--no-warnings',
            '--socket-timeout', '15'
        ];

        logger.info('Buscando:', query);

        const ytdlp = spawn(YT_DLP_PATH, args, { windowsHide: true });

        let stdout = '';
        let stderr = '';

        ytdlp.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytdlp.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        // Timeout de 20 segundos
        const timeout = setTimeout(() => {
            ytdlp.kill();
            resolve({ success: false, results: [], message: 'Búsqueda tardó demasiado' });
        }, 20000);

        ytdlp.on('close', (code) => {
            clearTimeout(timeout);

            if (code === 0 && stdout) {
                try {
                    // Cada línea es un JSON separado
                    const lines = stdout.trim().split('\n').filter(l => l.trim());
                    const results = lines.map(line => {
                        const data = JSON.parse(line);
                        return {
                            id: data.id,
                            url: data.url || `https://www.youtube.com/watch?v=${data.id}`,
                            title: data.title || 'Sin título',
                            thumbnail: data.thumbnail || `https://i.ytimg.com/vi/${data.id}/hqdefault.jpg`,
                            duration: data.duration || 0,
                            durationStr: formatDuration(data.duration),
                            channel: data.channel || data.uploader || ''
                        };
                    });

                    logger.info(`Encontrados ${results.length} resultados para: ${query}`);
                    resolve({ success: true, results, query });
                } catch (e) {
                    logger.error('Error parseando resultados:', e.message);
                    resolve({ success: false, results: [], message: 'Error en resultados' });
                }
            } else {
                logger.warn('Búsqueda falló:', stderr.slice(0, 200));
                resolve({ success: false, results: [], message: 'No se encontraron resultados' });
            }
        });

        ytdlp.on('error', (err) => {
            clearTimeout(timeout);
            logger.error('Error en búsqueda:', err.message);
            resolve({ success: false, results: [], message: 'Error al buscar' });
        });
    });
}

/**
 * Formatea duración de segundos a mm:ss
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

module.exports = { registerYouTubeHandlers };

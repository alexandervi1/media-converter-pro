'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DownloadService = require('./services/DownloadService');
const QueueService = require('./services/QueueService');
const SpotifyService = require('./services/SpotifyService');
const { createConfigStore } = require('./utils/config');
const logger = require('./utils/logger');
const { parseCleanMetadata, sanitizeFileName } = require('./utils/validators');

const QUEUE_UPDATE_INTERVAL_MS = 250;

/**
 * AppCore — capa de negocio completa, sin dependencias de Electron.
 * La consumen el escritorio (vía servidor local) y cualquier cliente HTTP
 * (navegador del teléfono / app Android) a través de src/server.
 */
class AppCore {
    /**
     * @param {Object} options
     * @param {string} options.dataDir                Directorio de datos (config, bin, temp)
     * @param {string} options.defaultDownloadFolder  Carpeta de descargas por defecto
     * @param {string} options.ffmpegPath             Ruta absoluta de ffmpeg
     */
    constructor({ dataDir, defaultDownloadFolder, ffmpegPath }) {
        fs.mkdirSync(dataDir, { recursive: true });
        this.dataDir = dataDir;

        this.configStore = createConfigStore(path.join(dataDir, 'config.json'), {
            downloadFolder: defaultDownloadFolder,
            format: 'mp3',
            quality: '320',
            ytdlpCookies: 'none',
            lanEnabled: false,
            lanPort: 45690
        });
        this.config = this.configStore.load();

        this.downloads = new DownloadService({
            ffmpegPath,
            binDir: path.join(dataDir, 'bin'),
            tempDir: path.join(dataDir, 'temp')
        });
        this.queue = QueueService;
        this.spotify = SpotifyService;

        this.ready = false;
        this._emitFn = null;
        this._queueUpdateTimer = null;
        this._queueUpdatePending = false;
    }

    /**
     * Registra el callback de eventos hacia los clientes.
     * El servidor lo puentea a SSE; en escritorio es el mismo mecanismo.
     * @param {(event: string, payload: any) => void} fn
     */
    onEvent(fn) {
        this._emitFn = fn;
    }

    _emit(event, payload) {
        if (this._emitFn) {
            try {
                this._emitFn(event, payload);
            } catch (e) {
                logger.warn('Error emitiendo evento:', e.message);
            }
        }
    }

    /**
     * Emisión throttled del estado de la cola: máx. 1 evento cada 250ms
     * (leading + trailing). Los ticks de progreso llegan varias veces por
     * segundo y saturarían el SSE y el render de la UI.
     */
    _emitQueueUpdate() {
        if (this._queueUpdateTimer) {
            this._queueUpdatePending = true;
            return;
        }
        this._doEmitQueueUpdate();
        this._queueUpdateTimer = setTimeout(() => {
            this._queueUpdateTimer = null;
            if (this._queueUpdatePending) {
                this._queueUpdatePending = false;
                this._emitQueueUpdate();
            }
        }, QUEUE_UPDATE_INTERVAL_MS);
    }

    _doEmitQueueUpdate() {
        this._emit('queue-update', {
            queue: this.queue.getAll(),
            downloadFolder: this.config.downloadFolder
        });
    }

    async initialize() {
        if (this.config.ytdlpCookies) {
            this.downloads.setCookiesBrowser(this.config.ytdlpCookies);
        }
        this.ready = await this.downloads.initialize();
        this._watchFlacDir();
        return this.ready;
    }

    cancelAll() {
        this.downloads.cancelAll();
    }

    // ==========================================
    // Settings
    // ==========================================

    getSettings() {
        return this.config;
    }

    saveSettings(partial) {
        const updated = this.configStore.save(partial || {});
        if (!updated) {
            return { success: false };
        }
        this.config = updated;
        if (updated.ytdlpCookies !== undefined) {
            this.downloads.setCookiesBrowser(updated.ytdlpCookies);
        }
        return { success: true };
    }

    setDownloadFolder(folder) {
        const result = this.saveSettings({ downloadFolder: folder });
        this._emitQueueUpdate();
        return result;
    }

    // ==========================================
    // Cola de descargas
    // ==========================================

    getQueue() {
        return { queue: this.queue.getAll(), downloadFolder: this.config.downloadFolder };
    }

    addToQueue({ url, format = 'mp3', quality = null, options = {} }) {
        if (!url || (!url.includes('youtube') && !url.includes('youtu.be'))) {
            return { success: false, message: 'URL de YouTube inválida' };
        }

        const item = this.queue.add({
            url,
            format,
            quality,
            embedMetadata: options?.embedMetadata !== false
        });
        this._emitQueueUpdate();
        logger.info(`Añadido a cola: ID ${item.id}`);

        // Obtener metadata en segundo plano
        const infoPromise = this.downloads.getVideoInfo(url).then((info) => {
            if (info) {
                const cleanMeta = parseCleanMetadata(info.title, info.uploader);
                this.queue.updateItem(item.id, {
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
                this._emitQueueUpdate();
            }
            return info;
        });
        this.queue.setInfoPromise(item.id, infoPromise);

        return { success: true, item };
    }

    removeFromQueue(id) {
        this.downloads.cancelDownload(id);
        this.queue.remove(id);
        this._emitQueueUpdate();
        return { success: true };
    }

    clearQueue() {
        this.queue.clearCompleted();
        this._emitQueueUpdate();
        return { success: true };
    }

    startQueue() {
        if (this.queue.getProcessing()) {
            return { success: false, message: 'Ya hay una descarga en proceso' };
        }
        this.processQueueLoop();
        return { success: true };
    }

    async getVideoInfo(url) {
        return this.downloads.getVideoInfo(url);
    }

    async search(query, limit = 15, type = 'all') {
        return this.downloads.search(query, limit, type);
    }

    async clearCache() {
        return this.downloads.clearCache();
    }

    // ==========================================
    // Spotify
    // ==========================================

    async parseSpotifyPlaylist(url) {
        if (!url) {
            return { success: false, message: 'URL requerida' };
        }
        try {
            const playlist = await this.spotify.parsePlaylist(url);
            return { success: true, playlist };
        } catch (error) {
            logger.error('Error parseando Spotify:', error.message);
            return { success: false, message: error.message };
        }
    }

    addSpotifyTracks({ tracks, format = 'mp3' }) {
        if (!tracks || tracks.length === 0) {
            return { success: false, message: 'No hay canciones para descargar' };
        }
        const selected = tracks.filter((t) => t.selected !== false);
        if (selected.length === 0) {
            return { success: false, message: 'No hay canciones seleccionadas' };
        }

        selected.forEach((track) => {
            this.queue.add({
                url: null, // se resuelve vía búsqueda en YouTube al procesar
                searchQuery: `${track.artist} - ${track.name} audio`,
                format,
                title: `${track.artist} - ${track.name}`,
                artist: track.artist,
                name: track.name,
                thumbnail: null,
                source: 'spotify'
            });
        });
        this._emitQueueUpdate();

        return { success: true, message: `Añadidas ${selected.length} canciones a la cola` };
    }

    // ==========================================
    // FLAC (carpeta organizada de descargas lossless)
    // ==========================================

    getFlacDir() {
        return path.join(this.config.downloadFolder, 'flac');
    }

    ensureFlacDir() {
        const dir = this.getFlacDir();
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    /**
     * Lista los archivos de la carpeta flac/ (nombre, tamaño, fecha).
     */
    listFlacFiles() {
        const dir = this.getFlacDir();
        try {
            return fs
                .readdirSync(dir)
                .filter((f) => !f.startsWith('.'))
                .map((name) => {
                    const full = path.join(dir, name);
                    let size = 0;
                    let mtime = 0;
                    try {
                        const st = fs.statSync(full);
                        if (!st.isFile()) {
                            return null;
                        }
                        size = st.size;
                        mtime = st.mtimeMs;
                    } catch (e) {
                        return null;
                    }
                    return { name, size, mtime, path: full };
                })
                .filter(Boolean)
                .sort((a, b) => b.mtime - a.mtime);
        } catch (e) {
            return [];
        }
    }

    /**
     * Mueve un archivo recién descargado a la carpeta flac/ con nombre
     * único, y notifica a los clientes. Lo llama el escritorio desde su
     * manejador de descargas; también sirve para organizar a mano.
     * @returns {{path: string, name: string}}
     */
    organizeIncomingFile(tempPath, originalName) {
        const dir = this.ensureFlacDir();
        const base = sanitizeFileName(path.basename(originalName || 'archivo.flac'));
        const ext = path.extname(base) || '.flac';
        const stem = base.slice(0, base.length - ext.length) || 'archivo';

        let target = path.join(dir, base);
        let n = 1;
        while (fs.existsSync(target)) {
            target = path.join(dir, `${stem} (${n})${ext}`);
            n++;
        }
        try {
            fs.renameSync(tempPath, target);
        } catch (e) {
            // entre discos rename falla: copiar + borrar
            fs.copyFileSync(tempPath, target);
            try {
                fs.unlinkSync(tempPath);
            } catch (e2) {
                /* best-effort */
            }
        }
        logger.info(`FLAC organizado: ${path.basename(target)}`);
        this.notifyFlacChange();
        return { path: target, name: path.basename(target) };
    }

    /**
     * Emite la lista actual de FLAC a los clientes (SSE).
     */
    notifyFlacChange() {
        this._emit('flac-update', { files: this.listFlacFiles() });
    }

    _watchFlacDir() {
        // Si el usuario suelta/baja archivos a mano en la carpeta, la UI se
        // refresca sola. Debounce: los editores disparan eventos en ráfaga.
        let timer = null;
        try {
            const dir = this.ensureFlacDir();
            fs.watch(dir, () => {
                clearTimeout(timer);
                timer = setTimeout(() => this.notifyFlacChange(), 600);
            });
        } catch (e) {
            logger.warn('No se pudo vigilar la carpeta flac:', e.message);
        }
    }

    // ==========================================
    // Shell del equipo servidor
    // ==========================================

    /**
     * Abre un archivo o carpeta en el explorador del equipo donde corre
     * el servidor (Electron no es necesario: usa el opener del SO).
     */
    openPath(target) {
        return new Promise((resolve) => {
            if (!target || !fs.existsSync(target)) {
                resolve({ success: false, message: 'Ruta no encontrada' });
                return;
            }
            const opener =
                process.platform === 'win32'
                    ? 'explorer'
                    : process.platform === 'darwin'
                        ? 'open'
                        : 'xdg-open';
            try {
                const proc = spawn(opener, [target], { detached: true, stdio: 'ignore' });
                proc.on('error', () => resolve({ success: false, message: 'No se pudo abrir' }));
                proc.unref();
                resolve({ success: true });
            } catch (e) {
                resolve({ success: false, message: 'No se pudo abrir' });
            }
        });
    }

    // ==========================================
    // Orquestación de descargas (antes ipc/youtube.js)
    // ==========================================

    async processQueueLoop() {
        if (this.queue.getProcessing()) {
            return;
        }

        const pending = this.queue.getPending();
        if (pending.length === 0) {
            logger.info('Cola vacía');
            return;
        }

        this.queue.setProcessing(true);

        for (;;) {
            const nextItem = this.queue.getPending()[0];
            if (!nextItem) {
                break;
            }

            await this.processSingleItem(nextItem);
        }

        this.queue.setProcessing(false);
        this._emit('queue-complete');
    }

    async processSingleItem(item) {
        const downloads = this.downloads;
        const queue = this.queue;

        try {
            // Item sin URL (Spotify): resolver vía búsqueda en YouTube
            if (!item.url && (item.searchQuery || (item.artist && item.name))) {
                queue.updateItem(item.id, { status: 'searching' });
                this._emitQueueUpdate();

                const query = item.searchQuery || `${item.artist} - ${item.name} audio`;
                logger.info(`Resolviendo URL para item ${item.id}. Query: "${query}"`);

                try {
                    const results = await downloads.search(query, 1);

                    if (results && results.length > 0) {
                        const cleanMeta = parseCleanMetadata(results[0].title, results[0].uploader);
                        queue.updateItem(item.id, {
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
                    throw new Error(`Falló búsqueda en YouTube: ${e.message}`);
                }
            }

            queue.updateItem(item.id, { status: 'downloading', progress: 0 });
            this._emitQueueUpdate();

            const currentItem = queue.getAll().find((i) => i.id === item.id) || item;
            const resolvedUrl = currentItem.url || item.url;

            const videoId =
                resolvedUrl.match(/(?:v=|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1] ||
                `video_${item.id}`;
            const ext = ['mp3', 'm4a', 'aac', 'mp4'].includes(item.format) ? item.format : 'mp3';

            const subfolderName = item.format === 'mp4' ? 'mp4' : 'mp3';
            const targetDir = path.join(this.config.downloadFolder, subfolderName);

            const tempDir = downloads.tempDir;
            fs.mkdirSync(tempDir, { recursive: true });

            const tempFileName = `${item.id}_${videoId}.${ext}`;
            const tempFilePath = path.join(tempDir, tempFileName);

            // --- FASE 1: DESCARGA ---
            if (item.format === 'mp4') {
                const onProgress = ({ percent, speed, eta }) => {
                    const normalized = Math.min(Math.round(percent * 0.99), 99);
                    queue.updateItem(item.id, {
                        progress: normalized,
                        speed: speed || null,
                        eta: eta || null
                    });
                    this._emitQueueUpdate();
                };
                await downloads.downloadVideo(
                    resolvedUrl,
                    tempFilePath,
                    item.quality,
                    onProgress,
                    item.format,
                    item.id
                );
            } else {
                // yt-dlp decide la extensión real (webm/m4a); recibimos la ruta final
                const downloadedAudioPath = await downloads.downloadBestAudio(
                    resolvedUrl,
                    tempDir,
                    `${item.id}_${videoId}`,
                    ({ percent, speed, eta }) => {
                        const finalPct = Math.min(Math.round(percent * 0.75), 75);
                        queue.updateItem(item.id, {
                            progress: finalPct,
                            speed: speed || null,
                            eta: eta || null
                        });
                        this._emitQueueUpdate();
                    },
                    item.id
                );

                // 2. Convertir
                queue.updateItem(item.id, { status: 'converting', speed: null, eta: null });
                this._emitQueueUpdate();

                const conversionProgress = (pct) => {
                    const finalPct = Math.min(75 + Math.round(pct * 0.25), 99);
                    queue.updateItem(item.id, { progress: finalPct, speed: null, eta: null });
                    this._emitQueueUpdate();
                };

                if (item.format === 'm4a' || item.format === 'aac') {
                    await downloads.convertToAAC(
                        downloadedAudioPath,
                        tempFilePath,
                        conversionProgress
                    );
                } else {
                    await downloads.convertToMp3(
                        downloadedAudioPath,
                        tempFilePath,
                        conversionProgress
                    );
                }

                try {
                    fs.unlinkSync(downloadedAudioPath);
                } catch (e) {
                    /* el temporal ya pudo haber sido limpiado */
                }
            }

            // --- FASE 2: RENOMBRADO Y METADATOS LIMPIOS ---
            let finalPath = tempFilePath;
            if (item.title === 'Obteniendo título...') {
                const p = queue.getInfoPromise(item.id);
                if (p) {
                    await Promise.race([p, new Promise((r) => setTimeout(r, 15000))]);
                }

                const fresh = queue.getAll().find((i) => i.id === item.id);
                if (!fresh || fresh.title === 'Obteniendo título...') {
                    try {
                        const info = await downloads.getVideoInfo(resolvedUrl);
                        if (info) {
                            const cleanMeta = parseCleanMetadata(info.title, info.uploader);
                            queue.updateItem(item.id, {
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

                queue.removeInfoPromise(item.id);
            }

            const freshItem = queue.getAll().find((i) => i.id === item.id);
            const rawTitle =
                freshItem && freshItem.title && freshItem.title !== 'Obteniendo título...'
                    ? freshItem.title
                    : item.title && item.title !== 'Obteniendo título...'
                        ? item.title
                        : videoId;

            const cleanMeta = parseCleanMetadata(rawTitle, freshItem?.uploader || item.artist);
            const desiredBaseName = sanitizeFileName(cleanMeta.title);
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
                        comment: freshItem?.metadata?.comment || resolvedUrl || '',
                        thumbnailUrl:
                            freshItem?.metadata?.thumbnailUrl || freshItem?.thumbnail || null
                    };
                    const coverPath = path.join(tempDir, `cover_${item.id}.jpg`);
                    if (metadata.thumbnailUrl) {
                        try {
                            await downloads.downloadThumbnail(metadata.thumbnailUrl, coverPath);
                        } catch (e) {
                            logger.warn('Error descargando portada:', e.message);
                        }
                    }
                    try {
                        await downloads.applyMediaMetadata(
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

            queue.updateItem(item.id, {
                status: 'completed',
                progress: 100,
                filePath: finalPath,
                title: cleanMeta.title
            });
            logger.info(`Completo con metadatos limpios: ${item.id}`);
        } catch (error) {
            logger.error(`Error procesando item ${item.id}:`, error.stack || error);
            this.queue.updateItem(item.id, {
                status: 'error',
                error: error.message || 'Error desconocido'
            });
        }

        this._emitQueueUpdate();
    }
}

function createAppCore(options) {
    return new AppCore(options);
}

module.exports = { createAppCore, AppCore };

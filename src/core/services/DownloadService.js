'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const logger = require('../utils/logger');
const { parseCleanMetadata } = require('../utils/validators');

/**
 * DownloadService
 * Encapsula la lógica compleja de yt-dlp y ffmpeg.
 * Gestiona el ciclo de vida de los subprocesos de conversión/descarga.
 * Agnóstico del runtime: recibe sus rutas por constructor (sin Electron).
 */
class DownloadService {
    /**
     * @param {Object} options
     * @param {string} options.ffmpegPath  Ruta absoluta al binario de ffmpeg
     * @param {string} options.binDir      Directorio donde vive/descarga yt-dlp
     * @param {string} options.tempDir     Directorio de archivos temporales
     */
    constructor({ ffmpegPath, binDir, tempDir }) {
        this.ffmpegPath = ffmpegPath;

        process.env.FFMPEG_PATH = this.ffmpegPath;

        this.ytDlpDir = binDir;
        this.ytDlpPath = path.join(
            this.ytDlpDir,
            process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
        );
        this.tempDir = tempDir;
        fs.mkdirSync(this.tempDir, { recursive: true });

        this.activeProcesses = new Map();

        // Opcional: usar cookies de un navegador local para sortear el
        // bot-check de YouTube ("Sign in to confirm you're not a bot")
        this.cookiesBrowser = null;
    }

    setCookiesBrowser(browserName) {
        this.cookiesBrowser = browserName && browserName !== 'none' ? browserName : null;
        logger.info(
            this.cookiesBrowser
                ? `yt-dlp usará cookies de: ${this.cookiesBrowser}`
                : 'yt-dlp sin cookies de navegador'
        );
    }

    _cookieArgs() {
        return this.cookiesBrowser ? ['--cookies-from-browser', this.cookiesBrowser] : [];
    }

    _registerProcess(id, proc) {
        if (!id) {
            return;
        }
        if (!this.activeProcesses.has(id)) {
            this.activeProcesses.set(id, new Set());
        }
        this.activeProcesses.get(id).add(proc);
    }

    _unregisterProcess(id, proc) {
        if (!id || !this.activeProcesses.has(id)) {
            return;
        }
        const set = this.activeProcesses.get(id);
        set.delete(proc);
        if (set.size === 0) {
            this.activeProcesses.delete(id);
        }
    }

    cancelDownload(id) {
        if (!id || !this.activeProcesses.has(id)) {
            return false;
        }
        const set = this.activeProcesses.get(id);
        for (const proc of set) {
            try {
                proc.kill('SIGKILL');
            } catch (e) {
                logger.warn(`Error terminando proceso para item ${id}:`, e.message);
            }
        }
        this.activeProcesses.delete(id);
        logger.info(`Cancelados todos los procesos del item ${id}`);
        return true;
    }

    cancelAll() {
        for (const set of this.activeProcesses.values()) {
            for (const proc of set) {
                try {
                    proc.kill('SIGKILL');
                } catch (e) {
                    /* el proceso ya pudo haber terminado */
                }
            }
        }
        this.activeProcesses.clear();
        logger.info('Todos los procesos activos de DownloadService han sido cancelados.');
    }

    async initialize() {
        try {
            await this.ensureYtDlpExists();
            this.checkForYtDlpUpdate();
            return true;
        } catch (error) {
            logger.error('Fallo al inicializar DownloadService:', error);
            return false;
        }
    }

    /**
     * YouTube rompe yt-dlp cada pocas semanas: lo actualizamos en background
     * como máximo una vez cada 7 días (best-effort, no bloquea el arranque).
     */
    checkForYtDlpUpdate() {
        const markerPath = path.join(this.ytDlpDir, '.last_update');
        const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
        try {
            const last = parseInt(fs.readFileSync(markerPath, 'utf-8'), 10) || 0;
            if (Date.now() - last < WEEK_MS) {
                return;
            }
            fs.writeFileSync(markerPath, String(Date.now()));
        } catch (e) {
            try {
                fs.writeFileSync(markerPath, String(Date.now()));
            } catch (e2) {
                return;
            }
        }

        logger.info('Buscando actualización de yt-dlp...');
        const updater = spawn(this.ytDlpPath, ['-U'], { windowsHide: true });
        let output = '';
        updater.stdout.on('data', (d) => (output += d.toString()));
        updater.stderr.on('data', (d) => (output += d.toString()));
        updater.on('close', (code) => {
            if (code === 0) {
                logger.info('Verificación de actualización de yt-dlp:', output.trim().slice(0, 120));
            } else {
                logger.warn('No se pudo verificar actualización de yt-dlp:', output.trim().slice(0, 120));
            }
        });
        updater.on('error', () => {});
    }

    async ensureYtDlpExists() {
        if (fs.existsSync(this.ytDlpPath)) {
            logger.info('yt-dlp encontrado en:', this.ytDlpPath);
            return;
        }

        if (!fs.existsSync(this.ytDlpDir)) {
            fs.mkdirSync(this.ytDlpDir, { recursive: true });
        }

        logger.info('Descargando yt-dlp...');

        const downloadUrl =
            process.platform === 'win32'
                ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
                : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

        await this._downloadFile(downloadUrl, this.ytDlpPath);

        if (process.platform !== 'win32') {
            fs.chmodSync(this.ytDlpPath, '755');
        }
        logger.info('yt-dlp descargado correctamente');
    }

    _downloadFile(url, destPath) {
        return new Promise((resolve, reject) => {
            let redirects = 0;
            const file = fs.createWriteStream(destPath);
            const fail = (err) => {
                file.close();
                fs.unlink(destPath, () => {});
                reject(err);
            };
            const request = (targetUrl) => {
                if (redirects > 5) {
                    fail(new Error('Demasiados redirects'));
                    return;
                }
                redirects++;
                https
                    .get(targetUrl, (response) => {
                        const code = response.statusCode;
                        if (
                            [301, 302, 307, 308].includes(code) &&
                            response.headers.location
                        ) {
                            response.resume();
                            request(response.headers.location);
                            return;
                        }
                        if (code !== 200) {
                            response.resume();
                            fail(new Error(`HTTP ${code} descargando ${path.basename(destPath)}`));
                            return;
                        }
                        response.pipe(file);
                        file.on('finish', () => {
                            file.close(() => resolve());
                        });
                    })
                    .on('error', fail);
            };
            request(url);
        });
    }

    async getVideoInfo(url) {
        if (!fs.existsSync(this.ytDlpPath)) {
            return null;
        }

        return new Promise((resolve) => {
            const args = [
                ...this._cookieArgs(),
                url,
                '-j',
                '--no-warnings',
                '--no-playlist',
                '--playlist-items',
                '1',
                '--socket-timeout',
                '15',
                '--no-cache-dir'
            ];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            let stdout = '';
            let stderr = '';

            const timeout = setTimeout(() => {
                ytdlp.kill();
                logger.warn(`Timeout obteniendo info para URL: ${url}`);
                resolve(null);
            }, 25000);

            ytdlp.stdout.on('data', (d) => (stdout += d.toString()));
            ytdlp.stderr.on('data', (d) => (stderr += d.toString()));

            ytdlp.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0 && stdout) {
                    try {
                        const info = JSON.parse(stdout);
                        resolve(this._normalizeInfo(info));
                    } catch (e) {
                        logger.error('Error parseando JSON de yt-dlp:', e.message);
                        resolve(null);
                    }
                } else {
                    logger.warn(`yt-dlp retorno código ${code}: ${stderr.slice(0, 150)}`);
                    resolve(null);
                }
            });

            ytdlp.on('error', (err) => {
                clearTimeout(timeout);
                logger.error('Error ejecutando yt-dlp en getVideoInfo:', err.message);
                resolve(null);
            });
        });
    }

    _normalizeInfo(info) {
        if (!info) {
            return null;
        }
        let thumbnailUrl = info.thumbnail;
        if (!thumbnailUrl && info.thumbnails?.length > 0) {
            const sorted = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
            thumbnailUrl = sorted[0]?.url;
        }
        if (!thumbnailUrl && info.id) {
            thumbnailUrl = `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;
        }

        const standardQualities = [144, 240, 360, 480, 720, 1080, 1440, 2160];
        let availableQualities = [];

        if (info.formats && Array.isArray(info.formats)) {
            const heights = new Set();
            info.formats.forEach((f) => {
                if (f.height && f.vcodec && f.vcodec !== 'none') {
                    heights.add(f.height);
                }
            });
            availableQualities = standardQualities.filter((q) => {
                for (const h of heights) {
                    if (Math.abs(h - q) <= 20) {
                        return true;
                    }
                }
                return false;
            });
        }

        return {
            url: info.webpage_url || info.url,
            title: info.title,
            duration: info.duration,
            thumbnail: thumbnailUrl,
            uploader: info.uploader || info.channel,
            availableQualities
        };
    }

    /**
     * Descarga el mejor audio disponible.
     * Usa template con %(ext)s y --print after_move:filepath para conocer la
     * ruta REAL escrita por yt-dlp (el mejor audio puede ser webm u m4a).
     * @returns {Promise<string>} ruta absoluta del archivo descargado
     */
    downloadBestAudio(url, outputDir, baseName, onProgress, taskId = null) {
        fs.mkdirSync(outputDir, { recursive: true });
        const template = path.join(outputDir, `${baseName}.%(ext)s`);

        return new Promise((resolve, reject) => {
            const args = [
                ...this._cookieArgs(),
                url,
                '-o',
                template,
                '--no-warnings',
                '-f',
                'bestaudio/best',
                '--no-playlist',
                '-N',
                '4',
                '--no-mtime',
                '--socket-timeout',
                '15',
                '--retries',
                '5',
                '--force-overwrites',
                '--newline',
                '--progress-template',
                '%(progress._percent_str)s',
                '--print',
                'after_move:filepath',
                '--no-simulate'
            ];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            if (taskId) {
                this._registerProcess(taskId, ytdlp);
            }
            let stderr = '';
            const stdoutLines = [];

            ytdlp.stdout.on('data', (data) => {
                const output = data.toString();
                const percentMatch = output.match(/(\d+\.?\d*)%/);
                if (percentMatch) {
                    const percent = parseFloat(percentMatch[1]);
                    if (!isNaN(percent)) {
                        onProgress(percent);
                    }
                }
                stdoutLines.push(...output.split('\n'));
            });

            ytdlp.stderr.on('data', (d) => (stderr += d.toString()));

            ytdlp.on('close', (code) => {
                if (taskId) {
                    this._unregisterProcess(taskId, ytdlp);
                }
                if (code === 0) {
                    // La última línea sin '%' es la ruta impresa por after_move:filepath
                    const pathLine = [...stdoutLines]
                        .reverse()
                        .find((l) => l.trim() && !l.includes('%'));
                    const finalPath = pathLine ? pathLine.trim() : null;
                    if (finalPath && fs.existsSync(finalPath)) {
                        resolve(finalPath);
                    } else {
                        reject(new Error('yt-dlp terminó sin reportar el archivo descargado'));
                    }
                } else {
                    reject(new Error(`yt-dlp error code ${code}: ${stderr.slice(0, 100)}`));
                }
            });

            ytdlp.on('error', (err) => {
                if (taskId) {
                    this._unregisterProcess(taskId, ytdlp);
                }
                reject(err);
            });
        });
    }

    downloadVideo(url, outputPath, quality, onProgress, outputFormat = 'mp4', taskId = null) {
        this._prepareOutputPath(outputPath);

        return new Promise((resolve, reject) => {
            const resolvedQuality =
                typeof quality === 'number' ? Math.max(144, Math.min(2160, quality)) : null;
            const formatStr =
                outputFormat === 'avi'
                    ? resolvedQuality
                        ? `bestvideo[height<=${resolvedQuality}]+bestaudio/best`
                        : 'bestvideo+bestaudio/best'
                    : resolvedQuality
                        ? `bestvideo[height<=${resolvedQuality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${resolvedQuality}][ext=mp4]/best`
                        : 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';

            const args = [
                ...this._cookieArgs(),
                url,
                '-o',
                outputPath,
                '--no-warnings',
                '-f',
                formatStr,
                '--no-playlist',
                '--merge-output-format',
                outputFormat,
                '--ffmpeg-location',
                this.ffmpegPath,
                '-N',
                '4',
                '--no-mtime',
                '--force-overwrites',
                '--newline',
                '--progress-template',
                '%(progress._percent_str)s'
            ];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            if (taskId) {
                this._registerProcess(taskId, ytdlp);
            }
            let stderr = '';

            ytdlp.stdout.on('data', (data) => {
                const output = data.toString();
                const percentMatch = output.match(/(\d+\.?\d*)%/);
                if (percentMatch) {
                    const percent = parseFloat(percentMatch[1]);
                    if (!isNaN(percent)) {
                        onProgress(percent);
                    }
                }
            });

            ytdlp.stderr.on('data', (d) => (stderr += d.toString()));

            ytdlp.on('close', (code) => {
                if (taskId) {
                    this._unregisterProcess(taskId, ytdlp);
                }
                if (code === 0) {
                    resolve();
                } else {
                    const message =
                        this._parseError(stderr) ||
                        stderr.slice(0, 300).trim() ||
                        'Error descargando video';
                    reject(new Error(message));
                }
            });

            ytdlp.on('error', (err) => {
                if (taskId) {
                    this._unregisterProcess(taskId, ytdlp);
                }
                reject(err);
            });
        });
    }

    /**
     * Hilos para los encoders de audio: entre 2 y 4. Más hilos no acelera
     * la codificación de audio y saturaba CPUs pequeñas.
     */
    _encoderThreads() {
        const os = require('os');
        return Math.min(Math.max(os.cpus().length || 2, 2), 4);
    }

    convertToAAC(inputPath, outputPath, onProgress) {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(this.ffmpegPath);
        const threads = this._encoderThreads();

        const tempOutputPath = path.join(this.tempDir, `${path.basename(outputPath)}.tmp.aac`);
        this._prepareOutputPath(tempOutputPath);

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('aac')
                .audioBitrate(256)
                .audioChannels(2)
                .outputOptions([`-threads ${threads}`, '-y'])
                .on('progress', (p) => {
                    const percent = p.percent || 0;
                    onProgress(percent);
                })
                .on('end', () => {
                    try {
                        this._prepareOutputPath(outputPath);
                        fs.renameSync(tempOutputPath, outputPath);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', reject)
                .save(tempOutputPath);
        });
    }

    convertToMp3(inputPath, outputPath, onProgress) {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(this.ffmpegPath);
        const threads = this._encoderThreads();

        const tempOutputPath = path.join(this.tempDir, `${path.basename(outputPath)}.tmp.mp3`);
        this._prepareOutputPath(tempOutputPath);

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('libmp3lame')
                .audioBitrate(320)
                .audioChannels(2)
                .outputOptions([`-threads ${threads}`, '-q:a 0', '-y'])
                .on('progress', (p) => {
                    const percent = p.percent || 0;
                    onProgress(percent);
                })
                .on('end', () => {
                    try {
                        this._prepareOutputPath(outputPath);
                        fs.renameSync(tempOutputPath, outputPath);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', reject)
                .save(tempOutputPath);
        });
    }

    downloadThumbnail(url, outputPath) {
        if (!url) {
            return Promise.resolve(null);
        }

        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(outputPath);
            const request = (targetUrl) => {
                https
                    .get(
                        targetUrl,
                        {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                        },
                        (response) => {
                            if (
                                response.statusCode === 301 ||
                                response.statusCode === 302 ||
                                response.statusCode === 307 ||
                                response.statusCode === 308
                            ) {
                                response.resume();
                                request(response.headers.location);
                                return;
                            }

                            response.pipe(file);
                            file.on('finish', () => {
                                file.close(() => resolve(outputPath));
                            });
                        }
                    )
                    .on('error', (err) => {
                        file.close();
                        fs.unlink(outputPath, () => {});
                        reject(err);
                    });
            };
            request(url);
        });
    }

    /**
     * Incrusta metadatos ID3v2 (y carátula opcional).
     * Usa spawn directo de ffmpeg: el tokenizador de fluent-ffmpeg parte los
     * valores con espacios ("title=Smoke Test" -> dos argumentos) y rompía
     * todos los títulos multi-palabra.
     */
    applyMediaMetadata(inputPath, outputPath, metadata, coverPath) {
        return new Promise((resolve) => {
            const args = ['-y', '-i', inputPath];

            if (coverPath && fs.existsSync(coverPath)) {
                args.push(
                    '-i',
                    coverPath,
                    '-map',
                    '0:a',
                    '-map',
                    '1:v',
                    '-c:v',
                    'copy',
                    '-disposition:v:0',
                    'attached_pic'
                );
            } else {
                args.push('-map', '0:a');
            }

            args.push(
                '-c:a',
                path.extname(inputPath).toLowerCase() === '.mp3' ? 'libmp3lame' : 'aac',
                '-id3v2_version',
                '3',
                '-metadata',
                `title=${metadata.title || 'Downloaded Track'}`,
                '-metadata',
                `artist=${metadata.artist || 'Unknown Artist'}`,
                '-metadata',
                `album=${metadata.album || 'Media Converter Pro'}`,
                '-metadata',
                `comment=${metadata.comment || ''}`,
                outputPath
            );

            const proc = spawn(this.ffmpegPath, args, { windowsHide: true });
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                } else {
                    logger.warn(`applyMediaMetadata: ffmpeg terminó con código ${code}`);
                    resolve(false);
                }
            });
            proc.on('error', (err) => {
                logger.warn('Error ejecutando ffmpeg en applyMediaMetadata:', err.message);
                resolve(false);
            });
        });
    }

    clearCache() {
        return new Promise((resolve) => {
            const ytdlp = spawn(this.ytDlpPath, ['--rm-cache-dir'], { windowsHide: true });
            ytdlp.on('close', resolve);
            ytdlp.on('error', resolve);
        });
    }

    /**
     * Buscador Avanzado con Smart Ranking prioritario de calidad VEVO / Audio Oficial / 4K
     * @param {string} query
     * @param {number} limit
     * @param {string} type - 'music' | 'video' | 'all'
     */
    search(query, limit = 15, type = 'all') {
        return new Promise((resolve) => {
            let searchQuery = query;
            if (
                type === 'music' &&
                !query.toLowerCase().includes('audio') &&
                !query.toLowerCase().includes('music')
            ) {
                searchQuery = `${query} official audio`;
            }

            const args = [
                ...this._cookieArgs(),
                `ytsearch${limit}:${searchQuery}`,
                '--dump-json',
                '--flat-playlist',
                '--no-warnings',
                '--socket-timeout',
                '15'
            ];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            let stdout = '';

            const timeout = setTimeout(() => {
                ytdlp.kill();
                resolve([]);
            }, 20000);

            ytdlp.stdout.on('data', (d) => (stdout += d.toString()));

            ytdlp.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0 && stdout) {
                    try {
                        const lines = stdout
                            .trim()
                            .split('\n')
                            .filter((l) => l.trim());
                        const parsedResults = lines
                            .map((line) => {
                                try {
                                    return JSON.parse(line);
                                } catch (e) {
                                    return null;
                                }
                            })
                            .filter((item) => item && item.title);

                        const normalized = parsedResults
                            .map((info) => {
                                const norm = this._normalizeInfo(info);
                                if (norm) {
                                    const clean = parseCleanMetadata(norm.title, norm.uploader);
                                    norm.cleanTitle = clean.title;
                                    norm.cleanArtist = clean.artist;
                                }
                                return norm;
                            })
                            .filter(Boolean);

                        // Smart Ranking Prioritario
                        normalized.sort((a, b) => {
                            const titleA = (a.title || '').toLowerCase();
                            const titleB = (b.title || '').toLowerCase();
                            const uploaderA = (a.uploader || '').toLowerCase();
                            const uploaderB = (b.uploader || '').toLowerCase();

                            const isOfficialA =
                                uploaderA.includes('vevo') ||
                                uploaderA.includes('topic') ||
                                titleA.includes('official audio');
                            const isOfficialB =
                                uploaderB.includes('vevo') ||
                                uploaderB.includes('topic') ||
                                titleB.includes('official audio');

                            if (isOfficialA && !isOfficialB) {
                                return -1;
                            }
                            if (!isOfficialA && isOfficialB) {
                                return 1;
                            }
                            return 0;
                        });

                        resolve(normalized);
                    } catch (e) {
                        resolve([]);
                    }
                } else {
                    resolve([]);
                }
            });

            ytdlp.on('error', () => {
                clearTimeout(timeout);
                resolve([]);
            });
        });
    }

    _prepareOutputPath(outputPath) {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        try {
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        } catch (error) {
            logger.warn(`No se pudo limpiar el archivo previo ${outputPath}:`, error.message);
        }

        return outputPath;
    }

    _parseError(stderr) {
        const text = stderr || '';
        if (text.includes('Video unavailable')) {
            return 'El video no está disponible';
        }
        if (text.includes('Private video')) {
            return 'El video es privado';
        }
        if (text.includes('Sign in to confirm your age')) {
            return 'Este video requiere autenticación o edad confirmada';
        }
        if (text.includes('confirm you\'re not a bot') || text.includes('not a bot')) {
            return 'YouTube pidió verificación anti-bot. Abre el menú, activa "Usar cookies del navegador" y vuelve a intentarlo';
        }
        if (text.includes('Requested formats are incompatible')) {
            return 'No se pudo combinar el video y el audio para este formato';
        }
        if (text.includes('No video formats found')) {
            return 'No se encontraron formatos de video compatibles';
        }
        return null;
    }
}

module.exports = DownloadService;

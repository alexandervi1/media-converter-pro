'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const https = require('https');
const logger = require('../utils/logger');
const { sanitizeFileName } = require('../utils/validators');

/**
 * DownloadService
 * Encapsula la lógica compleja de yt-dlp y ffmpeg.
 * No sabe nada de "colas", solo ejecuta instrucciones de descarga/conversión.
 */
class DownloadService {
    constructor() {
        // Configuración de paths
        this.ffmpegPath = app.isPackaged
            ? path.join(process.resourcesPath, 'ffmpeg.exe')
            : require('ffmpeg-static');

        process.env.FFMPEG_PATH = this.ffmpegPath;

        this.ytDlpDir = path.join(app.getPath('userData'), 'bin');
        this.ytDlpPath = path.join(this.ytDlpDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    }

    /**
     * Inicializa el servicio (verifica binarios)
     */
    async initialize() {
        try {
            await this.ensureYtDlpExists();
            return true;
        } catch (error) {
            logger.error('Fallo al inicializar DownloadService:', error);
            return false;
        }
    }

    /**
     * Verifica si yt-dlp existe y lo descarga si es necesario
     */
    async ensureYtDlpExists() {
        if (fs.existsSync(this.ytDlpPath)) {
            logger.info('yt-dlp encontrado en:', this.ytDlpPath);
            return;
        }

        if (!fs.existsSync(this.ytDlpDir)) {
            fs.mkdirSync(this.ytDlpDir, { recursive: true });
        }

        logger.info('Descargando yt-dlp...');

        const downloadUrl = process.platform === 'win32'
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
     * Obtiene metadata de un video
     */
    async getVideoInfo(url) {
        if (!fs.existsSync(this.ytDlpPath)) return null;

        return new Promise((resolve) => {
            const args = [
                url, '-j', '--no-warnings', '--no-playlist',
                '--playlist-items', '1', '--socket-timeout', '5', '--no-cache-dir'
            ];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            let stdout = '';

            const timeout = setTimeout(() => {
                ytdlp.kill();
                resolve(null);
            }, 10000);

            ytdlp.stdout.on('data', d => stdout += d.toString());

            ytdlp.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0 && stdout) {
                    try {
                        const info = JSON.parse(stdout);
                        resolve(this._normalizeInfo(info));
                    } catch (e) { resolve(null); }
                } else {
                    resolve(null);
                }
            });

            ytdlp.on('error', () => {
                clearTimeout(timeout);
                resolve(null);
            });
        });
    }

    _normalizeInfo(info) {
        let thumbnailUrl = info.thumbnail;
        if (!thumbnailUrl && info.thumbnails?.length > 0) {
            const sorted = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
            thumbnailUrl = sorted[0]?.url;
        }
        if (!thumbnailUrl && info.id) {
            thumbnailUrl = `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg`;
        }

        // Extract available video qualities from formats
        const standardQualities = [144, 240, 360, 480, 720, 1080, 1440, 2160];
        let availableQualities = [];

        if (info.formats && Array.isArray(info.formats)) {
            const heights = new Set();
            info.formats.forEach(f => {
                if (f.height && f.vcodec && f.vcodec !== 'none') {
                    heights.add(f.height);
                }
            });
            // Map to standard qualities (closest match)
            availableQualities = standardQualities.filter(q => {
                // Check if this quality or a close one exists
                for (const h of heights) {
                    if (Math.abs(h - q) <= 20) return true; // Within 20px tolerance
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
            availableQualities: availableQualities
        };
    }

    /**
     * Descarga el audio de mejor calidad (WebM/Opus) a un path temporal
     * @param {string} url 
     * @param {string} outputPath 
     * @param {Function} onProgress (percent) => void
     */
    downloadBestAudio(url, outputPath, onProgress) {
        return new Promise((resolve, reject) => {
            const args = [
                url, '-o', outputPath, '--no-warnings', '-f', 'bestaudio',
                '--no-playlist', '-N', '4', '--no-mtime', '--socket-timeout', '15',
                '--retries', '5', '--force-overwrites', '--newline',
                '--progress-template', '%(progress._percent_str)s'
            ];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            let stderr = '';

            ytdlp.stdout.on('data', (data) => {
                const output = data.toString();
                const percentMatch = output.match(/(\d+\.?\d*)%/);
                if (percentMatch) {
                    const percent = parseFloat(percentMatch[1]);
                    if (!isNaN(percent)) onProgress(percent);
                }
            });

            ytdlp.stderr.on('data', d => stderr += d.toString());

            ytdlp.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`yt-dlp error code ${code}: ${stderr.slice(0, 100)}`));
            });
            ytdlp.on('error', reject);
        });
    }

    /**
     * Descarga Video MP4 Directamente
     */
    downloadVideo(url, outputPath, quality, onProgress) {
        return new Promise((resolve, reject) => {
            const formatStr = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`;
            const args = [
                url, '-o', outputPath, '--no-warnings', '-f', formatStr,
                '--no-playlist', '--merge-output-format', 'mp4',
                '--ffmpeg-location', this.ffmpegPath, '-N', '4', '--no-mtime',
                '--force-overwrites', '--newline', '--progress-template', '%(progress._percent_str)s'
            ];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            let stderr = '';

            ytdlp.stdout.on('data', (data) => {
                const output = data.toString();
                const percentMatch = output.match(/(\d+\.?\d*)%/);
                if (percentMatch) {
                    const percent = parseFloat(percentMatch[1]);
                    if (!isNaN(percent)) onProgress(percent);
                }
            });

            ytdlp.stderr.on('data', d => stderr += d.toString());

            ytdlp.on('close', code => {
                if (code === 0) resolve();
                else reject(new Error(this._parseError(stderr) || 'Error descargando video'));
            });

            ytdlp.on('error', reject);
        });
    }

    /**
     * Convierte de WebM/Opus a M4A/AAC
     */
    convertToAAC(inputPath, outputPath, onProgress) {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(this.ffmpegPath);
        const os = require('os');
        const threads = Math.max(os.cpus().length, 2);

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('aac')
                .audioBitrate(256)
                .audioChannels(2)
                .outputOptions([`-threads ${threads}`])
                .on('progress', (p) => {
                    const percent = p.percent || 0;
                    onProgress(percent);
                })
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });
    }

    /**
     * Convierte de audio a MP3 (320kbps)
     */
    convertToMp3(inputPath, outputPath, onProgress) {
        const ffmpeg = require('fluent-ffmpeg');
        ffmpeg.setFfmpegPath(this.ffmpegPath);
        const os = require('os');
        const threads = Math.max(os.cpus().length, 2);

        return new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('libmp3lame')
                .audioBitrate(320)
                .audioChannels(2)
                .outputOptions([
                    `-threads ${threads}`,
                    '-q:a 0',
                    '-compression_level 0'
                ])
                .on('progress', (p) => {
                    const percent = p.percent || 0;
                    onProgress(percent);
                })
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });
    }

    /**
     * Limpia cache de yt-dlp
     */
    clearCache() {
        return new Promise((resolve) => {
            const ytdlp = spawn(this.ytDlpPath, ['--rm-cache-dir'], { windowsHide: true });
            ytdlp.on('close', resolve);
            ytdlp.on('error', resolve);
        });
    }

    /**
     * Busca en YouTube
     */
    search(query, limit = 10) {
        return new Promise((resolve) => {
            const searchQuery = `ytsearch${limit}:${query}`;
            const args = [searchQuery, '--dump-json', '--flat-playlist', '--no-warnings', '--socket-timeout', '15'];

            const ytdlp = spawn(this.ytDlpPath, args, { windowsHide: true });
            let stdout = '';
            let stderr = ''; // Added to avoid unbound variable if I logic expands

            const timeout = setTimeout(() => {
                ytdlp.kill();
                resolve([]);
            }, 20000);

            ytdlp.stdout.on('data', d => stdout += d.toString());

            ytdlp.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0 && stdout) {
                    try {
                        const lines = stdout.trim().split('\n').filter(l => l.trim());
                        const results = lines.map(line => {
                            try { return JSON.parse(line); } catch (e) { return null; }
                        }).filter(item => item && item.title);

                        resolve(results.map(this._normalizeInfo));
                    } catch (e) { resolve([]); }
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

    _parseError(stderr) {
        if (stderr.includes('Video unavailable')) return 'El video no está disponible';
        if (stderr.includes('Private video')) return 'El video es privado';
        return null;
    }
}

module.exports = new DownloadService();

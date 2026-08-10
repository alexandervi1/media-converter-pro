'use strict';

const { ipcMain, dialog, app } = require('electron');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { getMainWindow } = require('../window');

// FFmpeg path - diferente en desarrollo vs producción
const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : require('ffmpeg-static');

// Configurar path de FFmpeg
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Codecs soportados por formato
 */
const CODECS = {
    mp3: { audio: 'libmp3lame', video: null },
    mp4: { audio: 'aac', video: 'libx264' },
    wav: { audio: 'pcm_s16le', video: null },
    aac: { audio: 'aac', video: null },
    flac: { audio: 'flac', video: null }
};

/**
 * Extensiones de archivo soportadas para entrada
 */
const SUPPORTED_EXTENSIONS = [
    'mp4',
    'mov',
    'mkv',
    'flv',
    'wmv',
    'webm',
    'mp3',
    'wav',
    'ogg',
    'm4a'
];

/**
 * Registra los handlers IPC para conversión de archivos
 */
function registerConverterHandlers() {
    ipcMain.handle('converter:convert', handleConvertFile);
    ipcMain.handle('converter:get-metadata', handleGetMetadata);
    logger.info('Handlers de conversión registrados');
}

/**
 * Maneja la conversión de archivos locales
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} params
 * @param {string} params.inputPath Ruta del archivo de entrada
 * @param {string} params.targetFormat Formato de salida
 * @returns {Promise<{success: boolean, path?: string, message?: string}>}
 */
async function handleConvertFile(event, { inputPath, targetFormat }) {
    const mainWindow = getMainWindow();

    // Validar archivo de entrada
    if (!inputPath || !fs.existsSync(inputPath)) {
        logger.warn('Archivo de entrada no encontrado:', inputPath);
        return { success: false, message: 'Archivo no encontrado' };
    }

    const inputExt = path.extname(inputPath).slice(1).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(inputExt)) {
        return { success: false, message: `Formato "${inputExt}" no soportado` };
    }

    // Nombre base del archivo
    const baseName = path.basename(inputPath, path.extname(inputPath));

    // Diálogo para guardar
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Guardar archivo convertido',
        defaultPath: `${baseName}_converted.${targetFormat}`,
        filters: [{ name: targetFormat.toUpperCase(), extensions: [targetFormat] }]
    });

    if (canceled || !filePath) {
        logger.info('Conversión cancelada por el usuario');
        return { success: false, message: 'Conversión cancelada' };
    }

    logger.info(`Convirtiendo: ${inputPath} -> ${filePath}`);

    return new Promise((resolve) => {
        const codec = CODECS[targetFormat] || CODECS.mp4;

        let command = ffmpeg(inputPath).output(filePath).format(targetFormat);

        // Aplicar codecs según formato
        if (codec.audio) {
            command = command.audioCodec(codec.audio);

            // Alta calidad de audio para MP3
            if (targetFormat === 'mp3') {
                command = command.audioBitrate('320k');
            }
        }

        if (codec.video) {
            command = command.videoCodec(codec.video);
            // Preset rápido con buena calidad
            command = command.outputOptions(['-preset', 'fast', '-crf', '22']);
        }

        // Solo audio si el formato de salida es audio
        if (['mp3', 'wav', 'aac', 'flac'].includes(targetFormat)) {
            command = command.noVideo();
        }

        command
            .on('start', (cmdLine) => {
                logger.debug('FFmpeg comando:', cmdLine);
            })
            .on('progress', (progress) => {
                // Enviar progreso al renderer si es necesario
                if (mainWindow && progress.percent) {
                    mainWindow.webContents.send('converter:progress', {
                        percent: Math.round(progress.percent)
                    });
                }
            })
            .on('end', () => {
                logger.info(`Conversión completada: ${filePath}`);
                resolve({ success: true, path: filePath });
            })
            .on('error', (err) => {
                logger.error('Error en conversión:', err.message);
                resolve({
                    success: false,
                    message: parseFFmpegError(err.message)
                });
            })
            .run();
    });
}

/**
 * Obtiene metadatos de un archivo multimedia
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Object} params
 * @param {string} params.filePath Ruta del archivo
 * @returns {Promise<{success: boolean, metadata?: Object, message?: string}>}
 */
async function handleGetMetadata(event, { filePath }) {
    if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, message: 'Archivo no encontrado' };
    }

    return new Promise((resolve) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                logger.error('Error obteniendo metadatos:', err.message);
                resolve({ success: false, message: 'No se pudieron obtener los metadatos' });
                return;
            }

            const format = metadata.format;
            const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
            const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

            resolve({
                success: true,
                metadata: {
                    duration: format.duration,
                    size: format.size,
                    bitrate: format.bit_rate,
                    format: format.format_name,
                    video: videoStream
                        ? {
                              codec: videoStream.codec_name,
                              width: videoStream.width,
                              height: videoStream.height,
                              fps: parseFrameRate(videoStream.r_frame_rate)
                          }
                        : null,
                    audio: audioStream
                        ? {
                              codec: audioStream.codec_name,
                              channels: audioStream.channels,
                              sampleRate: audioStream.sample_rate
                          }
                        : null
                }
            });
        });
    });
}

/**
 * Parsea frame rate de formato "num/den" a número decimal
 * Reemplaza eval() inseguro con parsing manual
 * @param {string} frameRate - Ej: "30000/1001" o "30"
 * @returns {number} Frame rate decimal
 */
function parseFrameRate(frameRate) {
    if (!frameRate) return 0;

    // Si es un número directo
    if (!frameRate.includes('/')) {
        return parseFloat(frameRate) || 0;
    }

    // Formato "numerator/denominator"
    const [num, den] = frameRate.split('/').map(Number);
    if (den === 0 || isNaN(num) || isNaN(den)) return 0;

    return Math.round((num / den) * 100) / 100;
}

/**
 * Parsea errores de FFmpeg para mensajes amigables
 * @param {string} errorMessage
 * @returns {string}
 */
function parseFFmpegError(errorMessage) {
    if (errorMessage.includes('Invalid data')) {
        return 'El archivo está corrupto o no es válido';
    }
    if (errorMessage.includes('Permission denied')) {
        return 'Sin permisos para acceder al archivo';
    }
    if (errorMessage.includes('No such file')) {
        return 'Archivo no encontrado';
    }
    return 'Error durante la conversión. Intenta con otro archivo.';
}

module.exports = { registerConverterHandlers };

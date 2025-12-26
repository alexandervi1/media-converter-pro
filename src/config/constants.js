'use strict';

/**
 * Constantes centralizadas de la aplicación
 * @module config/constants
 */

/**
 * Formatos de descarga soportados
 */
const FORMATS = Object.freeze({
    M4A: 'm4a',
    MP3: 'mp3',
    MP4: 'mp4'
});

/**
 * Calidades de video disponibles
 */
const QUALITIES = Object.freeze({
    FULL_HD: 1080,
    HD: 720,
    SD: 480
});

/**
 * Timeouts en milisegundos
 */
const TIMEOUTS = Object.freeze({
    VIDEO_INFO: 10000,      // Timeout para obtener info del video
    SOCKET: 15000,          // Timeout de socket para yt-dlp
    DOWNLOAD: 300000        // Timeout máximo de descarga (5 min)
});

/**
 * Configuración de descarga
 */
const DOWNLOAD_CONFIG = Object.freeze({
    PARALLEL_CONNECTIONS: 4,    // Conexiones paralelas de yt-dlp
    RETRIES: 5,                 // Reintentos en caso de error
    AUDIO_BITRATE: '320k'       // Bitrate para MP3
});

/**
 * Estados de la cola de descargas
 */
const DOWNLOAD_STATUS = Object.freeze({
    PENDING: 'pending',
    DOWNLOADING: 'downloading',
    CONVERTING: 'converting',
    COMPLETED: 'completed',
    ERROR: 'error'
});

/**
 * Patrones de URL de YouTube válidos
 */
const YOUTUBE_URL_PATTERNS = [
    /youtube\.com\/watch\?v=/,
    /youtu\.be\//,
    /youtube\.com\/shorts\//,
    /youtube\.com\/embed\//
];

/**
 * Extensiones de archivo soportadas para conversión
 */
const SUPPORTED_EXTENSIONS = Object.freeze({
    VIDEO: ['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm'],
    AUDIO: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']
});

module.exports = {
    FORMATS,
    QUALITIES,
    TIMEOUTS,
    DOWNLOAD_CONFIG,
    DOWNLOAD_STATUS,
    YOUTUBE_URL_PATTERNS,
    SUPPORTED_EXTENSIONS
};

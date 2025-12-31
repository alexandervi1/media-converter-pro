'use strict';

/**
 * Utilidades de validación
 * @module utils/validators
 */

const { YOUTUBE_URL_PATTERNS } = require('../../config/constants');

/**
 * Verifica si una URL es válida de YouTube
 * @param {string} url - URL a validar
 * @returns {boolean} true si es URL válida de YouTube
 */
function isValidYouTubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return YOUTUBE_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Extrae el ID del video de una URL de YouTube
 * @param {string} url - URL de YouTube
 * @returns {string|null} ID del video o null
 */
function extractVideoId(url) {
    if (!url) return null;

    // youtube.com/watch?v=ID
    const watchMatch = url.match(/[?&]v=([^&]+)/);
    if (watchMatch) return watchMatch[1];

    // youtu.be/ID
    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    if (shortMatch) return shortMatch[1];

    // youtube.com/shorts/ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&]+)/);
    if (shortsMatch) return shortsMatch[1];

    // youtube.com/embed/ID
    const embedMatch = url.match(/youtube\.com\/embed\/([^?&]+)/);
    if (embedMatch) return embedMatch[1];

    return null;
}

/**
 * Sanitiza un nombre de archivo removiendo caracteres no válidos
 * @param {string} name - Nombre a sanitizar
 * @returns {string} Nombre sanitizado
 */
function sanitizeFileName(name) {
    if (!name || typeof name !== 'string') return 'video';

    return name
        .replace(/[<>:"/\\|?*]/g, '')  // Caracteres no válidos en Windows
        .replace(/\s+/g, ' ')           // Múltiples espacios → uno
        .trim()
        .slice(0, 200)                  // Límite de longitud
        || 'video';
}

/**
 * Valida que un formato sea soportado
 * @param {string} format - Formato a validar
 * @param {string[]} validFormats - Lista de formatos válidos
 * @returns {boolean}
 */
function isValidFormat(format, validFormats) {
    return validFormats.includes(format);
}

/**
 * Patrones de URL de Spotify
 */
const SPOTIFY_URL_PATTERNS = [
    /open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/,
    /open\.spotify\.com\/album\/[a-zA-Z0-9]+/,
    /spotify\.link\/[a-zA-Z0-9]+/
];

/**
 * Verifica si una URL es válida de Spotify
 * @param {string} url - URL a validar
 * @returns {boolean} true si es URL válida de Spotify
 */
function isValidSpotifyUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return SPOTIFY_URL_PATTERNS.some(pattern => pattern.test(url));
}

/**
 * Extrae el ID y tipo de una URL de Spotify
 * @param {string} url - URL de Spotify
 * @returns {{type: string, id: string}|null}
 */
function extractSpotifyId(url) {
    if (!url) return null;
    const match = url.match(/open\.spotify\.com\/(playlist|album)\/([a-zA-Z0-9]+)/);
    if (match) {
        return { type: match[1], id: match[2] };
    }
    return null;
}

module.exports = {
    isValidYouTubeUrl,
    extractVideoId,
    sanitizeFileName,
    isValidFormat,
    isValidSpotifyUrl,
    extractSpotifyId
};

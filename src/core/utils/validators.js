'use strict';

/**
 * Utilidades de validación y limpieza de metadatos
 * @module utils/validators
 */

const { YOUTUBE_URL_PATTERNS } = require('../constants');

/**
 * Verifica si una URL es válida de YouTube
 */
function isValidYouTubeUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    return YOUTUBE_URL_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Extrae el ID del video de una URL de YouTube
 */
function extractVideoId(url) {
    if (!url) {
        return null;
    }

    const watchMatch = url.match(/[?&]v=([^&]+)/);
    if (watchMatch) {
        return watchMatch[1];
    }

    const shortMatch = url.match(/youtu\.be\/([^?&]+)/);
    if (shortMatch) {
        return shortMatch[1];
    }

    const shortsMatch = url.match(/youtube\.com\/shorts\/([^?&]+)/);
    if (shortsMatch) {
        return shortsMatch[1];
    }

    const embedMatch = url.match(/youtube\.com\/embed\/([^?&]+)/);
    if (embedMatch) {
        return embedMatch[1];
    }

    return null;
}

/**
 * Sanitiza un nombre de archivo removiendo caracteres no válidos
 */
function sanitizeFileName(name) {
    if (!name || typeof name !== 'string') {
        return 'media_file';
    }

    return (
        name
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 200) || 'media_file'
    );
}

/**
 * Limpia y normaliza títulos de canciones/videos de YouTube
 * Remueve etiquetas sobrantes como (Official Video), [4K], [Audio], etc.
 * Separa artista y canción si el título incluye ' - '
 */
function parseCleanMetadata(rawTitle, rawUploader) {
    if (!rawTitle) {
        return { title: 'Desconocido', artist: rawUploader || 'Unknown Artist' };
    }

    const cleaned = rawTitle
        // Remover patrones molestos entre paréntesis o corchetes
        .replace(
            /[([](official\s*(music\s*)?(video|audio|lyric\s*video|visualizer|hd|4k|film)|video\s*oficial|audio\s*oficial|letra|lyrics|4k|hd|remastered|explicit)[)\]]/gi,
            ''
        )
        // Remover hashtags o sufijos comunes
        .replace(/#\w+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    let artist = rawUploader
        ? rawUploader
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .trim()
        : 'Unknown Artist';
    let title = cleaned;

    // Si el título contiene "Artista - Canción"
    if (cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        if (parts.length >= 2) {
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
        }
    }

    return {
        title: title || rawTitle,
        artist: artist || 'Unknown Artist'
    };
}

function isValidFormat(format, validFormats) {
    return validFormats.includes(format);
}

const SPOTIFY_URL_PATTERNS = [
    /open\.spotify\.com\/playlist\/[a-zA-Z0-9]+/,
    /open\.spotify\.com\/album\/[a-zA-Z0-9]+/,
    /open\.spotify\.com\/track\/[a-zA-Z0-9]+/,
    /spotify\.link\/[a-zA-Z0-9]+/
];

function isValidSpotifyUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    return SPOTIFY_URL_PATTERNS.some((pattern) => pattern.test(url));
}

function extractSpotifyId(url) {
    if (!url) {
        return null;
    }
    const match = url.match(/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
    if (match) {
        return { type: match[1], id: match[2] };
    }
    return null;
}

module.exports = {
    isValidYouTubeUrl,
    extractVideoId,
    sanitizeFileName,
    parseCleanMetadata,
    isValidFormat,
    isValidSpotifyUrl,
    extractSpotifyId
};

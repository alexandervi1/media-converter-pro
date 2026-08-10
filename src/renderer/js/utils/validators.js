'use strict';

/**
 * Utilidades de validación para el renderer
 * @module renderer/validators
 */

/**
 * Patrones válidos de URL de YouTube
 */
const YOUTUBE_PATTERNS = [
    /youtube\.com\/watch\?v=/,
    /youtu\.be\//,
    /youtube\.com\/shorts\//,
    /youtube\.com\/embed\//
];

/**
 * Verifica si una URL es válida de YouTube
 * @param {string} url - URL a validar
 * @returns {boolean}
 */
function isValidYouTubeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return YOUTUBE_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Crea función debounced para evitar llamadas excesivas
 * @param {Function} fn - Función a ejecutar
 * @param {number} delay - Delay en ms
 * @returns {Function}
 */
function debounce(fn, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { isValidYouTubeUrl, escapeHtml, debounce };
} else {
    window.isValidYouTubeUrl = isValidYouTubeUrl;
    window.escapeHtml = escapeHtml;
    window.debounce = debounce;
}

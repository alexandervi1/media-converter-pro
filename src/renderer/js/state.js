'use strict';

/**
 * Estado centralizado de la aplicación
 * @module renderer/state
 */

const AppState = {
    /** @type {Array} Lista de descargas en cola */
    downloads: [],

    /** @type {string} Carpeta de descargas seleccionada */
    downloadFolder: '',

    /** @type {boolean} Si hay descargas en proceso */
    isProcessing: false,

    /** @type {Object|null} Vista previa del video actual */
    currentPreview: null,

    /** @type {string} Formato seleccionado: 'm4a' | 'mp3' | 'mp4' */
    selectedFormat: 'm4a',

    /** @type {number} Calidad de video: 1080 | 720 | 480 */
    selectedQuality: 1080,

    /** @type {Array} Resultados de búsqueda */
    searchResults: [],

    /** @type {string} Modo actual: 'url' | 'search' */
    currentMode: 'url'
};

/**
 * Actualiza el estado de la aplicación
 * @param {Object} updates - Propiedades a actualizar
 */
function updateState(updates) {
    Object.assign(AppState, updates);
}

/**
 * Reinicia el estado a valores por defecto
 */
function resetState() {
    AppState.downloads = [];
    AppState.isProcessing = false;
    AppState.currentPreview = null;
    AppState.searchResults = [];
}

// Exportar como singleton
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppState, updateState, resetState };
} else {
    window.AppState = AppState;
    window.updateState = updateState;
    window.resetState = resetState;
}

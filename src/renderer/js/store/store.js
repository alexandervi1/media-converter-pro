/**
 * Store centralizado de la aplicación
 * Implementa un patrón Observer simple para manejo de estado reactivo.
 */
class Store {
    constructor() {
        this.state = {
            downloads: [],
            downloadFolder: '',
            isProcessing: false,
            currentPreview: null,
            selectedFormat: 'm4a', // 'm4a', 'mp3', 'mp4'
            selectedQuality: 1080, // 1080, 720, 480
            searchResults: [],
            currentMode: 'url',    // 'url', 'search', 'spotify', 'downloads'

            // Spotify
            spotifyPlaylist: null,
            spotifyTracks: [],
            spotifyDownloading: false
        };

        this.listeners = new Set();
    }

    /**
     * Obtiene el estado actual (copia)
     */
    getState() {
        return { ...this.state };
    }

    /**
     * Actualiza el estado y notifica suscriptores
     * @param {Object} partialState - Objeto con claves a actualizar
     */
    setState(partialState) {
        const prevState = { ...this.state };
        this.state = { ...this.state, ...partialState };

        // Notificar cambios
        this.notify(prevState);
    }

    /**
     * Suscribe una función a los cambios
     * @param {Function} listener - (state, prevState) => void
     * @returns {Function} Función para desuscribir
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify(prevState) {
        for (const listener of this.listeners) {
            listener(this.state, prevState);
        }
    }
}

export const store = new Store();

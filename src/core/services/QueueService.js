'use strict';

/**
 * QueueService
 * Gestión centralizada del estado de la cola de descargas.
 * Mantiene la lista de descargas y su estado, sin saber CÓMO se descargan.
 */
class QueueService {
    constructor() {
        this.queue = [];
        this.currentId = 0;
        this.isProcessing = false;
        // Map para guardar promesas de info y evitar problemas de serialización
        this.infoPromises = new Map();
    }

    /**
     * Obtiene todos los items de la cola
     */
    getAll() {
        return this.queue;
    }

    /**
     * Obtiene los items pendientes
     */
    getPending() {
        return this.queue.filter((item) => item.status === 'pending');
    }

    /**
     * Añade un item a la cola
     * @param {Object} data - Datos iniciales (url, format, quality)
     * @returns {Object} El item creado
     */
    add(data) {
        this.currentId++;

        const item = {
            id: this.currentId,
            url: data.url,
            format: data.format || 'mp3',
            quality: data.quality || 1080,
            title: data.title || 'Obteniendo título...',
            thumbnail: data.thumbnail || null,
            duration: data.duration || 0,
            status: 'pending',
            progress: 0,
            error: null,
            filePath: null,
            addedAt: Date.now(),
            // Preserve extra metadata for Spotify/Search resolution
            searchQuery: data.searchQuery || null,
            artist: data.artist || null,
            name: data.name || null,
            source: data.source || 'youtube'
        };

        this.queue.push(item);
        return item;
    }

    /**
     * Elimina un item por ID
     * @param {number} id
     */
    remove(id) {
        // Solo eliminamos si no se está descargando activamente (o dejamos la lógica de cancelación para después)
        // Por ahora mantenemos la lógica original: filtrar los que NO son el ID dado
        // PERO si se está descargando, la logica original lo permitía?
        // Original: downloadQueue.filter(item => item.id !== id || item.status === 'downloading');
        // Esto significa: "Mantenlo si NO es el ID, O SI es el ID pero se está descargando"
        // -> Es decir, NO borraba items activos.

        // Permitimos eliminar cualquier item, incluso si se está descargando (Soft Cancel)
        this.queue = this.queue.filter((item) => item.id !== id);
        this.infoPromises.delete(id);
    }

    /**
     * Limpia items completados o erróneos
     */
    clearCompleted() {
        this.queue = this.queue.filter(
            (item) => item.status === 'downloading' || item.status === 'converting'
        );
    }

    /**
     * Actualiza el estado de procesamiento
     */
    setProcessing(isProcessing) {
        this.isProcessing = isProcessing;
    }

    getProcessing() {
        return this.isProcessing;
    }

    /**
     * Actualiza propiedades de un item
     * @param {number} id
     * @param {Object} updates
     */
    updateItem(id, updates) {
        const item = this.queue.find((i) => i.id === id);
        if (item) {
            Object.assign(item, updates);
            return item;
        }
        return null;
    }

    /**
     * Gestión de promesas de información (metadata)
     */
    setInfoPromise(id, promise) {
        this.infoPromises.set(id, promise);
    }

    getInfoPromise(id) {
        return this.infoPromises.get(id);
    }

    removeInfoPromise(id) {
        this.infoPromises.delete(id);
    }
}

// Singleton
module.exports = new QueueService();

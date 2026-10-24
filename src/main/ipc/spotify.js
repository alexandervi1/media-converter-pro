'use strict';

const { ipcMain, app } = require('electron');
const logger = require('../utils/logger');
const SpotifyService = require('../services/SpotifyService');
const QueueService = require('../services/QueueService');
const { getMainWindow } = require('../window');

/**
 * Registra los handlers IPC para Spotify
 */
function registerSpotifyHandlers() {
    ipcMain.handle('spotify:parse-playlist', handleParsePlaylist);
    ipcMain.handle('spotify:download-playlist', handleDownloadPlaylist);

    logger.info('Handlers de Spotify registrados (Refactored)');
}

/**
 * Parsea una playlist de Spotify
 */
async function handleParsePlaylist(event, args) {
    const url = args?.url;

    if (!url) {
        return { success: false, message: 'URL requerida' };
    }

    try {
        const playlist = await SpotifyService.parsePlaylist(url);
        return { success: true, playlist };
    } catch (error) {
        logger.error('Error parseando Spotify:', error.message);
        return { success: false, message: error.message };
    }
}

/**
 * Añade las canciones de Spotify a la cola global
 */
async function handleDownloadPlaylist(event, { tracks, format = 'mp3' }) {
    if (!tracks || tracks.length === 0) {
        return { success: false, message: 'No hay canciones para descargar' };
    }

    // Filtrar solo tracks seleccionados
    const selectedTracks = tracks.filter((t) => t.selected !== false);

    if (selectedTracks.length === 0) {
        return { success: false, message: 'No hay canciones seleccionadas' };
    }

    logger.info(`Añadiendo ${selectedTracks.length} canciones de Spotify a la cola global`);

    // Añadir a QueueService
    // Nota: Añadimos 'searchQuery' o 'artist'/'name' para que el procesador lo resuelva
    let addedCount = 0;

    selectedTracks.forEach((track) => {
        // Creamos un item en la cola sin URL, pero con metadata para búsqueda
        QueueService.add({
            url: null, // Se resolverá despues
            searchQuery: `${track.artist} - ${track.name} audio`,
            format,
            title: `${track.artist} - ${track.name}`, // Título provisional
            artist: track.artist,
            name: track.name,
            thumbnail: null, // Podríamos intentar obtenerlo de spotify si parseamos metadata extra
            source: 'spotify'
        });
        addedCount++;
    });

    // Notificar UI de que la cola cambió
    // (QueueService no emite eventos automáticamente al IPC, youtube.js lo hace a menudo)
    // Deberíamos disparar la actualización de la cola
    sendQueueUpdate();

    // Trigger processing si no está corriendo
    // Invocamos el handler start-queue indirectamente o lo dejamos al usuario?
    // UX: Mejor iniciar automáticamente.
    // Como processQueueLoop está en youtube.js (que es el controller principal),
    // lo ideal sería llamar a esa función expuesta.
    // PERO youtube.js no exporta processQueueLoop.

    // OPCIÓN A: El usuario va a la pestaña descargas e inicia.
    // OPCIÓN B: Emitimos un evento interno o requerimos youtube.js (circular dependency risk).
    // OPCIÓN C: QueueService tiene un Listener? No.

    // Vamos a enviar un mensaje al Renderer para que él solicite iniciar la cola?
    // O simplemente confiamos en que el usuario vea la cola llena en la otra pestaña.
    // El comportamiento original era "click download -> starts processing".

    // WORKAROUND: For now, notify renderer success, renderer can call 'youtube:start-queue' if it wants automatic start.
    // Cleanest: Renderer receives success, calls 'startQueue'.

    return { success: true, message: `Añadidas ${addedCount} canciones a la cola` };
}

function sendQueueUpdate() {
    const mainWindow = getMainWindow();
    if (mainWindow) {
        // Enviamos el mismo evento que youtube.js para actualizar la lista principal
        mainWindow.webContents.send('youtube:queue-update', {
            queue: QueueService.getAll(),
            downloadFolder:
                require('../utils/config').loadConfig().downloadFolder || app.getPath('downloads')
        });
    }
}

module.exports = {
    registerSpotifyHandlers
};

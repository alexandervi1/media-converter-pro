'use strict';

const { BrowserWindow } = require('electron');
const path = require('path');
const logger = require('./utils/logger');

let mainWindow = null;

/**
 * Configuración de la ventana principal
 */
const WINDOW_CONFIG = {
    width: 520,
    height: 680,
    minWidth: 480,
    minHeight: 600,
    resizable: true,
    frame: false, // Frameless para diseño custom
    transparent: false,
    backgroundColor: '#1a1a2e',
    show: false, // Mostrar cuando esté lista
    webPreferences: {
        preload: path.join(__dirname, '..', 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false
        // sandbox removed - breaks preload in packaged apps
    }
};

/**
 * Crea la ventana principal de la aplicación
 * @returns {BrowserWindow}
 */
function createMainWindow() {
    logger.info('Creando ventana principal...');

    mainWindow = new BrowserWindow(WINDOW_CONFIG);

    // Cargar el archivo HTML del renderer
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

    // Mostrar ventana cuando esté lista para evitar flash blanco
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        logger.info('Ventana principal visible');
    });

    // Limpiar referencia al cerrar
    mainWindow.on('closed', () => {
        mainWindow = null;
        logger.info('Ventana principal cerrada');
    });

    // DevTools solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    return mainWindow;
}

/**
 * Obtiene la ventana principal
 * @returns {BrowserWindow|null}
 */
function getMainWindow() {
    return mainWindow;
}

module.exports = {
    createMainWindow,
    getMainWindow
};

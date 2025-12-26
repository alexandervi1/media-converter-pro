'use strict';

const path = require('path');
const fs = require('fs');

// Directorio de logs
const LOG_DIR = path.join(process.env.APPDATA || process.env.HOME, 'MediaConverterPro', 'logs');

// Niveles de log
const LOG_LEVELS = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
};

// Colores para consola
const COLORS = {
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m',
    INFO: '\x1b[36m',
    DEBUG: '\x1b[90m',
    RESET: '\x1b[0m'
};

/**
 * Formatea un mensaje de log
 * @param {string} level Nivel del log
 * @param {string} message Mensaje
 * @param {any[]} args Argumentos adicionales
 * @returns {string}
 */
function formatMessage(level, message, args) {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ' ' + args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
    ).join(' ') : '';
    return `[${timestamp}] [${level}] ${message}${argsStr}`;
}

/**
 * Escribe en consola con color
 * @param {string} level Nivel del log
 * @param {string} formattedMessage Mensaje formateado
 */
function writeToConsole(level, formattedMessage) {
    const color = COLORS[level] || COLORS.INFO;
    console.log(`${color}${formattedMessage}${COLORS.RESET}`);
}

/**
 * Logger principal
 */
const logger = {
    /**
     * Log de error
     * @param {string} message 
     * @param {...any} args 
     */
    error(message, ...args) {
        const formatted = formatMessage(LOG_LEVELS.ERROR, message, args);
        writeToConsole(LOG_LEVELS.ERROR, formatted);
    },

    /**
     * Log de advertencia
     * @param {string} message 
     * @param {...any} args 
     */
    warn(message, ...args) {
        const formatted = formatMessage(LOG_LEVELS.WARN, message, args);
        writeToConsole(LOG_LEVELS.WARN, formatted);
    },

    /**
     * Log informativo
     * @param {string} message 
     * @param {...any} args 
     */
    info(message, ...args) {
        const formatted = formatMessage(LOG_LEVELS.INFO, message, args);
        writeToConsole(LOG_LEVELS.INFO, formatted);
    },

    /**
     * Log de debug
     * @param {string} message 
     * @param {...any} args 
     */
    debug(message, ...args) {
        if (process.env.NODE_ENV === 'development') {
            const formatted = formatMessage(LOG_LEVELS.DEBUG, message, args);
            writeToConsole(LOG_LEVELS.DEBUG, formatted);
        }
    }
};

module.exports = logger;

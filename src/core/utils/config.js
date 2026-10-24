'use strict';

const fs = require('fs');

/**
 * Fábrica de almacén de configuración JSON (agnóstico de Electron).
 * @param {string} configPath Ruta absoluta del archivo config.json
 * @param {Object} defaults Valores por defecto (incluye downloadFolder)
 */
function createConfigStore(configPath, defaults) {
    function load() {
        try {
            if (fs.existsSync(configPath)) {
                const data = fs.readFileSync(configPath, 'utf-8');
                return { ...defaults, ...JSON.parse(data) };
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
        return { ...defaults };
    }

    function save(newConfig) {
        try {
            const current = load();
            const updated = { ...current, ...newConfig };
            fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
            return updated;
        } catch (error) {
            console.error('Error saving config:', error);
            return null;
        }
    }

    return { load, save };
}

module.exports = { createConfigStore };

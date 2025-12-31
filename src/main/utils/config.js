const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const configPath = path.join(app.getPath('userData'), 'config.json');

const defaultConfig = {
    downloadFolder: app.getPath('downloads'),
    format: 'mp3', // mp3, m4a, mp4
    quality: '320' // 320, 128
};

function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            return { ...defaultConfig, ...JSON.parse(data) };
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
    return defaultConfig;
}

function saveConfig(newConfig) {
    try {
        const current = loadConfig();
        const updated = { ...current, ...newConfig };
        fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
        return updated;
    } catch (error) {
        console.error('Error saving config:', error);
        return null;
    }
}

module.exports = {
    loadConfig,
    saveConfig
};

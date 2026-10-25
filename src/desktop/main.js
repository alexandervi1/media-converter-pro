'use strict';

const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const { createAppCore } = require('../core');
const { createAppServer } = require('../server');
const flacView = require('./flac-view');
const logger = require('../core/utils/logger');

// Evitar 'Acceso denegado (0x5) GPU Cache Creation failed' en Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

const ffmpegPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg.exe')
    : require('ffmpeg-static');

const version = app.getVersion();

let mainWindow = null;
let core = null;
let server = null;
let serverAddress = null;

// ==========================================
// Token de emparejamiento (estable entre sesiones)
// ==========================================

function getPairingToken() {
    const tokenPath = path.join(app.getPath('userData'), 'server-token');
    try {
        const existing = fs.readFileSync(tokenPath, 'utf-8').trim();
        if (existing) {
            return existing;
        }
    } catch (e) {
        /* primera ejecución */
    }
    const token = crypto.randomBytes(4).toString('hex'); // 8 chars hex
    fs.writeFileSync(tokenPath, token);
    return token;
}

// ==========================================
// LAN
// ==========================================

function getLanIps() {
    const result = [];
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                result.push(iface.address);
            }
        }
    }
    return result;
}

function getLanInfo() {
    const settings = core ? core.getSettings() : {};
    const port = serverAddress ? serverAddress.port : settings.lanPort || 45690;
    return {
        enabled: settings.lanEnabled === true,
        port,
        urls: getLanIps().map((ip) => `http://${ip}:${port}`),
        token: getPairingToken()
    };
}

async function restartServer({ lanEnabled }) {
    const keepPort = serverAddress ? serverAddress.port : core.getSettings().lanPort || 45690;
    await server.close();
    server = createAppServer({
        core,
        staticDir: path.join(__dirname, '..', 'web'),
        token: getPairingToken(),
        version,
        onSelectFolder
    });
    const host = lanEnabled ? '0.0.0.0' : '127.0.0.1';
    const port = lanEnabled ? keepPort : 0;
    serverAddress = await server.listen(host, port);

    const lanInfo = getLanInfo();
    if (lanEnabled) {
        logger.info(`Servidor accesible en LAN: ${lanInfo.urls.join(', ')} (token: ${lanInfo.token})`);
    }
    return lanInfo;
}

// ==========================================
// Ventana
// ==========================================

function createMainWindow(url) {
    mainWindow = new BrowserWindow({
        width: 780,
        height: 760,
        minWidth: 600,
        minHeight: 600,
        resizable: true,
        frame: false,
        transparent: false,
        backgroundColor: '#1a1a2e',
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true
        }
    });

    mainWindow.loadURL(url);

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        logger.info('Ventana principal visible');
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
}

// ==========================================
// Diálogo nativo de carpeta (hook del servidor)
// ==========================================

function onSelectFolder() {
    return new Promise((resolve) => {
        dialog
            .showOpenDialog(mainWindow, {
                title: 'Seleccionar carpeta de descargas',
                defaultPath: core.getSettings().downloadFolder,
                properties: ['openDirectory']
            })
            .then(({ canceled, filePaths }) => {
                resolve(!canceled && filePaths.length > 0 ? filePaths[0] : null);
            })
            .catch(() => resolve(null));
    });
}

// ==========================================
// IPC mínimo (solo lo que HTTP no puede hacer)
// ==========================================

function registerDesktopIpc() {
    ipcMain.handle('window:minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.handle('window:close', () => {
        mainWindow?.close();
    });

    ipcMain.handle('app:get-lan', () => getLanInfo());

    ipcMain.handle('app:set-lan', async (event, { enabled }) => {
        core.saveSettings({ lanEnabled: enabled === true });
        return restartServer({ lanEnabled: enabled === true });
    });

    // Ventana aparte del navegador FLAC (opcional; el webview embebido es
    // la vía principal). Misma partición de sesión para las descargas.
    ipcMain.handle('flac:open-view', () => {
        const result = flacView.openFlacView(core, flacSession);
        return { success: result.success, reused: result.reused };
    });
    ipcMain.handle('flac:open-external', () => {
        const { shell } = require('electron');
        shell.openExternal(flacView.FLAC_SITE_URL);
    });
}

// Sesión compartida del FLAC: webview embebido y ventana aparte
const flacSession = session.fromPartition(`persist:${require('./flac-view').FLAC_PARTITION}`);

// ==========================================
// Ciclo de vida
// ==========================================

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }
    });

    app.whenReady().then(initializeApp);

    app.on('window-all-closed', () => {
        logger.info('Todas las ventanas cerradas. Limpiando procesos...');
        if (core) {
            core.cancelAll();
        }
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('before-quit', () => {
        if (core) {
            core.cancelAll();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0 && serverAddress) {
            createMainWindow(`http://127.0.0.1:${serverAddress.port}`);
        }
    });
}

async function initializeApp() {
    logger.info('Inicializando Media Converter Pro (desktop + servidor local)...');

    core = createAppCore({
        dataDir: app.getPath('userData'),
        defaultDownloadFolder: app.getPath('downloads'),
        ffmpegPath
    });

    const lanEnabled = core.getSettings().lanEnabled === true;
    await core.initialize();

    // Enrutar las descargas del FLAC (webview embebido y ventana aparte)
    flacView.attachFlacDownloadHandler(core, flacSession);

    server = createAppServer({
        core,
        staticDir: path.join(__dirname, '..', 'web'),
        token: getPairingToken(),
        version,
        onSelectFolder
    });
    serverAddress = await server.listen(lanEnabled ? '0.0.0.0' : '127.0.0.1', lanEnabled ? core.getSettings().lanPort || 45690 : 0);

    registerDesktopIpc();
    createMainWindow(`http://127.0.0.1:${serverAddress.port}`);

    if (lanEnabled) {
        const lanInfo = getLanInfo();
        logger.info(`Servidor accesible en LAN: ${lanInfo.urls.join(', ')}`);
    }
    logger.info(`Aplicación iniciada (UI en http://127.0.0.1:${serverAddress.port})`);
}

process.on('uncaughtException', (error) => {
    logger.error('Error no capturado:', error);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Promesa rechazada no manejada:', reason);
});

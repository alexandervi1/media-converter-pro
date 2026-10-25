'use strict';

/**
 * Test del navegador FLAC integrado (corre DENTRO de Electron):
 *   bunx electron scripts/flac-view-test.js
 * Abre la ventana FLAC con el handler real de will-download, fuerza una
 * descarga directa y verifica que el archivo aterriza organizado en
 * <downloadFolder>/flac/. Sale con código 0 si todo pasa.
 */

const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const { createAppCore } = require('../src/core');
const { attachFlacDownloadHandler } = require('../src/desktop/flac-view');

async function main() {
    await app.whenReady();

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-flactest-'));
    const core = createAppCore({
        dataDir,
        defaultDownloadFolder: dataDir,
        ffmpegPath: require('ffmpeg-static')
    });
    await core.initialize();

    // servidor local que sirve un archivo "descargable" (attachment)
    const server = http.createServer((req, res) => {
        res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Disposition': 'attachment; filename="Canción de Prueba.mp3"'
        });
        res.end(Buffer.alloc(4096, 7));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}/file`;

    // Sesión de prueba con el handler REAL (igual que persist:flac en la app)
    const testSession = session.fromPartition('persist:flactest');
    attachFlacDownloadHandler(core, testSession);

    const win = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, partition: 'persist:flactest' }
    });
    // La navegación se convierte en descarga: loadURL falla con ERR_FAILED
    // (comportamiento de Chromium); la descarga sigue vía will-download.
    win.loadURL(url).catch(() => {});

    // esperar a que el archivo organizado aparezca (máx 30s)
    const flacDir = path.join(dataDir, 'flac');
    let landed = null;
    for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
            const files = fs.readdirSync(flacDir).filter((f) => f.endsWith('.mp3'));
            if (files.length) {
                landed = files[0];
                break;
            }
        } catch (e) {
            /* carpeta aún no existe */
        }
    }

    const ok = !!landed;
    const size = ok ? fs.statSync(path.join(flacDir, landed)).size : 0;
    console.log(`\n=== FLAC VIEW TEST: ${ok ? 'PASS' : 'FAIL'} ===`);
    if (ok) {
        console.log(`Archivo organizado: ${landed} (${size} bytes)`);
        const list = core.listFlacFiles();
        console.log(`listFlacFiles: ${list.length} archivo(s)`);
    }
    win.destroy();
    server.close();
    core.cancelAll();
    setTimeout(() => {
        try {
            fs.rmSync(dataDir, { recursive: true, force: true });
        } catch (e) {
            /* best-effort */
        }
        app.exit(ok ? 0 : 1);
    }, 500);
}

main().catch((e) => {
    console.error('FLAC VIEW TEST ERROR:', e);
    app.exit(1);
});

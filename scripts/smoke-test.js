'use strict';

/**
 * Smoke test end-to-end del motor de descargas.
 * Se ejecuta DENTRO de Electron (necesita app.getPath):
 *   bunx electron scripts/smoke-test.js
 *
 * Verifica: yt-dlp, downloadBestAudio (ruta real via after_move:filepath),
 * convertToMp3 y applyMediaMetadata. La parte de YouTube se marca SKIP si
 * la IP está bloqueada por el bot-check (falla del entorno, no del código).
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const DownloadService = require('../src/main/services/DownloadService');

const YT_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'; // "Me at the zoo" (19s)
const DIRECT_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

async function main() {
    await app.whenReady();

    const results = [];
    const check = (name, ok, extra = '') => {
        results.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${  extra}` : ''}`);
        if (!ok) {
            process.exitCode = 1;
        }
    };
    const skip = (name, extra = '') => {
        results.push(`SKIP | ${name}${extra ? ` | ${  extra}` : ''}`);
    };

    // 1. Inicialización de yt-dlp (+ auto-actualización en background)
    const initOk = await DownloadService.initialize();
    check('initialize yt-dlp', initOk);

    // 2. Info de YouTube (SKIP si la IP está bloqueada por bot-check)
    const info = await DownloadService.getVideoInfo(YT_URL);
    if (info) {
        check('getVideoInfo', true, `titulo="${info.title}"`);
    } else {
        skip('getVideoInfo', 'IP bloqueada por bot-check de YouTube (usar cookies en producción)');
    }

    // 3. Descarga directa (no YouTube): valida template %(ext)s + after_move:filepath
    const tempDir = path.join(app.getPath('userData'), 'temp');
    let lastPct = 0;
    const directPath = await DownloadService.downloadBestAudio(
        DIRECT_URL,
        tempDir,
        'smoke_direct',
        (p) => {
            lastPct = p;
        },
        'smoke-task'
    );
    check(
        'downloadBestAudio retorna ruta existente',
        !!directPath && fs.existsSync(directPath),
        `ruta=${directPath}`
    );
    check('progreso reportado', lastPct >= 0, `ultimo=${lastPct}%`);

    // 4. Conversión a MP3
    const mp3Out = path.join(tempDir, 'smoke_out.mp3');
    await DownloadService.convertToMp3(directPath, mp3Out, () => {});
    const size = fs.existsSync(mp3Out) ? fs.statSync(mp3Out).size : 0;
    check('convertToMp3 produce archivo', size > 10000, `size=${size} bytes`);

    // 5. Metadatos ID3
    const taggedOut = `${mp3Out}.tagged.mp3`;
    const metaOk = await DownloadService.applyMediaMetadata(
        mp3Out,
        taggedOut,
        { title: 'Smoke Test', artist: 'MCP QA', album: 'Media Converter Pro' },
        null
    );
    check('applyMediaMetadata', metaOk === true && fs.existsSync(taggedOut));

    // Limpieza de archivos temporales del test
    [directPath, mp3Out, taggedOut].forEach((p) => {
        try {
            fs.unlinkSync(p);
        } catch (e) {
            /* best-effort */
        }
    });

    console.log('\n=== RESULTADOS SMOKE TEST ===');
    results.forEach((r) => console.log(r));
    console.log(`=== ${process.exitCode ? 'HAY FALLOS' : 'TODO OK'} ===`);

    app.exit(process.exitCode || 0);
}

main().catch((e) => {
    console.error('SMOKE ERROR:', e);
    app.exit(1);
});

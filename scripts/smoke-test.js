'use strict';

/**
 * Smoke test del core + servidor HTTP (SIN Electron).
 *   bun scripts/smoke-test.js   o   node scripts/smoke-test.js
 *
 * Verifica: AppCore, servidor REST, auth por token (desde IP no-loopback),
 * estáticos, SSE, descarga directa (resolución de ruta real), conversión
 * MP3 y metadatos. La parte de YouTube se marca SKIP si la IP está
 * bloqueada por bot-check (falla del entorno, no del código).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const { createAppCore } = require('../src/core');
const { createAppServer } = require('../src/server');

const DIRECT_URL = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const YT_URL = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';

const results = [];
function check(name, ok, extra = '') {
    results.push(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${  extra}` : ''}`);
    if (!ok) {
        process.exitCode = 1;
    }
}
function skip(name, extra = '') {
    results.push(`SKIP | ${name}${extra ? ` | ${  extra}` : ''}`);
}

function httpJson(port, pathname, { method = 'GET', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, headers },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            }
        );
        req.on('error', reject);
        req.end();
    });
}

function getLanIp() {
    const ips = Object.values(os.networkInterfaces())
        .flat()
        .filter((i) => i && i.family === 'IPv4' && !i.internal);
    return ips.length ? ips[0].address : null;
}

async function main() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-smoke-'));
    const token = crypto.randomBytes(4).toString('hex');

    // ================= core =================
    const core = createAppCore({
        dataDir,
        defaultDownloadFolder: path.join(dataDir, 'downloads'),
        ffmpegPath: require('ffmpeg-static')
    });
    const ready = await core.initialize();
    check('core.initialize (yt-dlp listo)', ready === true);

    const invalidAdd = core.addToQueue({ url: 'https://example.com/media/12345' });
    check('addToQueue rechaza URL que no es de YouTube', invalidAdd.success === false);

    // Info de YouTube (SKIP si bot-check)
    const info = await core.getVideoInfo(YT_URL);
    if (info) {
        check('core.getVideoInfo', true, `titulo="${info.title}"`);
    } else {
        skip('core.getVideoInfo', 'IP bloqueada por bot-check (usar cookies en producción)');
    }

    // Descarga directa: valida template %(ext)s + after_move:filepath
    const downloaded = await core.downloads.downloadBestAudio(
        DIRECT_URL,
        core.downloads.tempDir,
        'smoke_direct',
        () => {},
        'smoke-task'
    );
    check(
        'downloadBestAudio retorna ruta existente',
        !!downloaded && fs.existsSync(downloaded),
        `ruta=${downloaded}`
    );

    const mp3Out = path.join(core.downloads.tempDir, 'smoke_out.mp3');
    await core.downloads.convertToMp3(downloaded, mp3Out, () => {});
    const size = fs.existsSync(mp3Out) ? fs.statSync(mp3Out).size : 0;
    check('convertToMp3 produce archivo', size > 10000, `size=${size} bytes`);

    const taggedOut = `${mp3Out}.tagged.mp3`;
    const metaOk = await core.downloads.applyMediaMetadata(
        mp3Out,
        taggedOut,
        { title: 'Smoke Test', artist: 'MCP QA', album: 'Media Converter Pro' },
        null
    );
    check('applyMediaMetadata (título con espacios)', metaOk === true && fs.existsSync(taggedOut));

    // ================= servidor =================
    const staticDir = path.join(__dirname, '..', 'src', 'web');

    const server = createAppServer({ core, staticDir, token, version: 'smoke' });
    const address = await server.listen('0.0.0.0', 0);
    const port = address.port;

    const health = await httpJson(port, '/api/health');
    check(
        '/api/health desde loopback sin token',
        health.status === 200 && health.body.ok === true && health.body.token === token
    );

    const queue = await httpJson(port, '/api/queue');
    check('/api/queue desde loopback', queue.status === 200 && Array.isArray(queue.body.queue));

    // FLAC: carpeta organizada
    check('listFlacFiles inicia vacío', core.listFlacFiles().length === 0);
    const incoming = path.join(dataDir, 'incoming.flac');
    fs.writeFileSync(incoming, 'x'.repeat(2048));
    const organized = core.organizeIncomingFile(incoming, 'Test Song.flac');
    check(
        'organizeIncomingFile mueve a flac/ con nombre limpio',
        organized.name === 'Test Song.flac' &&
            fs.existsSync(organized.path) &&
            !fs.existsSync(incoming) &&
            organized.path.includes(path.join('flac', 'Test Song.flac'))
    );
    const dup = core.organizeIncomingFile(
        (fs.writeFileSync(incoming, 'y'), incoming),
        'Test Song.flac'
    );
    check('nombre duplicado queda único', dup.name === 'Test Song (1).flac');
    const flacList = await httpJson(port, '/api/flac/list');
    check(
        '/api/flac/list expone los archivos',
        flacList.status === 200 &&
            flacList.body.success === true &&
            flacList.body.files.length === 2
    );

    // Auth desde IP LAN: token incorrecto -> 401, correcto -> 200
    const lanIp = getLanIp();
    if (lanIp) {
        const viaLan = (pathname, headers) =>
            new Promise((resolve, reject) => {
                const req = http.request({ host: lanIp, port, path: pathname, headers }, (res) => {
                    res.resume();
                    res.on('end', () => resolve(res.statusCode));
                });
                req.on('error', reject);
                req.end();
            });
        const noToken = await viaLan('/api/queue', {});
        check('LAN sin token rechazada (401)', noToken === 401);
        const badToken = await viaLan('/api/queue', { 'X-Auth-Token': 'wrong' });
        check('LAN con token incorrecto rechazado (401)', badToken === 401);
        const goodToken = await viaLan('/api/queue', { 'X-Auth-Token': token });
        check('LAN con token válido aceptado (200)', goodToken === 200, `ip=${lanIp}`);
    } else {
        skip('auth LAN (sin IP de red disponible)');
    }

    // Estáticos
    const index = await new Promise((resolve, reject) => {
        http
            .get({ host: '127.0.0.1', port, path: '/' }, (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => resolve({ status: res.statusCode, data }));
            })
            .on('error', reject);
    });
    check(
        'index.html servido',
        index.status === 200 && index.data.includes('Media Converter Pro')
    );

    const traversal = await httpJson(port, '/../package.json');
    check('path traversal bloqueado', traversal.status === 403 || traversal.status === 404);

    // SSE
    const sse = await new Promise((resolve) => {
        let data = '';
        const req = http.get({ host: '127.0.0.1', port, path: '/api/events' }, (res) => {
            res.on('data', (c) => {
                data += c.toString();
                if (data.includes('event: hello')) {
                    req.destroy();
                    resolve(data);
                }
            });
            setTimeout(() => {
                req.destroy();
                resolve(data);
            }, 4000);
        });
        req.on('error', () => resolve(data));
    });
    check('SSE /api/events responde hello', sse.includes('event: hello'));

    // Evento de cola via SSE al añadir item
    const sseQueue = await new Promise((resolve) => {
        let data = '';
        const req = http.get({ host: '127.0.0.1', port, path: '/api/events' }, (res) => {
            res.on('data', (c) => {
                data += c.toString();
                if (data.includes('queue-update')) {
                    req.destroy();
                    resolve(true);
                }
            });
            setTimeout(() => {
                req.destroy();
                resolve(false);
            }, 8000);
        });
        req.on('error', () => resolve(false));
        // dispara un cambio de cola cuando el stream ya está abierto
        setTimeout(() => {
            const addReq = http.request(
                {
                    host: '127.0.0.1',
                    port,
                    path: '/api/queue/add',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                },
                (res) => res.resume()
            );
            addReq.end(
                JSON.stringify({ url: 'https://www.youtube.com/watch?v=smokeTest1', format: 'mp3' })
            );
        }, 500);
    });
    check('SSE emite queue-update al añadir item', sseQueue === true);
    core.clearQueue();

    // ================= cierre =================
    await server.close();
    core.cancelAll();

    console.log('\n=== RESULTADOS SMOKE TEST (core + server) ===');
    results.forEach((r) => console.log(r));
    console.log(`=== ${process.exitCode ? 'HAY FALLOS' : 'TODO OK'} ===`);

    [downloaded, mp3Out, taggedOut].forEach((p) => {
        try {
            fs.unlinkSync(p);
        } catch (e) {
            /* best-effort */
        }
    });
    // En Windows el yt-dlp -U en background puede mantener bloqueado el binario:
    // la limpieza del directorio temporal es best-effort y no falla el test.
    setTimeout(() => {
        try {
            fs.rmSync(dataDir, { recursive: true, force: true });
        } catch (e) {
            console.log(`(limpieza del temp diferida: ${e.code})`);
        }
        process.exit(process.exitCode || 0);
    }, 3000);
}

main().catch((e) => {
    console.error('SMOKE ERROR:', e);
    process.exit(1);
});

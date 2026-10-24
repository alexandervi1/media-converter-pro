'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const logger = require('../core/utils/logger');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json'
};

const MAX_BODY_BYTES = 5 * 1024 * 1024;

function isLoopback(req) {
    const addr = req.socket.remoteAddress || '';
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

/**
 * Servidor HTTP de la app: API REST + SSE + archivos estáticos de src/web.
 * node:http puro: corre igual dentro de Electron (Node) o standalone con Bun/Node.
 *
 * @param {Object} options
 * @param {import('../core').AppCore} options.core
 * @param {string} options.staticDir     Directorio con la UI (src/web)
 * @param {string} options.token         Token de emparejamiento para clientes LAN
 * @param {string} [options.version]
 * @param {() => Promise<string|null>} [options.onSelectFolder]  Diálogo nativo (solo escritorio)
 */
function createAppServer({ core, staticDir, token, version = 'dev', onSelectFolder = null }) {
    const sseClients = new Set();

    core.onEvent((event, payload) => broadcast(event, payload));

    function broadcast(event, payload) {
        if (sseClients.size === 0) {
            return;
        }
        const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        for (const res of sseClients) {
            try {
                res.write(frame);
            } catch (e) {
                sseClients.delete(res);
            }
        }
    }

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const pathname = decodeURIComponent(url.pathname);

            // CORS: la app Android (Capacitor) llama desde otro origen
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            if (pathname === '/api' || pathname.startsWith('/api/')) {
                await handleApi(req, res, url, pathname);
            } else {
                serveStatic(res, pathname);
            }
        } catch (err) {
            logger.error('Error en request:', err.message);
            sendJson(res, 500, { success: false, message: 'Error interno del servidor' });
        }
    });

    // ==========================================
    // API
    // ==========================================

    async function handleApi(req, res, url, pathname) {
        // Auth: localhost sin token (escritorio embebido); LAN requiere token
        if (pathname !== '/api/health' && !isLoopback(req)) {
            const provided = req.headers['x-auth-token'] || url.searchParams.get('token');
            if (provided !== token) {
                sendJson(res, 401, { success: false, message: 'Token inválido' });
                return;
            }
        }

        const parts = pathname.split('/').filter(Boolean); // ['api', ...]

        if (pathname === '/api/health') {
            sendJson(res, 200, {
                ok: true,
                app: 'media-converter-pro',
                version,
                ready: core.ready,
                capabilities: {
                    folderDialog: typeof onSelectFolder === 'function',
                    desktopShell: typeof onSelectFolder === 'function'
                },
                // El token solo se revela al propio escritorio (loopback)
                ...(isLoopback(req) ? { token } : {})
            });
            return;
        }

        if (req.method === 'GET' && pathname === '/api/events') {
            handleSse(req, res);
            return;
        }

        if (req.method === 'GET' && pathname === '/api/queue') {
            sendJson(res, 200, core.getQueue());
            return;
        }

        if (req.method === 'POST' && pathname === '/api/queue/add') {
            const body = await readJson(req);
            sendJson(res, 200, core.addToQueue(body || {}));
            return;
        }

        if (req.method === 'POST' && pathname === '/api/queue/start') {
            sendJson(res, 200, core.startQueue());
            return;
        }

        if (req.method === 'POST' && pathname === '/api/queue/clear') {
            sendJson(res, 200, core.clearQueue());
            return;
        }

        if (req.method === 'DELETE' && parts[1] === 'queue' && parts[2]) {
            sendJson(res, 200, core.removeFromQueue(Number(parts[2])));
            return;
        }

        if (req.method === 'GET' && pathname === '/api/video/info') {
            const info = await core.getVideoInfo(url.searchParams.get('url'));
            if (info) {
                sendJson(res, 200, { success: true, info });
            } else {
                sendJson(res, 200, { success: false, message: 'No se pudo obtener información' });
            }
            return;
        }

        if (req.method === 'GET' && pathname === '/api/search') {
            const results = await core.search(
                url.searchParams.get('q') || '',
                Number(url.searchParams.get('limit')) || 15,
                url.searchParams.get('type') || 'all'
            );
            sendJson(res, 200, { success: true, results });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/spotify/parse') {
            const body = await readJson(req);
            sendJson(res, 200, await core.parseSpotifyPlaylist(body?.url));
            return;
        }

        if (req.method === 'POST' && pathname === '/api/spotify/download') {
            const body = await readJson(req);
            sendJson(res, 200, core.addSpotifyTracks(body || {}));
            return;
        }

        if (req.method === 'GET' && pathname === '/api/settings') {
            sendJson(res, 200, core.getSettings());
            return;
        }

        if (req.method === 'POST' && pathname === '/api/settings') {
            sendJson(res, 200, core.saveSettings(await readJson(req)));
            return;
        }

        if (req.method === 'POST' && pathname === '/api/folder/select') {
            if (typeof onSelectFolder !== 'function') {
                sendJson(res, 501, {
                    success: false,
                    message: 'La selección de carpeta solo está disponible en el escritorio'
                });
                return;
            }
            const folder = await onSelectFolder();
            if (!folder) {
                sendJson(res, 200, { success: false });
                return;
            }
            core.setDownloadFolder(folder);
            sendJson(res, 200, { success: true, folder });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/path/open') {
            const body = await readJson(req);
            sendJson(res, 200, await core.openPath(body?.path));
            return;
        }

        if (req.method === 'GET' && pathname === '/api/flac/list') {
            sendJson(res, 200, { success: true, files: core.listFlacFiles() });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/cache/clear') {
            await core.clearCache();
            sendJson(res, 200, { success: true, message: 'Cache limpiado' });
            return;
        }

        sendJson(res, 404, { success: false, message: 'Endpoint no encontrado' });
    }

    function handleSse(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.write('event: hello\ndata: {"ok":true}\n\n');
        sseClients.add(res);

        const heartbeat = setInterval(() => {
            try {
                res.write(': hb\n\n');
            } catch (e) {
                /* el cliente ya se desconectó */
            }
        }, 25000);

        req.on('close', () => {
            clearInterval(heartbeat);
            sseClients.delete(res);
        });
    }

    // ==========================================
    // Estáticos
    // ==========================================

    function serveStatic(res, pathname) {
        const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
        const filePath = path.normalize(path.join(staticDir, rel));
        const relFromRoot = path.relative(path.normalize(staticDir), filePath);
        if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
            sendJson(res, 403, { success: false, message: 'Prohibido' });
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                sendJson(res, 404, { success: false, message: 'No encontrado' });
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, {
                'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
                'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
            });
            res.end(data);
        });
    }

    // ==========================================
    // Helpers
    // ==========================================

    function readJson(req) {
        return new Promise((resolve, reject) => {
            let size = 0;
            const chunks = [];
            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > MAX_BODY_BYTES) {
                    reject(new Error('Cuerpo demasiado grande'));
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => {
                try {
                    resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf-8')) : null);
                } catch (e) {
                    resolve(null);
                }
            });
            req.on('error', reject);
        });
    }

    function sendJson(res, status, obj) {
        if (res.headersSent) {
            return;
        }
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify(obj));
    }

    function listen(host, port) {
        return new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, host, () => resolve(server.address()));
        });
    }

    function close() {
        return new Promise((resolve) => {
            for (const client of sseClients) {
                try {
                    client.end();
                } catch (e) {
                    /* best-effort */
                }
            }
            sseClients.clear();
            server.close(() => resolve(true));
            if (typeof server.closeAllConnections === 'function') {
                server.closeAllConnections();
            }
        });
    }

    return { server, listen, close, broadcast };
}

module.exports = { createAppServer };

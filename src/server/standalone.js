'use strict';

/**
 * Servidor standalone de Media Converter Pro (sin Electron).
 * Útil para correr el motor de descargas en un equipo sin UI:
 *   node src/server/standalone.js [--port 45690] [--data-dir <dir>] [--lan]
 * La UI se sirve igualmente en http://<host>:<port>
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const { createAppCore } = require('../core');
const { createAppServer } = require('../server');
const logger = require('../core/utils/logger');

function parseArgs(argv) {
    const args = { port: 45690, lan: false, dataDir: null };
    for (let i = 2; i < argv.length; i++) {
        if (argv[i] === '--port' && argv[i + 1]) {
            args.port = Number(argv[i + 1]);
            i++;
        } else if (argv[i] === '--data-dir' && argv[i + 1]) {
            args.dataDir = argv[i + 1];
            i++;
        } else if (argv[i] === '--lan') {
            args.lan = true;
        }
    }
    return args;
}

async function main() {
    const args = parseArgs(process.argv);
    const dataDir = args.dataDir || path.join(os.homedir(), '.media-converter-pro');
    const downloadsDir = path.join(os.homedir(), 'Downloads');
    const ffmpegPath = require('ffmpeg-static');

    const core = createAppCore({
        dataDir,
        defaultDownloadFolder: downloadsDir,
        ffmpegPath
    });
    await core.initialize();

    const tokenPath = path.join(dataDir, 'server-token');
    let token = '';
    try {
        token = fs.readFileSync(tokenPath, 'utf-8').trim();
    } catch (e) {
        token = crypto.randomBytes(4).toString('hex');
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(tokenPath, token);
    }

    const server = createAppServer({
        core,
        staticDir: path.join(__dirname, '..', 'web'),
        token,
        version: require('../../package.json').version
    });

    const address = await server.listen(args.lan ? '0.0.0.0' : '127.0.0.1', args.port);

    logger.info(`Servidor standalone en http://127.0.0.1:${address.port}`);
    if (args.lan) {
        const ips = Object.values(os.networkInterfaces())
            .flat()
            .filter((i) => i && i.family === 'IPv4' && !i.internal)
            .map((i) => `http://${i.address}:${address.port}`);
        if (ips.length) {
            logger.info(`Accesible en LAN: ${ips.join(', ')}`);
        }
    }
    logger.info(`Token de emparejamiento: ${token}`);
    logger.info(`Carpeta de descargas: ${core.getSettings().downloadFolder}`);

    const shutdown = () => {
        logger.info('Cerrando servidor...');
        core.cancelAll();
        server.close().then(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((e) => {
    console.error('Error fatal del servidor standalone:', e);
    process.exit(1);
});

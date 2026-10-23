// Servidor de producción de SmartQR: sirve el build de Vite (dist/) y genera /config.js con la
// configuración de Supabase leída de las variables de entorno al arrancar. Así la misma imagen
// Docker funciona en cualquier entorno sin recompilar. Solo usa módulos nativos de Node.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const DIST_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

const runtimeConfig = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
};
const configJs = `window.__SMARTQR_CONFIG__ = ${JSON.stringify(runtimeConfig)};\n`;

if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
    console.warn('ADVERTENCIA: SUPABASE_URL y/o SUPABASE_ANON_KEY no están definidas; la app no podrá conectarse a Supabase.');
}

// dist/ does not change while the container runs, so files are cached in memory after the first read
const fileCache = new Map();

async function loadFile(filePath) {
    if (fileCache.has(filePath)) return fileCache.get(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const body = await readFile(filePath);
    const entry = {
        body,
        gzipped: COMPRESSIBLE.has(ext) ? gzipSync(body) : null,
        contentType: MIME_TYPES[ext] || 'application/octet-stream',
    };
    fileCache.set(filePath, entry);
    return entry;
}

function send(req, res, status, { body, gzipped, contentType }, cacheControl) {
    const useGzip = gzipped && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    const payload = useGzip ? gzipped : body;
    res.writeHead(status, {
        'Content-Type': contentType,
        'Content-Length': payload.length,
        'Cache-Control': cacheControl,
        'X-Content-Type-Options': 'nosniff',
        ...(gzipped ? { Vary: 'Accept-Encoding' } : {}),
        ...(useGzip ? { 'Content-Encoding': 'gzip' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : payload);
}

function sendText(req, res, status, text) {
    send(req, res, status, { body: Buffer.from(text), gzipped: null, contentType: 'text/plain; charset=utf-8' }, 'no-store');
}

const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return sendText(req, res, 405, 'Method Not Allowed');
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
        return sendText(req, res, 400, 'Bad Request');
    }

    if (pathname === '/healthz') {
        return sendText(req, res, 200, 'ok');
    }

    if (pathname === '/config.js') {
        return send(req, res, 200, { body: Buffer.from(configJs), gzipped: null, contentType: MIME_TYPES['.js'] }, 'no-store');
    }

    const filePath = path.join(DIST_DIR, path.normalize(pathname));
    if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) {
        return sendText(req, res, 403, 'Forbidden');
    }

    try {
        const file = await loadFile(filePath);
        // Vite fingerprints everything under /assets, so those files can be cached forever
        const cacheControl = pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
        return send(req, res, 200, file, cacheControl);
    } catch (error) {
        if (error.code !== 'ENOENT' && error.code !== 'EISDIR') {
            console.error(`Error sirviendo ${pathname}:`, error);
            return sendText(req, res, 500, 'Internal Server Error');
        }
    }

    // Unknown paths without an extension get the app (routing happens client-side);
    // missing files such as /assets/old.js get a real 404
    if (path.extname(pathname)) {
        return sendText(req, res, 404, 'Not Found');
    }
    try {
        return send(req, res, 200, await loadFile(path.join(DIST_DIR, 'index.html')), 'no-cache');
    } catch (error) {
        console.error('No se encontró dist/index.html. ¿Ejecutaste `npm run build`?', error);
        return sendText(req, res, 500, 'Internal Server Error');
    }
});

server.listen(PORT, () => {
    console.log(`SmartQR escuchando en el puerto ${PORT}`);
});

// Docker sends SIGTERM on stop; close cleanly instead of waiting to be killed
for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000).unref();
    });
}

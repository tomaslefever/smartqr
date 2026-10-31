// Starts the HTTP server (dist/src/http.js) against a stand-in for Supabase's REST API and talks to it
// as the WhatsApp agent would: token, linking with a code, tools that act for the linked number.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const TOKEN = 'x'.repeat(40);
const ACCOUNT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GOOD_CODE = 'ABCD-2345';

// --- Stand-in for Supabase: whatsapp_links, the link_whatsapp function, profiles and a small menu ---
const links = new Map<string, string>();
const unfiltered: string[] = [];
const fake = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    const eq = (column: string) => url.searchParams.get(column)?.replace(/^eq\./, '');
    const single = (req.headers.accept ?? '').includes('vnd.pgrst.object');
    const reply = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(single && Array.isArray(data) ? data[0] ?? null : data));
    };
    const table = url.pathname.replace('/rest/v1/', '');

    if (table === 'rpc/link_whatsapp') {
        if (String(body.link_code).toUpperCase().replace(/[^A-Z0-9]/g, '') !== GOOD_CODE.replace('-', '')) {
            return reply(400, { code: 'P0002', message: 'Código inválido o vencido' });
        }
        links.set(body.phone_number, ACCOUNT);
        return reply(200, [{ user_id: ACCOUNT, business_name: 'Café Brisa' }]);
    }
    if (table === 'whatsapp_links') {
        const phone = eq('phone')!;
        if (req.method === 'DELETE') {
            const had = links.delete(phone);
            return reply(200, had ? [{ phone }] : []);
        }
        return reply(200, links.has(phone) ? [{ user_id: links.get(phone) }] : []);
    }
    if (table === 'profiles') return reply(200, eq('id') === ACCOUNT ? [{ business_name: 'Café Brisa', phone: null, address: null, opening_hours: null }] : []);
    if (table === 'categories' || table === 'products') {
        // With the service role key there is no row level security: every query must name the account
        if (eq('user_id') !== ACCOUNT) unfiltered.push(`${req.method} ${table}?${url.searchParams}`);
        if (table === 'categories') return reply(200, [{ id: 1, name: 'Cafés', position: 1 }]);
        return reply(200, [
            { id: 10, name: 'Cappuccino', description: '', price: 2800, unit: 'unit', category: 'Cafés', category_id: 1, image_url: '', active: true, out_of_stock: false, track_stock: false, stock: 0, position: 1 },
            { id: 11, name: 'Latte', description: '', price: 3200, unit: 'unit', category: 'Cafés', category_id: 1, image_url: '', active: false, out_of_stock: false, track_stock: false, stock: 0, position: 2 },
        ]);
    }
    reply(404, { message: `no simulado: ${req.method} ${url.pathname}` });
});

let server: ChildProcess;
let base = '';

const freePort = async () => {
    const probe = http.createServer().listen(0);
    await once(probe, 'listening');
    const { port } = probe.address() as AddressInfo;
    probe.close();
    return port;
};

before(async () => {
    fake.listen(0);
    await once(fake, 'listening');
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [fileURLToPath(new URL('../src/http.js', import.meta.url))], {
        env: {
            ...process.env, PORT: String(port), MCP_TOKEN: TOKEN, SMARTQR_URL: 'https://smartqr.cl',
            SUPABASE_URL: `http://127.0.0.1:${(fake.address() as AddressInfo).port}`, SUPABASE_SERVICE_ROLE_KEY: 'clave-de-servicio-de-prueba',
            TYPESAFE_API_KEY: '',
        },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await once(server.stdout!, 'data');
});

after(() => {
    server.kill();
    fake.close();
});

const connect = async (token = TOKEN) => {
    const client = new Client({ name: 'agente-whatsapp', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return client;
};
const text = (result: Awaited<ReturnType<Client['callTool']>>) => (result.content as { text: string }[])[0]!.text;

test('without the token, or with a wrong one, nothing is served', async () => {
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', body: '{}' })).status, 401);
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: 'Bearer otro' }, body: '{}' })).status, 401);
    await assert.rejects(connect('y'.repeat(40)));
    assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status, 405);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
});

test('every tool asks for the WhatsApp number, and the linking tools are there', async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    for (const tool of tools) assert.ok((tool.inputSchema.required ?? []).includes('telefono'), `${tool.name} sin telefono`);
    for (const name of ['vincular_whatsapp', 'estado_whatsapp', 'desvincular_whatsapp', 'ver_carta', 'evaluar_retiro']) {
        assert.ok(tools.some(t => t.name === name), name);
    }
    await client.close();
});

test('an unlinked number is told how to link; a bad code is rejected; a good one links', async () => {
    const client = await connect();
    const phone = '+56 9 1234 5678';

    const unlinked = await client.callTool({ name: 'ver_carta', arguments: { telefono: phone } });
    assert.equal(unlinked.isError, true);
    assert.match(text(unlinked), /\+56912345678 no está vinculado.*vincular_whatsapp/s);

    const bad = await client.callTool({ name: 'vincular_whatsapp', arguments: { telefono: phone, codigo: 'ZZZZ-9999' } });
    assert.equal(bad.isError, true);
    assert.match(text(bad), /no es válido o ya venció/);

    const good = await client.callTool({ name: 'vincular_whatsapp', arguments: { telefono: '56912345678@s.whatsapp.net', codigo: 'abcd 2345' } });
    assert.deepEqual(JSON.parse(text(good)), { vinculado: true, telefono: '+56912345678', negocio: 'Café Brisa', tienda: `https://smartqr.cl/#/store/${ACCOUNT}` });

    const status = JSON.parse(text(await client.callTool({ name: 'estado_whatsapp', arguments: { telefono: phone } })));
    assert.equal(status.negocio, 'Café Brisa');
    await client.close();
});

test('a linked number works on its own account only, and only with safe image sources', async () => {
    const client = await connect();
    const phone = '+56912345678';
    const shop = JSON.parse(text(await client.callTool({ name: 'ver_tienda', arguments: { telefono: phone } })));
    assert.equal(shop.business_name, 'Café Brisa');
    assert.deepEqual([shop.productos, shop.ocultos], [2, 1]);
    const found = JSON.parse(text(await client.callTool({ name: 'buscar_productos', arguments: { telefono: phone, texto: 'cappuccino' } })));
    assert.deepEqual(found.map((p: { id: number }) => p.id), [10]);
    assert.deepEqual(unfiltered, [], 'consultas sin filtrar por la cuenta');

    for (const origen of ['/etc/passwd', 'http://servicio-interno:3000/foto.jpg', 'file:///etc/passwd']) {
        const image = await client.callTool({ name: 'agregar_imagen', arguments: { telefono: phone, id: 10, origen } });
        assert.equal(image.isError, true, origen);
        assert.match(text(image), /URL https o una data URL/, origen);
    }
    await client.close();
});

test('unlinking stops the number from acting on the account', async () => {
    const client = await connect();
    const phone = '+56912345678';
    assert.deepEqual(JSON.parse(text(await client.callTool({ name: 'desvincular_whatsapp', arguments: { telefono: phone } }))), { desvinculado: true, telefono: phone });
    const after = await client.callTool({ name: 'ver_carta', arguments: { telefono: phone } });
    assert.equal(after.isError, true);
    const invalid = await client.callTool({ name: 'ver_carta', arguments: { telefono: '09 1234 5678' } });
    assert.match(text(invalid), /no es un número de WhatsApp válido/);
    await client.close();
});

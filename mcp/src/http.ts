#!/usr/bin/env node
// MCP server over HTTP for the WhatsApp agent. One token authenticates the agent; each tool call says
// which WhatsApp number it acts for, and that number is linked to a SmartQR account by a code the
// business generates in the panel (supabase/whatsapp-agent.sql). It reaches Supabase with the service
// role key and every query is filtered by the linked account.
import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { jevCategoryFromEnv, jevFromEnv } from './jev.js';
import { normalizePhone } from './phone.js';
import { SmartQR } from './smartqr.js';
import { failure, INSTRUCTIONS, registerTools } from './tools.js';

const required = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
    return value;
};

const token = required('MCP_TOKEN');
if (token.length < 32) throw new Error('MCP_TOKEN debe tener al menos 32 caracteres.');
const siteUrl = (process.env.SMARTQR_URL || 'https://smartqr.cl').replace(/\/+$/, '');
const port = Number(process.env.PORT) || 3000;
const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
});
const jev = jevFromEnv();
const jevCategory = jevCategoryFromEnv();

// Base64 photos (up to 10 MB of image) come in the request body
const MAX_BODY_BYTES = 15 * 1024 * 1024;

const linkedAccount = async (phone: string) => {
    const { data, error } = await supabase.from('whatsapp_links').select('user_id').eq('phone', phone).maybeSingle();
    if (error) throw error;
    return (data?.user_id as string | undefined) ?? null;
};

const businessFor = async (args: Record<string, unknown>) => {
    const phone = normalizePhone(String(args.telefono ?? ''));
    const userId = await linkedAccount(phone);
    if (!userId) {
        throw new Error(`El número ${phone} no está vinculado a ninguna cuenta de SmartQR. Pídele a la persona el código que aparece en el panel de SmartQR (menú "Agente de WhatsApp") y vincúlalo con vincular_whatsapp.`);
    }
    return new SmartQR({ kind: 'service', client: supabase, userId, siteUrl });
};

const telefono = z.string().min(6).describe('Número de WhatsApp de quien escribe, con código de país (por ejemplo +56912345678)');

const INSTRUCTIONS_WHATSAPP = `${INSTRUCTIONS}
- Atiendes a negocios por WhatsApp. En cada herramienta envía en telefono el número de quien te escribe, tal como lo entrega WhatsApp; ese número decide qué carta se modifica.
- Si una herramienta responde que el número no está vinculado, pídele a la persona el código de 8 caracteres que aparece en el panel de SmartQR (menú "Agente de WhatsApp") y llama a vincular_whatsapp con ese código.`;

const buildServer = () => {
    const server = new McpServer({ name: 'smartqr-whatsapp', version: '0.2.0' }, { instructions: INSTRUCTIONS_WHATSAPP });

    registerTools(server, { business: businessFor, extraInput: { telefono }, allowLocalFiles: false, jev, jevCategory });

    const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

    server.registerTool('vincular_whatsapp', {
        title: 'Vincular un número de WhatsApp',
        description: 'Vincula el número de quien escribe con su cuenta de SmartQR usando el código de 8 caracteres que la persona ve en el panel (menú "Agente de WhatsApp"). El código vence a los 10 minutos y sirve una sola vez. Si el número ya estaba vinculado a otra cuenta, pasa a esta.',
        inputSchema: { telefono, codigo: z.string().min(4).describe('Código del panel, por ejemplo ABCD-2345') },
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ telefono: raw, codigo }) => {
        try {
            const phone = normalizePhone(raw);
            const { data, error } = await supabase.rpc('link_whatsapp', { link_code: codigo, phone_number: phone });
            if (error) {
                if (/inválido o vencido/.test(error.message)) throw new Error('El código no es válido o ya venció. Pídele a la persona que genere uno nuevo en el panel de SmartQR (menú "Agente de WhatsApp") y te lo envíe.');
                throw error;
            }
            const linked = (Array.isArray(data) ? data[0] : data) as { user_id: string; business_name: string | null };
            return ok({ vinculado: true, telefono: phone, negocio: linked.business_name, tienda: `${siteUrl}/#/store/${linked.user_id}` });
        } catch (error) {
            return failure(error);
        }
    });

    server.registerTool('estado_whatsapp', {
        title: 'Ver si un número está vinculado',
        description: 'Indica si el número de quien escribe está vinculado a una cuenta de SmartQR y a qué negocio.',
        inputSchema: { telefono },
        annotations: { readOnlyHint: true, openWorldHint: false },
    }, async ({ telefono: raw }) => {
        try {
            const phone = normalizePhone(raw);
            const userId = await linkedAccount(phone);
            if (!userId) return ok({ vinculado: false, telefono: phone });
            const { data } = await supabase.from('profiles').select('business_name').eq('id', userId).maybeSingle();
            return ok({ vinculado: true, telefono: phone, negocio: data?.business_name ?? null, tienda: `${siteUrl}/#/store/${userId}` });
        } catch (error) {
            return failure(error);
        }
    });

    server.registerTool('desvincular_whatsapp', {
        title: 'Desvincular un número de WhatsApp',
        description: 'Quita el vínculo entre el número de quien escribe y su cuenta de SmartQR (cuando la persona lo pide). Después tendrá que vincularlo de nuevo con un código del panel.',
        inputSchema: { telefono },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async ({ telefono: raw }) => {
        try {
            const phone = normalizePhone(raw);
            const { data, error } = await supabase.from('whatsapp_links').delete().eq('phone', phone).select('phone');
            if (error) throw error;
            return ok({ desvinculado: Boolean(data?.length), telefono: phone });
        } catch (error) {
            return failure(error);
        }
    });

    return server;
};

// Compares the bearer token in constant time (hashing first so lengths do not leak either)
const digest = (value: string) => createHash('sha256').update(value).digest();
const expected = digest(token);
const authorized = (req: http.IncomingMessage) => {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
    return Boolean(match) && timingSafeEqual(digest(match![1]!.trim()), expected);
};

const readJson = (req: http.IncomingMessage) => new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
            reject(Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 }));
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', () => {
        try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
        } catch {
            reject(Object.assign(new Error('JSON inválido.'), { status: 400 }));
        }
    });
    req.on('error', reject);
});

const sendJson = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    if (res.headersSent) return;
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
};
const rpcError = (code: number, message: string) => ({ jsonrpc: '2.0', error: { code, message }, id: null });

const httpServer = http.createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/healthz') return sendJson(res, 200, { ok: true });
    if (path !== '/mcp') return sendJson(res, 404, { error: 'No encontrado' });
    if (!authorized(req)) return sendJson(res, 401, rpcError(-32001, 'No autorizado'), { 'WWW-Authenticate': 'Bearer' });
    // Stateless: each POST is a full exchange, so there is no stream to open or session to close
    if (req.method !== 'POST') return sendJson(res, 405, rpcError(-32000, 'Método no permitido'), { Allow: 'POST' });

    try {
        const body = await readJson(req);
        const server = buildServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        res.on('close', () => {
            void transport.close();
            void server.close();
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
    } catch (error) {
        const status = (error as { status?: number }).status ?? 500;
        if (status === 500) console.error('Error atendiendo /mcp:', error);
        sendJson(res, status, rpcError(-32603, status === 500 ? 'Error interno' : (error as Error).message));
    }
});

httpServer.listen(port, () => console.log(`SmartQR MCP (WhatsApp) escuchando en el puerto ${port}, ruta /mcp`));

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
        httpServer.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000).unref();
    });
}

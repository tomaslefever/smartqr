// WhatsApp Business (Cloud API de Meta) para SmartQR: conexión manual del número de cada negocio, webhook
// que recibe sus mensajes y avisos del sistema de lealtad. Solo usa módulos nativos de Node.
//
// Variables de entorno (en .env o en el entorno del contenedor):
//   META_APP_ID                 ID de la app de Meta de SmartQR (para comprobar que el token es de esta app)
//   META_APP_SECRET             Secreto de la app: firma de los webhooks (X-Hub-Signature-256)
//   META_WEBHOOK_VERIFY_TOKEN   Texto que se pone en la app de Meta al configurar el webhook
//   SUPABASE_SERVICE_ROLE_KEY   Clave de servicio: lee y guarda las conexiones (el token no va al navegador)
//   META_GRAPH_VERSION          Opcional, por defecto v24.0
//
// Rutas:
//   GET  /api/whatsapp/webhook   Verificación del webhook (hub.challenge)
//   POST /api/whatsapp/webhook   Mensajes entrantes, firmados por Meta
//   POST /api/whatsapp/connect   Guarda las credenciales del negocio (sesión del panel)
//   POST /api/loyalty/notify     Avisa por WhatsApp a un cliente de sus sellos (sesión del panel)
import crypto from 'node:crypto';

const env = (name) => (process.env[name] || '').trim();

const config = {
    supabaseUrl: (env('SUPABASE_URL') || env('VITE_SUPABASE_URL')).replace(/\/+$/, ''),
    anonKey: env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY'),
    serviceKey: env('SUPABASE_SERVICE_ROLE_KEY'),
    appId: env('META_APP_ID'),
    appSecret: env('META_APP_SECRET'),
    verifyToken: env('META_WEBHOOK_VERIFY_TOKEN'),
    graphVersion: env('META_GRAPH_VERSION') || 'v24.0',
};

export const whatsappConfigWarnings = () => {
    const missing = ['SUPABASE_SERVICE_ROLE_KEY', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'].filter(name => !env(name));
    return missing.length ? [`WhatsApp: faltan ${missing.join(', ')}; la conexión con WhatsApp y el sistema de lealtad no funcionarán.`] : [];
};

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// --- HTTP helpers ---

const readBody = (req, limit) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
        size += chunk.length;
        if (size > limit) {
            reject(new HttpError(413, 'El cuerpo de la solicitud es demasiado grande.'));
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
});

const readJson = async (req) => {
    const raw = await readBody(req, 64 * 1024);
    try {
        const body = JSON.parse(raw.toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
        return body;
    } catch {
        throw new HttpError(400, 'JSON inválido.');
    }
};

const sendJson = (res, status, data) => {
    const body = Buffer.from(JSON.stringify(data));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
};

const sendPlain = (res, status, text) => {
    const body = Buffer.from(text);
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(body);
};

// --- Supabase (REST con la clave de servicio) ---

const requireServer = () => {
    if (!config.supabaseUrl || !config.serviceKey) {
        throw new HttpError(503, 'El servidor no tiene configurada la conexión con WhatsApp (falta SUPABASE_SERVICE_ROLE_KEY).');
    }
};

const supabaseRest = async (path, { method = 'GET', body, prefer } = {}) => {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
        method,
        headers: {
            apikey: config.serviceKey,
            Authorization: `Bearer ${config.serviceKey}`,
            'Content-Type': 'application/json',
            ...(prefer ? { Prefer: prefer } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
        const error = new Error(data?.message || `Supabase respondió ${res.status}`);
        error.code = data?.code;
        throw error;
    }
    return data;
};

const firstRow = (rows) => (Array.isArray(rows) && rows.length ? rows[0] : null);

// The panel's user, from the Supabase session token it sends
const authenticate = async (req) => {
    const header = req.headers.authorization || '';
    const token = /^Bearer\s+(.+)$/i.exec(header)?.[1];
    if (!token) throw new HttpError(401, 'Debes iniciar sesión.');
    const res = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: config.anonKey || config.serviceKey, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new HttpError(401, 'Tu sesión venció. Vuelve a iniciar sesión.');
    const user = await res.json();
    if (!user?.id) throw new HttpError(401, 'Debes iniciar sesión.');
    return user;
};

const connectionOfUser = async (userId) =>
    firstRow(await supabaseRest(`whatsapp_connections?user_id=eq.${encodeURIComponent(userId)}&select=user_id,phone_number_id,access_token`));

const connectionOfNumber = async (phoneNumberId) =>
    firstRow(await supabaseRest(`whatsapp_connections?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&select=user_id,phone_number_id,access_token`));

const loyaltyProfile = async (userId) =>
    firstRow(await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}&select=business_name,loyalty_enabled,loyalty_goal,loyalty_reward`));

// --- Graph API de Meta ---

const graph = async (path, { token, method = 'GET', body } = {}) => {
    const res = await fetch(`https://graph.facebook.com/${config.graphVersion}/${path}`, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
};

const graphError = (result) =>
    result.data?.error?.error_user_msg || result.data?.error?.message || `Meta respondió ${result.status}`;

const sendText = async (connection, to, text) => {
    const result = await graph(`${connection.phone_number_id}/messages`, {
        token: connection.access_token,
        method: 'POST',
        body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: text, preview_url: false } },
    });
    if (result.ok) return { sent: true };
    // 131047: pasaron más de 24 horas desde el último mensaje del cliente; solo se puede escribir con plantillas
    const code = result.data?.error?.code;
    if (code === 131047) return { sent: false, reason: 'window' };
    return { sent: false, reason: 'error', message: graphError(result) };
};

// --- Webhook ---

const validSignature = (raw, header) => {
    const given = /^sha256=([0-9a-f]{64})$/i.exec((header || '').trim())?.[1]?.toLowerCase();
    if (!given) return false;
    const expected = crypto.createHmac('sha256', config.appSecret).update(raw).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'));
};

const verifyWebhook = (req, res, url) => {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token') || '';
    const challenge = url.searchParams.get('hub.challenge') || '';
    const given = Buffer.from(token);
    const expected = Buffer.from(config.verifyToken);
    const matches = expected.length > 0 && given.length === expected.length && crypto.timingSafeEqual(given, expected);
    if (mode === 'subscribe' && matches) return sendPlain(res, 200, challenge);
    return sendPlain(res, 403, 'Forbidden');
};

// "sellos", "mis puntos", "Hola, quiero ver mis SELLOS"...
const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const asksForLoyalty = (text) => /\b(sellos?|puntos?|lealtad)\b/.test(normalize(text || ''));

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || '';

const stampBar = (stamps, goal) => '●'.repeat(Math.min(stamps, goal)) + '○'.repeat(Math.max(goal - stamps, 0));

export const loyaltyMessage = (event, customer, profile) => {
    const business = (profile.business_name || '').trim() || 'el local';
    const goal = profile.loyalty_goal;
    const reward = (profile.loyalty_reward || '').trim();
    const name = firstName(customer.name);
    const hello = name ? `¡Hola, ${name}!` : '¡Hola!';
    const stamps = customer.stamps;
    const complete = stamps >= goal;
    const progress = `${stampBar(stamps, goal)}\nLlevas ${stamps} de ${goal} sellos.`;
    const claim = `Completaste tu tarjeta 🎉 Muestra este mensaje en ${business} para canjear: ${reward}.`;
    const missing = `Te ${goal - stamps === 1 ? 'falta 1 sello' : `faltan ${goal - stamps} sellos`} para: ${reward}.`;

    if (event === 'stamp') {
        return [`${hello} Sumaste un sello en ${business}.`, '', progress, complete ? claim : missing].join('\n');
    }
    if (event === 'redeem') {
        return [`${hello} Canjeaste tu premio en ${business}: ${reward}. ¡Que lo disfrutes!`, '', `Tu tarjeta sigue: llevas ${stamps} de ${goal} sellos.`].join('\n');
    }
    if (customer.total_stamps === 0 && customer.rewards_redeemed === 0) {
        return [
            `${hello} Ya estás en el programa de sellos de ${business}.`,
            '',
            `Cada compra suma un sello. Con ${goal} sellos te llevas: ${reward}.`,
            'Escribe "sellos" cuando quieras para ver cuántos llevas.',
        ].join('\n');
    }
    return [`${hello} Así va tu tarjeta en ${business}:`, '', progress, complete ? claim : missing].join('\n');
};

const handleIncoming = async (payload) => {
    if (!config.supabaseUrl || !config.serviceKey) {
        console.error('Webhook de WhatsApp: falta SUPABASE_SERVICE_ROLE_KEY; se ignoran los mensajes.');
        return;
    }
    const connections = new Map();
    const profiles = new Map();

    for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
            if (change?.field !== 'messages') continue;
            const value = change.value ?? {};
            const phoneNumberId = value.metadata?.phone_number_id;
            if (!phoneNumberId || !Array.isArray(value.messages)) continue;

            if (!connections.has(phoneNumberId)) connections.set(phoneNumberId, await connectionOfNumber(phoneNumberId));
            const connection = connections.get(phoneNumberId);
            if (!connection) {
                console.warn(`Webhook de WhatsApp: ningún negocio tiene el número ${phoneNumberId}`);
                continue;
            }
            if (!profiles.has(connection.user_id)) profiles.set(connection.user_id, await loyaltyProfile(connection.user_id));
            const profile = profiles.get(connection.user_id);
            if (!profile?.loyalty_enabled) continue;

            const names = new Map((value.contacts ?? []).map(c => [c.wa_id, c.profile?.name ?? '']));
            for (const message of value.messages) {
                const from = message?.from;
                if (!from) continue;
                const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? '';
                const join = asksForLoyalty(text);
                const customer = firstRow(await supabaseRest('rpc/loyalty_whatsapp_message', {
                    method: 'POST',
                    body: { owner: connection.user_id, customer_phone: from, customer_name: names.get(from) ?? '', join_program: join },
                }));
                if (join && customer) {
                    const result = await sendText(connection, from, loyaltyMessage('balance', customer, profile));
                    if (!result.sent) console.warn(`Webhook de WhatsApp: no se pudo responder a ${from}:`, result.message ?? result.reason);
                }
            }
        }
    }
};

const receiveWebhook = async (req, res) => {
    if (!config.appSecret) {
        console.error('Webhook de WhatsApp: falta META_APP_SECRET; no se pueden comprobar las firmas.');
        return sendPlain(res, 503, 'Webhook not configured');
    }
    const raw = await readBody(req, 1024 * 1024);
    if (!validSignature(raw, req.headers['x-hub-signature-256'])) {
        return sendPlain(res, 401, 'Invalid signature');
    }
    let payload;
    try {
        payload = JSON.parse(raw.toString('utf8'));
    } catch {
        return sendPlain(res, 400, 'Bad Request');
    }
    // Meta reintenta los webhooks lentos: responder primero y procesar después
    sendPlain(res, 200, 'EVENT_RECEIVED');
    handleIncoming(payload).catch(error => console.error('Webhook de WhatsApp: error procesando mensajes:', error));
};

// --- Conexión manual ---

const digitsId = /^[0-9]{5,30}$/;

const connect = async (req, res) => {
    requireServer();
    const user = await authenticate(req);
    const body = await readJson(req);

    const phoneNumberId = String(body.phone_number_id ?? '').trim();
    const wabaId = String(body.waba_id ?? '').trim();
    const token = String(body.access_token ?? '').trim();
    const pin = String(body.pin ?? '').trim();
    const displayInput = String(body.display_phone_number ?? '').trim().slice(0, 30);
    const nameInput = String(body.verified_name ?? '').trim().slice(0, 120);

    if (!digitsId.test(phoneNumberId)) throw new HttpError(400, 'El Phone Number ID son solo números.');
    if (!digitsId.test(wabaId)) throw new HttpError(400, 'El WABA ID son solo números.');
    if (token.length < 20 || token.length > 2000 || /\s/.test(token)) throw new HttpError(400, 'El Access Token no parece válido.');
    if (pin && !/^[0-9]{6}$/.test(pin)) throw new HttpError(400, 'El PIN son 6 dígitos.');

    // 1) El token debe ser de la app de SmartQR: Meta envía los mensajes al webhook de la app dueña del token
    if (config.appId && config.appSecret) {
        const debug = await graph(`debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${config.appId}|${config.appSecret}`)}`);
        const info = debug.data?.data;
        if (debug.ok && info) {
            if (info.is_valid === false) throw new HttpError(400, 'Meta dice que el Access Token no es válido o ya venció.');
            if (info.app_id && String(info.app_id) !== config.appId) {
                throw new HttpError(400, `El token es de otra app de Meta (ID ${info.app_id}). Genéralo con un System User que tenga asignada la app de SmartQR (ID ${config.appId}); si no, los mensajes no llegan a SmartQR.`);
            }
        }
    }

    // 2) El número existe y el token lo puede usar
    const phone = await graph(`${phoneNumberId}?fields=display_phone_number,verified_name,status`, { token });
    if (!phone.ok) throw new HttpError(400, `No se pudo leer el número con ese token: ${graphError(phone)}`);

    // 3) El número es de ese WABA
    const numbers = await graph(`${wabaId}/phone_numbers?fields=id&limit=200`, { token });
    if (!numbers.ok) throw new HttpError(400, `No se pudo leer la cuenta de WhatsApp (WABA) con ese token: ${graphError(numbers)}`);
    if (!(numbers.data?.data ?? []).some(n => String(n.id) === phoneNumberId)) {
        throw new HttpError(400, 'Ese Phone Number ID no pertenece al WABA indicado.');
    }

    const warnings = [];

    // 4) Suscribir la app al WABA para que los mensajes lleguen al webhook
    const subscription = await graph(`${wabaId}/subscribed_apps`, { token, method: 'POST' });
    const webhooksSubscribed = subscription.ok && subscription.data?.success !== false;
    if (!webhooksSubscribed) warnings.push(`No se pudo suscribir la app al WABA: ${graphError(subscription)}`);

    // 5) Registrar el número en la Cloud API (si ya está registrado no hace falta). Un número con
    //    verificación en dos pasos se registra con su PIN; si no la tiene, este PIN queda configurado.
    if (phone.data?.status !== 'CONNECTED') {
        if (!pin) {
            warnings.push('El número no está registrado en la API de WhatsApp. Ingresa el PIN de verificación en dos pasos y guarda de nuevo.');
        } else {
            const register = await graph(`${phoneNumberId}/register`, { token, method: 'POST', body: { messaging_product: 'whatsapp', pin } });
            const code = register.data?.error?.code;
            if (!register.ok && code !== 133006) {
                warnings.push(code === 133005
                    ? 'El PIN de verificación en dos pasos no coincide con el del número.'
                    : `No se pudo registrar el número: ${graphError(register)}`);
            }
        }
    }

    const row = {
        user_id: user.id,
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        display_phone_number: phone.data?.display_phone_number || displayInput || null,
        verified_name: phone.data?.verified_name || nameInput || null,
        access_token: token,
        webhooks_subscribed: webhooksSubscribed,
        setup_error: warnings.length ? warnings.join(' ') : null,
        updated_at: new Date().toISOString(),
    };
    try {
        await supabaseRest('whatsapp_connections?on_conflict=user_id', {
            method: 'POST',
            body: row,
            prefer: 'resolution=merge-duplicates,return=minimal',
        });
    } catch (error) {
        if (error.code === '23505') throw new HttpError(409, 'Ese número ya está conectado a otra cuenta de SmartQR.');
        if (error.code === '42P01' || error.code === 'PGRST205') {
            throw new HttpError(503, 'Falta ejecutar la migración supabase/whatsapp-cloud.sql.');
        }
        throw error;
    }

    const { access_token: _token, user_id: _user, ...connection } = row;
    return sendJson(res, 200, { connection, warnings });
};

// --- Avisos del sistema de lealtad ---

const notifyLoyalty = async (req, res) => {
    requireServer();
    const user = await authenticate(req);
    const body = await readJson(req);
    const customerId = Number(body.customer_id);
    const event = ['stamp', 'redeem', 'balance'].includes(body.event) ? body.event : 'balance';
    if (!Number.isSafeInteger(customerId) || customerId <= 0) throw new HttpError(400, 'Cliente inválido.');

    const customer = firstRow(await supabaseRest(
        `loyalty_customers?id=eq.${customerId}&user_id=eq.${encodeURIComponent(user.id)}&select=id,phone,name,stamps,total_stamps,rewards_redeemed`,
    ));
    if (!customer) throw new HttpError(404, 'Cliente no encontrado.');
    const profile = await loyaltyProfile(user.id);
    if (!profile?.loyalty_enabled) throw new HttpError(409, 'El sistema de lealtad está apagado.');
    const connection = await connectionOfUser(user.id);
    if (!connection) throw new HttpError(409, 'Conecta WhatsApp para avisar a tus clientes.');

    return sendJson(res, 200, await sendText(connection, customer.phone, loyaltyMessage(event, customer, profile)));
};

// --- Router ---

// Handles /api/... requests; returns false for any other path
export const handleApi = async (req, res, url) => {
    const { pathname } = url;
    if (!pathname.startsWith('/api/')) return false;
    try {
        const route = `${req.method} ${pathname}`;
        if (route === 'GET /api/whatsapp/webhook') verifyWebhook(req, res, url);
        else if (route === 'POST /api/whatsapp/webhook') await receiveWebhook(req, res);
        else if (route === 'POST /api/whatsapp/connect') await connect(req, res);
        else if (route === 'POST /api/loyalty/notify') await notifyLoyalty(req, res);
        else sendJson(res, 404, { error: 'No encontrado.' });
    } catch (error) {
        if (res.headersSent) {
            console.error(`Error en ${pathname}:`, error);
        } else if (error instanceof HttpError) {
            sendJson(res, error.status, { error: error.message });
        } else {
            console.error(`Error en ${pathname}:`, error);
            sendJson(res, 500, { error: 'Error interno del servidor.' });
        }
    }
    return true;
};

// WhatsApp Business (Cloud API de Meta) para SmartQR: conexión manual del número de cada negocio, webhook
// que recibe sus mensajes y validación de sellos del sistema de lealtad: el cliente pide el sello en la
// landing y el comercio lo valida con un botón en WhatsApp. Solo usa módulos nativos de Node.
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
//   POST /api/loyalty/request    Pide un sello desde la landing (pública, limitada por IP) y avisa al comercio
//   GET  /api/loyalty/template   Estado de la plantilla de validación en Meta (sesión del panel)
//   POST /api/loyalty/template   Crea esa plantilla en el WABA del negocio (sesión del panel)
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

const CONNECTION_FIELDS = 'user_id,phone_number_id,waba_id,access_token,approver_last_message_at';

const connectionOfUser = async (userId) =>
    firstRow(await supabaseRest(`whatsapp_connections?user_id=eq.${encodeURIComponent(userId)}&select=${CONNECTION_FIELDS}`));

const connectionOfNumber = async (phoneNumberId) =>
    firstRow(await supabaseRest(`whatsapp_connections?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&select=${CONNECTION_FIELDS}`));

const loyaltyProfile = async (userId) =>
    firstRow(await supabaseRest(`profiles?id=eq.${encodeURIComponent(userId)}&select=business_name,loyalty_enabled,loyalty_goal,loyalty_approver_whatsapp`));

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

// Sends a message from the connected number; returns its id in Meta or the error
const sendMessage = async (connection, to, message) => {
    const result = await graph(`${connection.phone_number_id}/messages`, {
        token: connection.access_token,
        method: 'POST',
        body: { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message },
    });
    if (result.ok) return { sent: true, id: result.data?.messages?.[0]?.id ?? null };
    return { sent: false, error: graphError(result) };
};

const sendText = (connection, to, text) => sendMessage(connection, to, { type: 'text', text: { body: text, preview_url: false } });

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

// --- Validación de sellos ---

// Plantilla con la que se le escribe al comercio fuera de la ventana de 24 horas. La crea el panel en el
// WABA de cada negocio (POST /api/loyalty/template); Meta la revisa antes de dejar usarla.
export const STAMP_TEMPLATE = {
    name: 'smartqr_validar_sello',
    language: 'es',
    category: 'UTILITY',
    body: 'Solicitud de sello: {{1}} pide un sello y lleva {{2}} de {{3}}. Valídalo solo si compró en tu local.',
    example: ['Pedro (+56987654321)', '3', '8'],
    buttons: ['Validar sello', 'Rechazar'],
};

// WhatsApp deja escribir libremente hasta 24 horas después del último mensaje; se deja un margen
const WINDOW_MS = 23.5 * 60 * 60 * 1000;

const STAMP_PAYLOAD = /^stamp:(approve|reject):(\d+)$/;

// Mexico's wa_id carries a 1 after the country code (521...) that people do not write
const comparableNumber = (number) => String(number ?? '').replace(/\D/g, '').replace(/^521(\d{10})$/, '52$1');
export const sameNumber = (a, b) => !!comparableNumber(a) && comparableNumber(a) === comparableNumber(b);

const stampButtons = (requestId) => [`stamp:approve:${requestId}`, `stamp:reject:${requestId}`];

const interactiveRequest = (requestId, business, label, stamps, goal) => ({
    type: 'interactive',
    interactive: {
        type: 'button',
        body: { text: `Solicitud de sello en ${business}: ${label} pide un sello y lleva ${stamps} de ${goal}. Valídalo solo si compró en tu local.` },
        action: {
            buttons: stampButtons(requestId).map((id, i) => ({ type: 'reply', reply: { id, title: STAMP_TEMPLATE.buttons[i] } })),
        },
    },
});

const templateRequest = (requestId, label, stamps, goal) => ({
    type: 'template',
    template: {
        name: STAMP_TEMPLATE.name,
        language: { code: STAMP_TEMPLATE.language },
        components: [
            { type: 'body', parameters: [label, String(stamps), String(goal)].map(text => ({ type: 'text', text })) },
            ...stampButtons(requestId).map((payload, index) => ({
                type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }],
            })),
        ],
    },
});

const saveNotice = (requestId, mode, result) => supabaseRest(`loyalty_stamp_requests?id=eq.${requestId}`, {
    method: 'PATCH',
    body: { notify_mode: mode, notify_message_id: result.id ?? null, notify_error: result.sent ? null : result.error },
    prefer: 'return=minimal',
});

// Le escribe al comercio para que valide la solicitud: con botones si está dentro de las 24 horas, con la
// plantilla si no
const notifyApprover = async (connection, profile, request) => {
    const business = (profile.business_name || '').trim() || 'tu local';
    const lastMessage = connection.approver_last_message_at ? Date.parse(connection.approver_last_message_at) : 0;
    const inWindow = Date.now() - lastMessage < WINDOW_MS;
    const mode = inWindow ? 'interactive' : 'template';
    const message = inWindow
        ? interactiveRequest(request.request_id, business, request.customer_label, request.stamps, request.goal)
        : templateRequest(request.request_id, request.customer_label, request.stamps, request.goal);
    const result = await sendMessage(connection, profile.loyalty_approver_whatsapp, message);
    await saveNotice(request.request_id, mode, result);
    return result;
};

// Meta acepta el mensaje con botones y avisa después, por el webhook, que no se entregó porque la ventana
// de 24 horas estaba cerrada (131047). Entonces se reenvía con la plantilla.
const resendAsTemplate = async (connection, messageId) => {
    const request = firstRow(await supabaseRest(
        `loyalty_stamp_requests?notify_message_id=eq.${encodeURIComponent(messageId)}&notify_mode=eq.interactive&status=eq.pending` +
        '&select=id,user_id,customer:loyalty_customers(name,phone,stamps)',
    ));
    if (!request || request.user_id !== connection.user_id) return;
    const profile = await loyaltyProfile(connection.user_id);
    if (!profile?.loyalty_enabled || !profile.loyalty_approver_whatsapp) return;
    const label = `${request.customer?.name ? `${request.customer.name} ` : ''}(+${request.customer?.phone})`;
    const result = await sendMessage(connection, profile.loyalty_approver_whatsapp,
        templateRequest(request.id, label, request.customer?.stamps ?? 0, profile.loyalty_goal));
    await saveNotice(request.id, 'template', result);
};

const decisionReply = (decision, approve) => {
    if (!decision) return 'No encontré esa solicitud.';
    const { status, changed, customer_label: label, stamps, goal } = decision;
    if (status === 'expired') return `La solicitud de ${label} venció: pasaron más de 24 horas.`;
    if (!changed) return `La solicitud de ${label} ya estaba ${status === 'approved' ? 'validada' : 'rechazada'}.`;
    if (!approve) return `❌ Rechazaste la solicitud de ${label}.`;
    const complete = stamps >= goal ? ' Completó la tarjeta: ya puede canjear su premio.' : '';
    return `✅ Sello validado para ${label}. Lleva ${stamps} de ${goal}.${complete}`;
};

// A message from the business's approver number: keeps the 24-hour window open and, if it is a button
// reply, decides the request
const handleApproverMessage = async (connection, message) => {
    await supabaseRest(`whatsapp_connections?user_id=eq.${encodeURIComponent(connection.user_id)}`, {
        method: 'PATCH',
        body: { approver_last_message_at: new Date().toISOString() },
        prefer: 'return=minimal',
    });
    const payload = message.interactive?.button_reply?.id ?? message.button?.payload ?? '';
    const match = STAMP_PAYLOAD.exec(payload);
    if (!match) return;
    const approve = match[1] === 'approve';
    let decision = null;
    try {
        decision = firstRow(await supabaseRest('rpc/loyalty_decide_request', {
            method: 'POST',
            body: { owner: connection.user_id, request: Number(match[2]), approve, via: 'whatsapp' },
        }));
    } catch (error) {
        if (error.code !== 'P0002') throw error;
    }
    const result = await sendText(connection, message.from, decisionReply(decision, approve));
    if (!result.sent) console.warn('Webhook de WhatsApp: no se pudo confirmar la decisión al comercio:', result.error);
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
            if (!phoneNumberId) continue;

            if (!connections.has(phoneNumberId)) connections.set(phoneNumberId, await connectionOfNumber(phoneNumberId));
            const connection = connections.get(phoneNumberId);
            if (!connection) {
                console.warn(`Webhook de WhatsApp: ningún negocio tiene el número ${phoneNumberId}`);
                continue;
            }

            for (const status of value.statuses ?? []) {
                if (status?.status === 'failed' && (status.errors ?? []).some(e => e?.code === 131047)) {
                    await resendAsTemplate(connection, status.id);
                }
            }

            if (!Array.isArray(value.messages) || !value.messages.length) continue;
            if (!profiles.has(connection.user_id)) profiles.set(connection.user_id, await loyaltyProfile(connection.user_id));
            const profile = profiles.get(connection.user_id);
            // Solo cuenta lo que escribe el comercio desde su número de validación
            for (const message of value.messages) {
                if (message?.from && sameNumber(message.from, profile?.loyalty_approver_whatsapp)) {
                    await handleApproverMessage(connection, message);
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

// --- Solicitudes de sello desde la landing ---

// Limits requests per IP in memory (one server process): enough to keep a script from flooding a business
const hits = new Map();
const allow = (key, max, windowMs) => {
    const now = Date.now();
    if (hits.size > 10000) hits.clear();
    const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
        hits.set(key, recent);
        return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
};

const clientIp = (req) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestStamp = async (req, res) => {
    requireServer();
    if (!allow(`stamp:${clientIp(req)}`, 10, 10 * 60 * 1000)) {
        throw new HttpError(429, 'Hiciste muchas solicitudes seguidas. Inténtalo en unos minutos.');
    }
    const body = await readJson(req);
    const store = String(body.store ?? '');
    const phone = String(body.phone ?? '').slice(0, 30);
    const name = String(body.name ?? '').slice(0, 80);
    if (!uuidPattern.test(store)) throw new HttpError(400, 'Local inválido.');

    let request;
    try {
        request = firstRow(await supabaseRest('rpc/loyalty_request_stamp', {
            method: 'POST',
            body: { store, customer_phone: phone, customer_name: name },
        }));
    } catch (error) {
        // Mensajes de la base pensados para el cliente (número inválido, programa apagado...)
        if (['P0001', 'P0002', '22023'].includes(error.code)) throw new HttpError(400, error.message);
        throw error;
    }
    if (!request) throw new HttpError(500, 'No se pudo crear la solicitud.');

    // Una solicitud repetida (la misma pendiente) no vuelve a escribirle al comercio
    if (request.is_new) {
        try {
            const connection = await connectionOfUser(store);
            const profile = await loyaltyProfile(store);
            if (connection && profile?.loyalty_approver_whatsapp) {
                const result = await notifyApprover(connection, profile, request);
                if (!result.sent) console.warn(`Sellos: no se pudo avisar al comercio ${store}:`, result.error);
            }
        } catch (error) {
            // La solicitud queda pendiente igual: el comercio la ve en el panel
            console.error('Sellos: error avisando al comercio:', error);
        }
    }
    return sendJson(res, 200, { token: request.request_token, card_token: request.card_token });
};

// --- Plantilla de validación ---

const templateStatus = async (connection) => {
    const result = await graph(
        `${connection.waba_id}/message_templates?name=${STAMP_TEMPLATE.name}&fields=name,status,language,rejected_reason`,
        { token: connection.access_token },
    );
    if (!result.ok) throw new HttpError(502, `No se pudo consultar la plantilla en Meta: ${graphError(result)}`);
    const template = (result.data?.data ?? []).find(t => t.name === STAMP_TEMPLATE.name && t.language === STAMP_TEMPLATE.language);
    return { name: STAMP_TEMPLATE.name, status: template?.status ?? null, rejected_reason: template?.rejected_reason ?? null };
};

const panelConnection = async (req) => {
    requireServer();
    const user = await authenticate(req);
    const connection = await connectionOfUser(user.id);
    if (!connection) throw new HttpError(409, 'Conecta WhatsApp primero.');
    return connection;
};

const getTemplate = async (req, res) => sendJson(res, 200, await templateStatus(await panelConnection(req)));

const createTemplate = async (req, res) => {
    const connection = await panelConnection(req);
    const current = await templateStatus(connection);
    if (current.status && current.status !== 'REJECTED') return sendJson(res, 200, current);
    const result = await graph(`${connection.waba_id}/message_templates`, {
        token: connection.access_token,
        method: 'POST',
        body: {
            name: STAMP_TEMPLATE.name,
            language: STAMP_TEMPLATE.language,
            category: STAMP_TEMPLATE.category,
            components: [
                { type: 'BODY', text: STAMP_TEMPLATE.body, example: { body_text: [STAMP_TEMPLATE.example] } },
                { type: 'BUTTONS', buttons: STAMP_TEMPLATE.buttons.map(text => ({ type: 'QUICK_REPLY', text })) },
            ],
        },
    });
    if (!result.ok) throw new HttpError(502, `Meta no aceptó la plantilla: ${graphError(result)}`);
    return sendJson(res, 200, { name: STAMP_TEMPLATE.name, status: result.data?.status ?? 'PENDING', rejected_reason: null });
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
        else if (route === 'POST /api/loyalty/request') await requestStamp(req, res);
        else if (route === 'GET /api/loyalty/template') await getTemplate(req, res);
        else if (route === 'POST /api/loyalty/template') await createTemplate(req, res);
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

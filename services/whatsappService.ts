import { supabase } from './supabaseClient.ts';
import { LoyaltyCustomer, LoyaltyStampRequest, Profile, WhatsAppConnection } from '../types.ts';

// WhatsApp Business connection (supabase/whatsapp-cloud.sql), the WhatsApp features of the store and the
// loyalty program (supabase/loyalty.sql). Saving credentials, stamp requests and the validation template go
// through server.js (/api/...), which holds the Meta app secret and the service key; the rest is Supabase.

// Thrown when a migration has not run, so pages can say which one instead of failing
export class SchemaMissing extends Error {
    constructor(public migration: string) {
        super(`Falta ejecutar la migración supabase/${migration} en Supabase.`);
    }
}

// Missing table (PGRST205, 42P01), function (PGRST202, 42883) or column (PGRST204, 42703)
const MISSING = new Set(['PGRST205', '42P01', 'PGRST202', '42883', 'PGRST204', '42703']);
const isMissing = (error: { code?: string } | null) => !!error?.code && MISSING.has(error.code);

const client = () => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    return supabase;
};

// POST to server.js with the panel's session
const callApi = async <T>(path: string, body: unknown): Promise<T> => {
    const { data: { session } } = await client().auth.getSession();
    if (!session) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
    let res: Response;
    try {
        res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify(body),
        });
    } catch {
        throw new Error('No se pudo contactar al servidor. Revisa tu conexión.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        // `npm run dev` only runs Vite: the API lives in server.js
        if (!data && res.status === 404) throw new Error('Este servidor no tiene la API de WhatsApp. Pruébalo con npm run build y npm start.');
        throw new Error(data?.error || `El servidor respondió ${res.status}.`);
    }
    return data as T;
};

// --- Connection ---

export const getWhatsAppConnection = async (): Promise<WhatsAppConnection | null> => {
    const { data, error } = await client().rpc('my_whatsapp_connection');
    if (isMissing(error)) throw new SchemaMissing('whatsapp-cloud.sql');
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) ?? null;
};

export interface ConnectionForm {
    phone_number_id: string;
    waba_id: string;
    access_token: string;
    pin: string;
    display_phone_number: string;
    verified_name: string;
}

// Validates the credentials with Meta, subscribes the app to the WABA, registers the number and saves it.
// `warnings` lists the steps that failed without stopping the save.
export const connectWhatsApp = (form: ConnectionForm) =>
    callApi<{ connection: WhatsAppConnection; warnings: string[] }>('/api/whatsapp/connect', form);

export const disconnectWhatsApp = async (): Promise<void> => {
    const { error } = await client().rpc('disconnect_whatsapp');
    if (error) throw new Error(error.message);
};

// --- Profile settings of the WhatsApp features ---

const updateOwnProfile = async (changes: Partial<Profile>, migration: string): Promise<Profile> => {
    const db = client();
    const { data: { user } } = await db.auth.getUser();
    if (!user) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
    // Upsert with only these columns, so the rest of the profile is left as it is
    const { data, error } = await db.from('profiles').upsert({ id: user.id, ...changes }).select().single();
    if (isMissing(error)) throw new SchemaMissing(migration);
    // Messages raised by the database (e.g. "Conecta WhatsApp antes de...") are already in Spanish
    if (error) throw new Error(error.code === 'P0001' ? error.message : 'No se pudieron guardar los cambios.');
    return data as Profile;
};

export const saveOrdersSettings = (settings: Pick<Profile, 'orders_enabled' | 'orders_whatsapp' | 'orders_delivery'>) =>
    updateOwnProfile(settings, 'whatsapp-orders.sql');

export const saveLoyaltySettings = (settings: Pick<Profile, 'loyalty_enabled' | 'loyalty_goal' | 'loyalty_reward' | 'loyalty_approver_whatsapp'>) =>
    updateOwnProfile(settings, 'loyalty.sql');

// --- Loyalty customers ---

export const getLoyaltyCustomers = async (): Promise<LoyaltyCustomer[]> => {
    const { data, error } = await client()
        .from('loyalty_customers')
        .select('*')
        .order('created_at', { ascending: false });
    if (isMissing(error)) throw new SchemaMissing('loyalty.sql');
    if (error) throw new Error(error.message);
    return data as LoyaltyCustomer[];
};

const loyaltyRpc = async (fn: string, args: Record<string, unknown>): Promise<LoyaltyCustomer> => {
    const { data, error } = await client().rpc(fn, args);
    if (isMissing(error)) throw new SchemaMissing('loyalty.sql');
    if (error) throw new Error(error.message);
    return data as LoyaltyCustomer;
};

export const saveLoyaltyCustomer = (phone: string, name: string) =>
    loyaltyRpc('save_loyalty_customer', { customer_phone: phone, customer_name: name });

export const addLoyaltyStamp = (id: number) => loyaltyRpc('add_loyalty_stamp', { target: id });

export const removeLoyaltyStamp = (id: number) => loyaltyRpc('remove_loyalty_stamp', { target: id });

export const redeemLoyaltyReward = (id: number) => loyaltyRpc('redeem_loyalty_reward', { target: id });

export const deleteLoyaltyCustomer = async (id: number): Promise<void> => {
    const { error } = await client().from('loyalty_customers').delete().eq('id', id);
    if (error) throw new Error(error.message);
};

// --- Stamp requests (the business validates them by WhatsApp or here) ---

// Pending ones, plus the ones decided in the last day so the panel shows what just happened
export const getStampRequests = async (): Promise<LoyaltyStampRequest[]> => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await client()
        .from('loyalty_stamp_requests')
        .select('id, customer_id, status, created_at, decided_at, decided_via, notify_mode, notify_error, customer:loyalty_customers(name, phone, stamps)')
        .or(`status.eq.pending,decided_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(50);
    if (isMissing(error)) throw new SchemaMissing('loyalty.sql');
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as LoyaltyStampRequest[];
};

export interface StampDecision {
    status: LoyaltyStampRequest['status'];
    changed: boolean;
    stamps: number;
    goal: number;
}

export const decideStampRequest = async (id: number, approve: boolean): Promise<StampDecision> => {
    const { data, error } = await client().rpc('decide_loyalty_stamp_request', { request: id, approve });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) as StampDecision;
};

// --- Validation template (Meta reviews it before it can be used) ---

export interface TemplateStatus {
    name: string;
    // APPROVED, PENDING, REJECTED... or null when it does not exist yet
    status: string | null;
    rejected_reason: string | null;
}

const getApi = async <T>(path: string): Promise<T> => {
    const { data: { session } } = await client().auth.getSession();
    if (!session) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
    const res = await fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` } });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `El servidor respondió ${res.status}.`);
    return data as T;
};

export const getTemplateStatus = () => getApi<TemplateStatus>('/api/loyalty/template');

export const createTemplate = () => callApi<TemplateStatus>('/api/loyalty/template', {});

// --- Loyalty landing (public) ---

// The customer asks for a stamp; the business gets it by WhatsApp. Public: no session.
export const requestStamp = async (store: string, phone: string, name: string) => {
    let res: Response;
    try {
        res = await fetch('/api/loyalty/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store, phone, name }),
        });
    } catch {
        throw new Error('No se pudo enviar la solicitud. Revisa tu conexión.');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || 'No se pudo enviar la solicitud. Inténtalo de nuevo.');
    return data as { token: string; card_token: string };
};

export interface StampRequestStatus {
    status: LoyaltyStampRequest['status'];
    stamps: number;
    goal: number;
    card_token: string;
}

export const getStampRequestStatus = async (token: string): Promise<StampRequestStatus | null> => {
    const { data, error } = await client().rpc('loyalty_request_status', { request_token: token });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) ?? null;
};

export interface LoyaltyCard {
    name: string | null;
    stamps: number;
    goal: number;
    rewards_redeemed: number;
    // A request still waiting for the business
    pending: boolean;
}

export const getLoyaltyCard = async (store: string, card: string): Promise<LoyaltyCard | null> => {
    const { data, error } = await client().rpc('loyalty_card', { store, card });
    if (error) throw new Error(error.message);
    return (Array.isArray(data) ? data[0] : data) ?? null;
};

// "56912345678" → "+56 9 1234 5678"; other countries as they come
export const formatPhone = (digits: string) => {
    const chile = /^56(9)(\d{4})(\d{4})$/.exec(digits);
    return chile ? `+56 ${chile[1]} ${chile[2]} ${chile[3]}` : `+${digits}`;
};

// Public page where customers ask for stamps and see their card; the counter QR points here
export const loyaltyLandingUrl = (store: string) =>
    `${window.location.origin}${window.location.pathname}#/sellos/${store}`;

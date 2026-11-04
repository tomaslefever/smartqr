import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from './AppShell.tsx';
import Modal, { modalBodyClass, modalFooterClass } from './Modal.tsx';
import Switch from './Switch.tsx';
import WhatsAppAgentSection from './WhatsAppAgentSection.tsx';
import { StatusDot, errorText, warningBoxClass } from './whatsappUi.tsx';
import { ArrowRightIcon, ChatIcon, CheckIcon, GiftIcon } from './Icons.tsx';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from './storeOrder.ts';
import { buttonClass, cardClass, errorBoxClass, hintClass, inputClass, labelClass, successBoxClass } from './ui.ts';
import { Profile, WhatsAppConnection } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import * as whatsappService from '../services/whatsappService.ts';
import { ConnectionForm, SchemaMissing } from '../services/whatsappService.ts';

// --- Manual credentials ---

const emptyForm: ConnectionForm = {
    phone_number_id: '',
    waba_id: '',
    access_token: '',
    pin: '',
    display_phone_number: '',
    verified_name: '',
};

interface ConnectionModalProps {
    current: WhatsAppConnection | null;
    onClose: () => void;
    onSaved: (connection: WhatsAppConnection, warnings: string[]) => void;
}

const ConnectionModal: React.FC<ConnectionModalProps> = ({ current, onClose, onSaved }) => {
    const [form, setForm] = useState<ConnectionForm>(() => current ? {
        ...emptyForm,
        phone_number_id: current.phone_number_id,
        waba_id: current.waba_id,
        display_phone_number: current.display_phone_number ?? '',
        verified_name: current.verified_name ?? '',
    } : emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const set = (field: keyof ConnectionForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = field === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 6) : e.target.value;
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.phone_number_id.trim() || !form.waba_id.trim() || !form.access_token.trim() || !form.display_phone_number.trim()) {
            setError('Completa los campos obligatorios.');
            return;
        }
        if (form.pin && form.pin.length !== 6) {
            setError('El PIN son 6 dígitos.');
            return;
        }
        setError(null);
        setSaving(true);
        try {
            const { connection, warnings } = await whatsappService.connectWhatsApp({
                ...form,
                phone_number_id: form.phone_number_id.trim(),
                waba_id: form.waba_id.trim(),
                access_token: form.access_token.trim(),
            });
            onSaved(connection, warnings);
        } catch (err) {
            setError(errorText(err, 'No se pudo guardar la conexión.'));
            setSaving(false);
        }
    };

    const required = <span className="text-danger" aria-hidden="true"> *</span>;

    return (
        <Modal
            title={current ? 'Editar credenciales de WhatsApp' : 'Conectar WhatsApp manualmente'}
            description="Los datos están en Meta Business Suite y en tu app de Meta (WhatsApp → Configuración de la API)."
            onClose={onClose}
        >
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className={`${modalBodyClass} space-y-4`}>
                    <div>
                        <label htmlFor="phone_number_id" className={labelClass}>Phone Number ID{required}</label>
                        <input id="phone_number_id" inputMode="numeric" autoComplete="off" placeholder="123456789012345" value={form.phone_number_id} onChange={set('phone_number_id')} className={`${inputClass} mt-1.5`} />
                    </div>
                    <div>
                        <label htmlFor="waba_id" className={labelClass}>WhatsApp Business Account ID (WABA ID){required}</label>
                        <input id="waba_id" inputMode="numeric" autoComplete="off" placeholder="123456789012345" value={form.waba_id} onChange={set('waba_id')} className={`${inputClass} mt-1.5`} />
                    </div>
                    <div>
                        <label htmlFor="access_token" className={labelClass}>Access Token{required}</label>
                        <input id="access_token" type="password" autoComplete="off" placeholder={current ? 'Vuelve a pegar el token para guardar' : 'EAAxxxxxxxx...'} value={form.access_token} onChange={set('access_token')} className={`${inputClass} mt-1.5`} />
                        <p className={`${hintClass} mt-1.5`}>
                            El token del System User debe tener control total sobre la cuenta de WhatsApp y ser de la app de Meta de SmartQR. Se guarda en el servidor; no se vuelve a mostrar.
                        </p>
                    </div>
                    <div>
                        <label htmlFor="pin" className={labelClass}>PIN de verificación en dos pasos</label>
                        <input id="pin" inputMode="numeric" autoComplete="off" placeholder="123456" value={form.pin} onChange={set('pin')} className={`${inputClass} mt-1.5`} />
                        <p className={`${hintClass} mt-1.5`}>
                            Si el número ya tiene verificación en dos pasos, ingresa su PIN. Si no la tiene, este PIN quedará configurado al registrarlo.
                        </p>
                    </div>
                    <div>
                        <label htmlFor="display_phone_number" className={labelClass}>Display Phone Number{required}</label>
                        <input id="display_phone_number" type="tel" autoComplete="off" placeholder="+56 9 1234 5678" value={form.display_phone_number} onChange={set('display_phone_number')} className={`${inputClass} mt-1.5`} />
                    </div>
                    <div>
                        <label htmlFor="verified_name" className={labelClass}>Verified Business Name</label>
                        <input id="verified_name" autoComplete="off" placeholder="Mi negocio" value={form.verified_name} onChange={set('verified_name')} className={`${inputClass} mt-1.5`} />
                    </div>
                    <p className={warningBoxClass}>
                        Al registrar el número en la API de WhatsApp deja de funcionar en la app WhatsApp Business del teléfono (salvo que esté en modo coexistencia).
                    </p>
                    {error && <p className={errorBoxClass}>{error}</p>}
                </div>
                <div className={modalFooterClass}>
                    <button type="button" onClick={onClose} className={buttonClass('secondary')} disabled={saving}>Cancelar</button>
                    <button type="submit" className={buttonClass('primary')} disabled={saving}>{saving ? 'Verificando con Meta…' : 'Guardar'}</button>
                </div>
            </form>
        </Modal>
    );
};

// --- Connection card ---

interface ConnectionCardProps {
    connection: WhatsAppConnection | null;
    onChange: (connection: WhatsAppConnection | null) => void;
}

const ConnectionCard: React.FC<ConnectionCardProps> = ({ connection, onChange }) => {
    const [editing, setEditing] = useState(false);
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [disconnecting, setDisconnecting] = useState(false);

    const handleSaved = (saved: WhatsAppConnection, warnings: string[]) => {
        setEditing(false);
        onChange(saved);
        setNotice(warnings.length
            ? { ok: false, text: 'Se guardó la conexión, pero hay pasos pendientes (abajo).' }
            : { ok: true, text: 'WhatsApp quedó conectado.' });
    };

    const disconnect = async () => {
        if (!window.confirm('¿Desconectar WhatsApp? Se borran las credenciales y se apaga el sistema de lealtad.')) return;
        setDisconnecting(true);
        setError(null);
        try {
            await whatsappService.disconnectWhatsApp();
            onChange(null);
            setNotice(null);
        } catch (e) {
            setError(errorText(e, 'No se pudo desconectar.'));
        } finally {
            setDisconnecting(false);
        }
    };

    return (
        <section className={`${cardClass} p-5`} aria-labelledby="connection-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ChatIcon /></span>
                    <div>
                        <h2 id="connection-title" className="text-sm font-semibold text-fg">Conexión con WhatsApp Business</h2>
                        {connection ? (
                            <p className="mt-0.5 flex items-center gap-2 text-sm text-fg-muted">
                                <StatusDot ok={connection.webhooks_subscribed && !connection.setup_error} />
                                {connection.webhooks_subscribed && !connection.setup_error ? 'Conectado' : 'Conectado con avisos'}
                            </p>
                        ) : (
                            <p className="mt-0.5 text-sm text-fg-muted">
                                Conecta el número de tu negocio a la API de WhatsApp para recibir mensajes de tus clientes y responderles desde SmartQR.
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap gap-2">
                    {connection ? (
                        <>
                            <button type="button" onClick={() => setEditing(true)} className={buttonClass('secondary', 'sm')}>Editar credenciales</button>
                            <button type="button" onClick={disconnect} disabled={disconnecting} className={buttonClass('danger', 'sm')}>
                                {disconnecting ? 'Desconectando…' : 'Desconectar'}
                            </button>
                        </>
                    ) : (
                        <button type="button" onClick={() => setEditing(true)} className={buttonClass('primary')}>Configurar manualmente</button>
                    )}
                </div>
            </div>

            {connection && (
                <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
                    <div>
                        <dt className={hintClass}>Número</dt>
                        <dd className="font-medium tabular-nums text-fg">{connection.display_phone_number || '—'}</dd>
                    </div>
                    <div>
                        <dt className={hintClass}>Nombre verificado</dt>
                        <dd className="font-medium text-fg">{connection.verified_name || '—'}</dd>
                    </div>
                    <div>
                        <dt className={hintClass}>Phone Number ID</dt>
                        <dd className="tabular-nums text-fg-muted">{connection.phone_number_id}</dd>
                    </div>
                    <div>
                        <dt className={hintClass}>WABA ID</dt>
                        <dd className="tabular-nums text-fg-muted">{connection.waba_id}</dd>
                    </div>
                    <div className="sm:col-span-2">
                        <dt className={hintClass}>Webhook</dt>
                        <dd className="flex items-center gap-2 text-fg-muted">
                            <StatusDot ok={connection.webhooks_subscribed} />
                            {connection.webhooks_subscribed ? 'La app está suscrita: los mensajes llegan a SmartQR.' : 'La app no quedó suscrita al WABA: los mensajes no llegan a SmartQR.'}
                        </dd>
                    </div>
                </dl>
            )}

            {notice && <p className={`${notice.ok ? successBoxClass : warningBoxClass} mt-4`}>{notice.text}</p>}
            {connection?.setup_error && <p className={`${warningBoxClass} mt-4`}>{connection.setup_error}</p>}
            {error && <p className={`${errorBoxClass} mt-4`}>{error}</p>}

            {editing && <ConnectionModal current={connection} onClose={() => setEditing(false)} onSaved={handleSaved} />}
        </section>
    );
};

// --- Orders by WhatsApp ---

interface OrdersCardProps {
    profile: Profile | null;
    connection: WhatsAppConnection | null;
    onSaved: (profile: Profile) => void;
}

// The customer builds the order in the store and WhatsApp opens with the message for this number: a wa.me
// link, no API. The order is a plain chat message the business answers from the WhatsApp app on its phone,
// so the number must not be the one connected to the Cloud API (that one stops working in the app).

const FeatureTag: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 align-middle text-[11px] font-medium text-fg-muted">{children}</span>
);

const OrdersCard: React.FC<OrdersCardProps> = ({ profile, connection, onSaved }) => {
    const supported = !!profile && 'orders_enabled' in profile;
    const [enabled, setEnabled] = useState(profile?.orders_enabled === true);
    const [number, setNumber] = useState(profile?.orders_whatsapp ?? '');
    const [delivery, setDelivery] = useState(profile?.orders_delivery === true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const connectedNumber = normalizeWhatsAppNumber(connection?.display_phone_number ?? '');
    const changed = enabled !== (profile?.orders_enabled === true)
        || normalizeWhatsAppNumber(number) !== (profile?.orders_whatsapp ?? '')
        || delivery !== (profile?.orders_delivery === true);

    const save = async () => {
        const digits = normalizeWhatsAppNumber(number);
        if (enabled && !isValidWhatsAppNumber(digits)) {
            setError('Escribe el número de WhatsApp para pedidos con código de país, por ejemplo 56912345678.');
            return;
        }
        setError(null);
        setSaving(true);
        try {
            const updated = await whatsappService.saveOrdersSettings({
                orders_enabled: enabled,
                orders_whatsapp: isValidWhatsAppNumber(digits) ? digits : null,
                orders_delivery: delivery,
            });
            onSaved(updated);
            setNumber(updated.orders_whatsapp ?? '');
            setSaved(true);
        } catch (e) {
            setError(errorText(e, 'No se pudieron guardar los cambios.'));
        } finally {
            setSaving(false);
        }
    };

    const touch = <T,>(setter: (value: T) => void) => (value: T) => {
        setSaved(false);
        setter(value);
    };

    return (
        <section className={`${cardClass} flex flex-col p-5`} aria-labelledby="orders-title">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 id="orders-title" className="text-sm font-semibold text-fg"><label htmlFor="orders_enabled">Pedir por WhatsApp</label><FeatureTag>Sin API</FeatureTag></h2>
                    <p className={`${hintClass} mt-0.5`}>Tus clientes arman su pedido en la carta y te llega como un mensaje directo a tu WhatsApp, listo para confirmar. No necesita conexión.</p>
                </div>
                <Switch id="orders_enabled" checked={enabled} onChange={touch(setEnabled)} disabled={!supported} />
            </div>

            {!supported && <p className={`${hintClass} mt-3`}>Para activarlo hay que ejecutar la migración supabase/whatsapp-orders.sql.</p>}

            {supported && enabled && (
                <div className="mt-4 space-y-4">
                    <div>
                        <label htmlFor="orders_whatsapp" className={labelClass}>Número que recibe los pedidos</label>
                        <input type="tel" id="orders_whatsapp" value={number} onChange={(e) => touch(setNumber)(e.target.value)} placeholder="56912345678" className={`${inputClass} mt-1.5`} />
                        <p className={`${hintClass} mt-1.5`}>Con código de país. Es el WhatsApp donde atiendes los pedidos, en la app de tu teléfono.</p>
                        {isValidWhatsAppNumber(connectedNumber) && normalizeWhatsAppNumber(number) === connectedNumber && (
                            <p className={`${warningBoxClass} mt-2`}>
                                Este es el número conectado a la API: ahí los pedidos no llegan a la app de tu teléfono (salvo en modo coexistencia). Usa el WhatsApp donde atiendes a tus clientes.
                            </p>
                        )}
                    </div>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <label htmlFor="orders_delivery" className={labelClass}>Hago despachos a domicilio</label>
                            <p className={`${hintClass} mt-0.5`}>Si no, los pedidos son para retiro en el local. Los que llegan desde el QR de una mesa indican la mesa.</p>
                        </div>
                        <Switch id="orders_delivery" checked={delivery} onChange={touch(setDelivery)} />
                    </div>
                </div>
            )}

            {error && <p className={`${errorBoxClass} mt-4`}>{error}</p>}

            {supported && (
                <div className="mt-auto flex items-center justify-end gap-3 pt-4">
                    {saved && !changed && <span className="flex items-center gap-1 text-sm text-success"><CheckIcon /> Guardado</span>}
                    <button type="button" onClick={save} disabled={saving || !changed} className={buttonClass('primary', 'sm')}>
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            )}
        </section>
    );
};

// --- Loyalty shortcut ---

const LoyaltyCard: React.FC<{ profile: Profile | null; connection: WhatsAppConnection | null }> = ({ profile, connection }) => {
    const active = profile?.loyalty_enabled === true;
    return (
        <section className={`${cardClass} flex flex-col p-5`} aria-labelledby="loyalty-title">
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><GiftIcon /></span>
                <div>
                    <h2 id="loyalty-title" className="text-sm font-semibold text-fg">Sistema de lealtad<FeatureTag>Con API</FeatureTag></h2>
                    <p className={`${hintClass} mt-0.5`}>Tarjeta de sellos por WhatsApp: cada compra suma un sello y al completarla tu cliente gana un premio. Un asistente en el número conectado inscribe a tus clientes y les responde; los sellos se guardan en tu base.</p>
                </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
                <StatusDot ok={active} />
                {active ? 'Activo' : connection ? 'Inactivo' : 'Necesita WhatsApp conectado'}
            </p>
            <div className="mt-auto flex justify-end pt-4">
                <Link to="/lealtad" className={buttonClass('secondary', 'sm')}>
                    Configurar
                    <ArrowRightIcon />
                </Link>
            </div>
        </section>
    );
};

// --- Page ---

const WhatsAppPage: React.FC = () => {
    const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [connectionMissing, setConnectionMissing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const [connectionResult, profileResult] = await Promise.allSettled([
            whatsappService.getWhatsAppConnection(),
            supabaseService.getProfile(),
        ]);
        if (connectionResult.status === 'fulfilled') setConnection(connectionResult.value);
        else if (connectionResult.reason instanceof SchemaMissing) setConnectionMissing(connectionResult.reason.message);
        else setError(errorText(connectionResult.reason, 'No se pudo cargar la conexión.'));
        if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // Disconnecting also turns the loyalty program off in the database
    const handleConnectionChange = (next: WhatsAppConnection | null) => {
        setConnection(next);
        if (!next) setProfile(prev => (prev ? { ...prev, loyalty_enabled: false } : prev));
    };

    return (
        <>
            <PageHeader title="WhatsApp" description="Conecta el WhatsApp de tu negocio y elige qué funciones usar. Cada una se activa por separado." />

            {loading ? (
                <div className="space-y-6">
                    <div className="h-28 animate-pulse rounded-xl bg-muted" />
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="h-40 animate-pulse rounded-xl bg-muted" />
                        <div className="h-40 animate-pulse rounded-xl bg-muted" />
                    </div>
                </div>
            ) : (
                <div className="space-y-10">
                    {connectionMissing ? (
                        <p className={errorBoxClass}>{connectionMissing}</p>
                    ) : error ? (
                        <p className={errorBoxClass}>{error}</p>
                    ) : (
                        <ConnectionCard connection={connection} onChange={handleConnectionChange} />
                    )}

                    <div>
                        <h2 className="text-base font-semibold text-fg">Funciones</h2>
                        <p className="mt-1 mb-4 text-sm text-fg-muted">Actívalas según lo que necesite tu negocio. Los pedidos funcionan con cualquier WhatsApp; el sistema de lealtad necesita la conexión de arriba.</p>
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            <OrdersCard profile={profile} connection={connection} onSaved={setProfile} />
                            <LoyaltyCard profile={profile} connection={connection} />
                        </div>
                    </div>

                    <WhatsAppAgentSection />
                </div>
            )}
        </>
    );
};

export default WhatsAppPage;

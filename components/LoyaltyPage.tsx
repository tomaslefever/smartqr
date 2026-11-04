import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { PageHeader } from './AppShell.tsx';
import Switch from './Switch.tsx';
import QRCodeComponent, { QR_OPTIONS } from './QRCode.tsx';
import { ArrowRightIcon, CheckIcon, CopyIcon, DeleteIcon, DownloadIcon, GiftIcon, PlusIcon, SearchIcon } from './Icons.tsx';
import { StatusDot, errorText, warningBoxClass } from './whatsappUi.tsx';
import { buttonClass, cardClass, errorBoxClass, hintClass, iconButtonClass, inputClass, labelClass, successBoxClass } from './ui.ts';
import { isValidWhatsAppNumber, normalizeWhatsAppNumber } from './storeOrder.ts';
import { LoyaltyCustomer, LoyaltyStampRequest, Profile, WhatsAppConnection } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import * as supabaseService from '../services/supabaseService.ts';
import * as whatsappService from '../services/whatsappService.ts';
import { SchemaMissing, TemplateStatus, formatPhone, loyaltyLandingUrl } from '../services/whatsappService.ts';

const DEFAULT_GOAL = 10;
// Pending requests show up without reloading
const REQUESTS_POLL_MS = 10000;

const relativeTime = (iso: string, now = Date.now()) => {
    const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
    const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    return rtf.format(Math.round(hours / 24), 'day');
};

const customerLabel = (customer: { name: string | null; phone: string } | null | undefined) =>
    customer ? (customer.name ? `${customer.name} · ${formatPhone(customer.phone)}` : formatPhone(customer.phone)) : 'Cliente';

// --- Program settings ---

interface SettingsCardProps {
    profile: Profile | null;
    connection: WhatsAppConnection | null;
    onSaved: (profile: Profile) => void;
}

const TEMPLATE_LABEL: Record<string, string> = {
    APPROVED: 'Aprobada',
    PENDING: 'En revisión por Meta',
    IN_APPEAL: 'En apelación',
    REJECTED: 'Rechazada',
    PAUSED: 'Pausada por Meta',
    DISABLED: 'Desactivada por Meta',
};

// Meta reviews the template before it can be used; without it, requests only reach the business while it
// has written to the connected number in the last 24 hours
const TemplateRow: React.FC<{ connection: WhatsAppConnection | null }> = ({ connection }) => {
    const [template, setTemplate] = useState<TemplateStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!connection) return;
        setLoading(true);
        whatsappService.getTemplateStatus()
            .then(setTemplate)
            .catch(e => setError(errorText(e, 'No se pudo consultar la plantilla.')))
            .finally(() => setLoading(false));
    }, [connection]);

    const create = async () => {
        setCreating(true);
        setError(null);
        try {
            setTemplate(await whatsappService.createTemplate());
        } catch (e) {
            setError(errorText(e, 'No se pudo crear la plantilla.'));
        } finally {
            setCreating(false);
        }
    };

    if (!connection) return null;
    const status = template?.status ?? null;
    const canCreate = !loading && (!status || status === 'REJECTED');

    return (
        <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className={labelClass}>Plantilla de validación</p>
                    <p className={`${hintClass} mt-0.5`}>
                        Con ella las solicitudes te llegan aunque no le hayas escrito al número conectado en las últimas 24 horas.
                    </p>
                    {!loading && (
                        <p className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
                            <StatusDot ok={status === 'APPROVED'} />
                            {status ? TEMPLATE_LABEL[status] ?? status : 'Sin crear'}
                            {template?.rejected_reason && template.rejected_reason !== 'NONE' && ` (${template.rejected_reason})`}
                        </p>
                    )}
                </div>
                {canCreate && (
                    <button type="button" onClick={create} disabled={creating} className={buttonClass('secondary', 'sm')}>
                        {creating ? 'Creando…' : status === 'REJECTED' ? 'Volver a crear' : 'Crear plantilla'}
                    </button>
                )}
            </div>
            {error && <p className={`${errorBoxClass} mt-3`}>{error}</p>}
        </div>
    );
};

const SettingsCard: React.FC<SettingsCardProps> = ({ profile, connection, onSaved }) => {
    const [enabled, setEnabled] = useState(profile?.loyalty_enabled === true);
    const [goal, setGoal] = useState(String(profile?.loyalty_goal ?? DEFAULT_GOAL));
    const [reward, setReward] = useState(profile?.loyalty_reward ?? '');
    const [approver, setApprover] = useState(profile?.loyalty_approver_whatsapp ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    const goalNumber = Math.floor(Number(goal));
    const approverDigits = normalizeWhatsAppNumber(approver);
    const connectedDigits = normalizeWhatsAppNumber(connection?.display_phone_number ?? '');
    const changed = enabled !== (profile?.loyalty_enabled === true)
        || goalNumber !== (profile?.loyalty_goal ?? DEFAULT_GOAL)
        || reward.trim() !== (profile?.loyalty_reward ?? '')
        || approverDigits !== (profile?.loyalty_approver_whatsapp ?? '');
    // The switch can always be turned off; turning it on needs a connected WhatsApp
    const canEnable = !!connection;

    const save = async () => {
        if (!Number.isFinite(goalNumber) || goalNumber < 2 || goalNumber > 50) {
            setError('Los sellos para el premio van de 2 a 50.');
            return;
        }
        if (approver.trim() && !isValidWhatsAppNumber(approverDigits)) {
            setError('Escribe el WhatsApp que valida los sellos con código de país, por ejemplo 56912345678.');
            return;
        }
        if (enabled && !approver.trim()) {
            setError('Indica el WhatsApp al que llegan las solicitudes de sello.');
            return;
        }
        if (enabled && !reward.trim()) {
            setError('Escribe el premio que gana el cliente al completar la tarjeta.');
            return;
        }
        setError(null);
        setSaving(true);
        try {
            const updated = await whatsappService.saveLoyaltySettings({
                loyalty_enabled: enabled,
                loyalty_goal: goalNumber,
                loyalty_reward: reward.trim() || null,
                loyalty_approver_whatsapp: approver.trim() ? approverDigits : null,
            });
            onSaved(updated);
            setApprover(updated.loyalty_approver_whatsapp ?? '');
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
        <section className={`${cardClass} p-5`} aria-labelledby="loyalty-settings-title">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 id="loyalty-settings-title" className="text-sm font-semibold text-fg"><label htmlFor="loyalty_enabled">Activar el sistema de lealtad</label></h2>
                    <p className={`${hintClass} mt-0.5`}>
                        {canEnable
                            ? `Las solicitudes de sello salen desde ${connection?.display_phone_number || 'tu número conectado'}.`
                            : 'Necesitas WhatsApp conectado y configurado para activarlo.'}
                    </p>
                </div>
                <Switch id="loyalty_enabled" checked={enabled} onChange={touch(setEnabled)} disabled={!canEnable && !enabled} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
                <div>
                    <label htmlFor="loyalty_goal" className={labelClass}>Sellos</label>
                    <input id="loyalty_goal" type="number" min={2} max={50} inputMode="numeric" value={goal} onChange={(e) => touch(setGoal)(e.target.value)} className={`${inputClass} mt-1.5`} />
                </div>
                <div>
                    <label htmlFor="loyalty_reward" className={labelClass}>Premio</label>
                    <input id="loyalty_reward" maxLength={120} value={reward} onChange={(e) => touch(setReward)(e.target.value)} placeholder="Un café gratis" className={`${inputClass} mt-1.5`} />
                </div>
            </div>
            <div className="mt-4">
                <label htmlFor="loyalty_approver" className={labelClass}>WhatsApp que valida los sellos</label>
                <input id="loyalty_approver" type="tel" value={approver} onChange={(e) => touch(setApprover)(e.target.value)} placeholder="56912345678" className={`${inputClass} mt-1.5`} />
                <p className={`${hintClass} mt-1.5`}>
                    El celular del local o de quien atiende la caja. Ahí llega cada solicitud con los botones Validar y Rechazar. Tiene que ser distinto del número conectado.
                </p>
                {isValidWhatsAppNumber(connectedDigits) && approverDigits === connectedDigits && (
                    <p className={`${warningBoxClass} mt-2`}>Ese es el número conectado a la API: no se puede escribir a sí mismo. Usa otro WhatsApp.</p>
                )}
            </div>

            {error && <p className={`${errorBoxClass} mt-4`}>{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-3">
                {saved && !changed && <span className="flex items-center gap-1 text-sm text-success"><CheckIcon /> Guardado</span>}
                <button type="button" onClick={save} disabled={saving || !changed} className={buttonClass('primary', 'sm')}>
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>

            <TemplateRow connection={connection} />
        </section>
    );
};

// --- Counter QR ---

const CounterQRCard: React.FC<{ store: string; active: boolean }> = ({ store, active }) => {
    const url = loyaltyLandingUrl(store);
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
        } catch {
            // Clipboard blocked; the link is on screen
        }
    };

    const download = async () => {
        try {
            const link = document.createElement('a');
            link.href = await QRCode.toDataURL(url, { ...QR_OPTIONS, width: 1024, margin: 4 });
            link.download = 'smartqr-sellos.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error generating the stamps QR code:', error);
        }
    };

    return (
        <section className={`${cardClass} p-5`} aria-labelledby="loyalty-qr-title">
            <h2 id="loyalty-qr-title" className="text-sm font-semibold text-fg">QR para la caja</h2>
            <p className={`${hintClass} mt-0.5`}>Imprímelo junto a la caja. Tus clientes lo escanean al pagar, piden su sello y ven su tarjeta.</p>
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                <div className={`rounded-xl border border-line bg-white p-3 ${active ? '' : 'opacity-40'}`}>
                    <QRCodeComponent url={url} size={136} />
                </div>
                <div className="w-full min-w-0 flex-1 space-y-3">
                    {!active && <p className={hintClass}>El QR funciona cuando actives el sistema de lealtad.</p>}
                    <div className="flex gap-2">
                        <input readOnly value={url} onFocus={(e) => e.target.select()} className={`${inputClass} text-fg-muted`} aria-label="Link de la tarjeta de sellos" />
                        <button type="button" onClick={copy} className={buttonClass('secondary')} aria-label="Copiar link">
                            {copied ? <span className="text-success"><CheckIcon /></span> : <CopyIcon />}
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={download} className={buttonClass('secondary', 'sm')}>
                            <DownloadIcon />
                            Descargar QR
                        </button>
                        <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass('ghost', 'sm')}>Ver la página</a>
                    </div>
                </div>
            </div>
        </section>
    );
};

const HowItWorks: React.FC = () => (
    <section className={`${cardClass} p-5`} aria-labelledby="loyalty-how-title">
        <h2 id="loyalty-how-title" className="text-sm font-semibold text-fg">Cómo funciona</h2>
        <ol className="mt-3 space-y-3 text-sm text-fg-muted">
            <li><span className="font-medium text-fg">1. El cliente pide el sello.</span> Escanea el QR de la caja (o el botón de tu carta), pone su número y toca "Pedir sello".</li>
            <li><span className="font-medium text-fg">2. Tú lo validas por WhatsApp.</span> Te llega un mensaje con su nombre y sus sellos, con los botones Validar y Rechazar. También puedes decidir aquí, en Solicitudes.</li>
            <li><span className="font-medium text-fg">3. La tarjeta se llena.</span> El cliente ve el sello en su página al instante. Con la tarjeta completa te muestra la pantalla y marcas el canje en Clientes.</li>
        </ol>
        <p className={`${hintClass} mt-4`}>
            WhatsApp solo deja mandar mensajes con botones libres hasta 24 horas después de tu último mensaje al número conectado. Pasado ese plazo la solicitud va como plantilla, que Meta tiene que aprobar antes.
        </p>
    </section>
);

// --- Stamp requests ---

const REQUEST_STATUS: Record<LoyaltyStampRequest['status'], string> = {
    pending: 'Pendiente',
    approved: 'Validada',
    rejected: 'Rechazada',
    expired: 'Vencida',
};

interface RequestsCardProps {
    requests: LoyaltyStampRequest[];
    active: boolean;
    onDecided: () => void;
}

const RequestsCard: React.FC<RequestsCardProps> = ({ requests, active, onDecided }) => {
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const pending = requests.filter(r => r.status === 'pending');

    const decide = async (request: LoyaltyStampRequest, approve: boolean) => {
        setBusy(request.id);
        setError(null);
        try {
            await whatsappService.decideStampRequest(request.id, approve);
            onDecided();
        } catch (e) {
            setError(errorText(e, 'No se pudo guardar.'));
        } finally {
            setBusy(null);
        }
    };

    const notice = (request: LoyaltyStampRequest) => {
        if (request.status !== 'pending') {
            const via = request.decided_via === 'whatsapp' ? 'por WhatsApp' : request.decided_via === 'panel' ? 'en el panel' : '';
            return `${REQUEST_STATUS[request.status]}${via ? ` ${via}` : ''}`;
        }
        if (request.notify_error) return `No se pudo avisar por WhatsApp: ${request.notify_error}`;
        if (request.notify_mode === 'template') return 'Enviada por WhatsApp (plantilla)';
        if (request.notify_mode === 'interactive') return 'Enviada por WhatsApp';
        return 'Sin aviso por WhatsApp';
    };

    return (
        <section className={`${cardClass} overflow-hidden`} aria-labelledby="requests-title">
            <div className="border-b border-line p-5">
                <h2 id="requests-title" className="text-sm font-semibold text-fg">Solicitudes de sello</h2>
                <p className={`${hintClass} mt-0.5`}>
                    {pending.length === 0 ? 'No hay solicitudes pendientes.' : pending.length === 1 ? '1 pendiente' : `${pending.length} pendientes`} · se muestran también las del último día
                </p>
            </div>
            {error && <p className={`${errorBoxClass} mx-5 mt-4`}>{error}</p>}
            {requests.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-fg-subtle">Cuando un cliente pida un sello aparecerá aquí.</p>
            ) : (
                <ul className="divide-y divide-line">
                    {requests.map(request => (
                        <li key={request.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-fg">{customerLabel(request.customer)}</p>
                                <p className={`${hintClass} flex items-center gap-1.5`}>
                                    <StatusDot ok={request.status === 'approved' || (request.status === 'pending' && !request.notify_error)} />
                                    {relativeTime(request.created_at)} · {notice(request)}
                                </p>
                            </div>
                            {request.status === 'pending' && (
                                <div className="flex flex-shrink-0 gap-2">
                                    <button type="button" onClick={() => decide(request, false)} disabled={!active || busy === request.id} className={buttonClass('secondary', 'sm')}>Rechazar</button>
                                    <button type="button" onClick={() => decide(request, true)} disabled={!active || busy === request.id} className={buttonClass('primary', 'sm')}>
                                        <CheckIcon />
                                        Validar
                                    </button>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

// --- Customers ---

const StampDots: React.FC<{ stamps: number; goal: number }> = ({ stamps, goal }) => (
    <span className="flex flex-wrap items-center gap-1" aria-label={`${stamps} de ${goal} sellos`}>
        {Array.from({ length: goal }, (_, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < stamps ? 'bg-primary' : 'bg-control'}`} aria-hidden="true" />
        ))}
    </span>
);

type Action = 'stamp' | 'unstamp' | 'redeem';

const ACTION_DONE: Record<Action, string> = {
    stamp: 'Sello sumado.',
    unstamp: 'Sello quitado.',
    redeem: 'Premio canjeado.',
};

interface CustomersCardProps {
    customers: LoyaltyCustomer[];
    setCustomers: React.Dispatch<React.SetStateAction<LoyaltyCustomer[]>>;
    goal: number;
    active: boolean;
}

const CustomersCard: React.FC<CustomersCardProps> = ({ customers, setCustomers, goal, active }) => {
    const [search, setSearch] = useState('');
    const [adding, setAdding] = useState(false);
    const [newPhone, setNewPhone] = useState('');
    const [newName, setNewName] = useState('');
    const [savingNew, setSavingNew] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    const [notice, setNotice] = useState<{ id: number; ok: boolean; text: string } | null>(null);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return customers;
        const digits = term.replace(/\D/g, '');
        return customers.filter(c => (c.name ?? '').toLowerCase().includes(term) || (digits && c.phone.includes(digits)));
    }, [customers, search]);

    const replace = (updated: LoyaltyCustomer) =>
        setCustomers(prev => prev.map(c => (c.id === updated.id ? updated : c)));

    const addCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddError(null);
        setSavingNew(true);
        try {
            const saved = await whatsappService.saveLoyaltyCustomer(newPhone, newName);
            setCustomers(prev => [saved, ...prev.filter(c => c.id !== saved.id)]);
            setNewPhone('');
            setNewName('');
            setAdding(false);
            setNotice({ id: saved.id, ok: true, text: 'Cliente agregado.' });
        } catch (err) {
            setAddError(errorText(err, 'No se pudo agregar el cliente.'));
        } finally {
            setSavingNew(false);
        }
    };

    const act = async (customer: LoyaltyCustomer, action: Action) => {
        setBusy(customer.id);
        setNotice(null);
        try {
            const updated = action === 'stamp'
                ? await whatsappService.addLoyaltyStamp(customer.id)
                : action === 'redeem'
                    ? await whatsappService.redeemLoyaltyReward(customer.id)
                    : await whatsappService.removeLoyaltyStamp(customer.id);
            replace(updated);
            setNotice({ id: customer.id, ok: true, text: ACTION_DONE[action] });
        } catch (err) {
            setNotice({ id: customer.id, ok: false, text: errorText(err, 'No se pudo guardar.') });
        } finally {
            setBusy(null);
        }
    };

    const remove = async (customer: LoyaltyCustomer) => {
        const who = customer.name || formatPhone(customer.phone);
        if (!window.confirm(`¿Eliminar a ${who} del programa? Se borran sus sellos y su historial.`)) return;
        setBusy(customer.id);
        try {
            await whatsappService.deleteLoyaltyCustomer(customer.id);
            setCustomers(prev => prev.filter(c => c.id !== customer.id));
        } catch (err) {
            setNotice({ id: customer.id, ok: false, text: errorText(err, 'No se pudo eliminar.') });
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className={`${cardClass} overflow-hidden`} aria-labelledby="customers-title">
            <div className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 id="customers-title" className="text-sm font-semibold text-fg">Clientes</h2>
                    <p className={`${hintClass} mt-0.5`}>{customers.length === 1 ? '1 cliente inscrito' : `${customers.length} clientes inscritos`}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-fg-subtle"><SearchIcon /></span>
                        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o número" aria-label="Buscar clientes" className={`${inputClass} pl-10 sm:w-64`} />
                    </div>
                    <button type="button" onClick={() => setAdding(v => !v)} disabled={!active} className={buttonClass('primary')}>
                        <PlusIcon />
                        Agregar cliente
                    </button>
                </div>
            </div>

            {!active && (
                <p className={`${hintClass} border-b border-line bg-muted/40 px-5 py-3`}>El sistema está apagado: puedes ver a tus clientes, pero no sumar ni canjear sellos.</p>
            )}

            {adding && active && (
                <form onSubmit={addCustomer} className="border-b border-line bg-muted/40 p-5">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <div>
                            <label htmlFor="new_phone" className={labelClass}>Celular del cliente</label>
                            <input id="new_phone" type="tel" required value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="56912345678" className={`${inputClass} mt-1.5`} />
                        </div>
                        <div>
                            <label htmlFor="new_name" className={labelClass}>Nombre <span className="font-normal text-fg-subtle">(opcional)</span></label>
                            <input id="new_name" maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inputClass} mt-1.5`} />
                        </div>
                        <button type="submit" disabled={savingNew} className={buttonClass('primary')}>{savingNew ? 'Agregando…' : 'Agregar'}</button>
                    </div>
                    <p className={`${hintClass} mt-2`}>Agrega solo a clientes que te dieron su número para el programa.</p>
                    {addError && <p className={`${errorBoxClass} mt-3`}>{addError}</p>}
                </form>
            )}

            {customers.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-fg-subtle">
                    Aún no hay clientes. Se suman solos cuando piden su primer sello con el QR, o agrégalos aquí.
                </p>
            ) : filtered.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-fg-subtle">Ningún cliente coincide con la búsqueda.</p>
            ) : (
                <ul className="divide-y divide-line">
                    {filtered.map(customer => {
                        const complete = customer.stamps >= goal;
                        return (
                            <li key={customer.id} className="px-5 py-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                    <div className="min-w-0 md:w-56 md:flex-shrink-0">
                                        <p className="truncate text-sm font-medium text-fg">{customer.name || 'Sin nombre'}</p>
                                        <p className="text-xs tabular-nums text-fg-muted">{formatPhone(customer.phone)}</p>
                                        <p className="mt-0.5 text-xs text-fg-subtle">
                                            {customer.source === 'panel' ? 'Agregado en el panel' : 'Inscrito con el QR'} {relativeTime(customer.created_at)}
                                        </p>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-3">
                                            <StampDots stamps={customer.stamps} goal={goal} />
                                            <span className="text-xs font-medium tabular-nums text-fg-muted">{customer.stamps}/{goal}</span>
                                        </div>
                                        <p className={`${hintClass} mt-1`}>
                                            {complete ? <span className="font-medium text-success">Tarjeta completa</span> : `${customer.total_stamps} sellos en total`}
                                            {customer.rewards_redeemed > 0 && ` · ${customer.rewards_redeemed} ${customer.rewards_redeemed === 1 ? 'premio canjeado' : 'premios canjeados'}`}
                                        </p>
                                    </div>
                                    <div className="flex flex-shrink-0 items-center gap-2">
                                        {complete && (
                                            <button type="button" onClick={() => act(customer, 'redeem')} disabled={!active || busy === customer.id} className={buttonClass('secondary', 'sm')}>
                                                <GiftIcon />
                                                Canjear
                                            </button>
                                        )}
                                        <button type="button" onClick={() => act(customer, 'unstamp')} disabled={!active || busy === customer.id || customer.stamps === 0} className={buttonClass('ghost', 'sm')} title="Quitar un sello" aria-label="Quitar un sello">
                                            −
                                        </button>
                                        <button type="button" onClick={() => act(customer, 'stamp')} disabled={!active || busy === customer.id} className={buttonClass('secondary', 'sm')} title="Sumar un sello a mano">
                                            <PlusIcon />
                                            Sello
                                        </button>
                                        <button type="button" onClick={() => remove(customer)} disabled={busy === customer.id} className={iconButtonClass} title="Eliminar cliente" aria-label="Eliminar cliente">
                                            <DeleteIcon />
                                        </button>
                                    </div>
                                </div>
                                {notice?.id === customer.id && (
                                    <p className={`${notice.ok ? successBoxClass : warningBoxClass} mt-3`} role="status">{notice.text}</p>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

// --- Page ---

// The loyalty program can be opened any time; turning it on needs WhatsApp connected and configured
const LoyaltyPage: React.FC = () => {
    const { user } = useAuth();
    const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
    const [requests, setRequests] = useState<LoyaltyStampRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const [connectionResult, profileResult, customersResult, requestsResult] = await Promise.allSettled([
            whatsappService.getWhatsAppConnection(),
            supabaseService.getProfile(),
            whatsappService.getLoyaltyCustomers(),
            whatsappService.getStampRequests(),
        ]);
        const failure = [connectionResult, customersResult, requestsResult].find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (failure) {
            if (failure.reason instanceof SchemaMissing) setMissing(failure.reason.message);
            else setError(errorText(failure.reason, 'No se pudo cargar el sistema de lealtad.'));
        }
        if (connectionResult.status === 'fulfilled') setConnection(connectionResult.value);
        if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
        if (customersResult.status === 'fulfilled') setCustomers(customersResult.value);
        if (requestsResult.status === 'fulfilled') setRequests(requestsResult.value);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    // Requests and the customers' stamps change from WhatsApp, outside this page
    const refresh = useCallback(async () => {
        const [requestsResult, customersResult] = await Promise.allSettled([
            whatsappService.getStampRequests(),
            whatsappService.getLoyaltyCustomers(),
        ]);
        if (requestsResult.status === 'fulfilled') setRequests(requestsResult.value);
        if (customersResult.status === 'fulfilled') setCustomers(customersResult.value);
    }, []);

    const active = profile?.loyalty_enabled === true;

    useEffect(() => {
        if (loading || missing || !active) return;
        const timer = setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, REQUESTS_POLL_MS);
        return () => clearInterval(timer);
    }, [loading, missing, active, refresh]);

    return (
        <>
            <PageHeader
                title="Sistema de lealtad"
                description="Una tarjeta de sellos: el cliente pide el sello con el QR de la caja y tú lo validas por WhatsApp."
            />

            {loading ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="h-72 animate-pulse rounded-xl bg-muted" />
                        <div className="h-72 animate-pulse rounded-xl bg-muted" />
                    </div>
                    <div className="h-40 animate-pulse rounded-xl bg-muted" />
                </div>
            ) : missing ? (
                <p className={errorBoxClass}>{missing}</p>
            ) : error ? (
                <p className={errorBoxClass}>{error}</p>
            ) : (
                <div className="space-y-6">
                    {!connection && (
                        <div className={`${warningBoxClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                            <span>Para activar el sistema de lealtad necesitas WhatsApp conectado y configurado.</span>
                            <Link to="/whatsapp" className={`${buttonClass('secondary', 'sm')} self-start sm:self-auto`}>
                                Conectar WhatsApp
                                <ArrowRightIcon />
                            </Link>
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <SettingsCard profile={profile} connection={connection} onSaved={setProfile} />
                        <div className="space-y-6">
                            {user && <CounterQRCard store={user.id} active={active} />}
                            <HowItWorks />
                        </div>
                    </div>
                    <RequestsCard requests={requests} active={active} onDecided={refresh} />
                    <CustomersCard customers={customers} setCustomers={setCustomers} goal={profile?.loyalty_goal ?? DEFAULT_GOAL} active={active} />
                </div>
            )}
        </>
    );
};

export default LoyaltyPage;

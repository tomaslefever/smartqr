import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from './AppShell.tsx';
import Switch from './Switch.tsx';
import { ArrowRightIcon, CheckIcon, CopyIcon, DeleteIcon, GiftIcon, PlusIcon, SearchIcon } from './Icons.tsx';
import { StatusDot, errorText, warningBoxClass } from './whatsappUi.tsx';
import { buttonClass, cardClass, errorBoxClass, hintClass, iconButtonClass, inputClass, labelClass, successBoxClass } from './ui.ts';
import { LoyaltyCustomer, Profile, WhatsAppConnection } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import * as whatsappService from '../services/whatsappService.ts';
import { SchemaMissing, canMessage, formatPhone, loyaltyJoinLink } from '../services/whatsappService.ts';

const DEFAULT_GOAL = 10;

const relativeTime = (iso: string, now = Date.now()) => {
    const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
    const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    return rtf.format(Math.round(hours / 24), 'day');
};

// --- Program settings ---

interface SettingsCardProps {
    profile: Profile | null;
    connection: WhatsAppConnection | null;
    onSaved: (profile: Profile) => void;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ profile, connection, onSaved }) => {
    const [enabled, setEnabled] = useState(profile?.loyalty_enabled === true);
    const [goal, setGoal] = useState(String(profile?.loyalty_goal ?? DEFAULT_GOAL));
    const [reward, setReward] = useState(profile?.loyalty_reward ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [copied, setCopied] = useState(false);

    const goalNumber = Math.floor(Number(goal));
    const changed = enabled !== (profile?.loyalty_enabled === true)
        || goalNumber !== (profile?.loyalty_goal ?? DEFAULT_GOAL)
        || reward.trim() !== (profile?.loyalty_reward ?? '');
    // The switch can always be turned off; turning it on needs a connected WhatsApp
    const canEnable = !!connection;

    const save = async () => {
        if (!Number.isFinite(goalNumber) || goalNumber < 2 || goalNumber > 50) {
            setError('Los sellos para el premio van de 2 a 50.');
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
            });
            onSaved(updated);
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

    const joinLink = profile?.loyalty_enabled && profile.loyalty_whatsapp ? loyaltyJoinLink(profile.loyalty_whatsapp) : null;

    const copy = async () => {
        if (!joinLink) return;
        try {
            await navigator.clipboard.writeText(joinLink);
            setCopied(true);
        } catch {
            // Clipboard can be blocked; the link is on screen
        }
    };

    return (
        <section className={`${cardClass} p-5`} aria-labelledby="loyalty-settings-title">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 id="loyalty-settings-title" className="text-sm font-semibold text-fg"><label htmlFor="loyalty_enabled">Activar el sistema de lealtad</label></h2>
                    <p className={`${hintClass} mt-0.5`}>
                        {canEnable
                            ? `Tus clientes se inscriben escribiendo "sellos" a ${connection?.display_phone_number || 'tu WhatsApp'}.`
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
            <p className={`${hintClass} mt-1.5`}>Cada compra suma un sello; al juntar los sellos el cliente canjea el premio.</p>

            {error && <p className={`${errorBoxClass} mt-4`}>{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-3">
                {saved && !changed && <span className="flex items-center gap-1 text-sm text-success"><CheckIcon /> Guardado</span>}
                <button type="button" onClick={save} disabled={saving || !changed} className={buttonClass('primary', 'sm')}>
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>

            {joinLink && (
                <div className="mt-5 border-t border-line pt-4">
                    <p className={labelClass}>Link de inscripción</p>
                    <p className={`${hintClass} mt-0.5`}>Ya aparece en tu carta. Compártelo en tus redes o imprímelo junto a la caja.</p>
                    <div className="mt-2 flex items-center gap-2">
                        <input readOnly value={joinLink} onFocus={(e) => e.target.select()} className={`${inputClass} text-fg-muted`} aria-label="Link de inscripción" />
                        <button type="button" onClick={copy} className={buttonClass('secondary')} aria-label="Copiar link">
                            {copied ? <span className="text-success"><CheckIcon /></span> : <CopyIcon />}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
};

const HowItWorks: React.FC = () => (
    <section className={`${cardClass} p-5`} aria-labelledby="loyalty-how-title">
        <h2 id="loyalty-how-title" className="text-sm font-semibold text-fg">Cómo funciona</h2>
        <ol className="mt-3 space-y-3 text-sm text-fg-muted">
            <li><span className="font-medium text-fg">1. Se inscriben por WhatsApp.</span> Tu carta muestra el programa con un botón que les abre WhatsApp con "sellos" escrito. Al enviarlo quedan inscritos con su número y reciben cuántos sellos llevan.</li>
            <li><span className="font-medium text-fg">2. Sumas un sello por compra.</span> Búscalos aquí y súmales el sello; les llega un aviso por WhatsApp.</li>
            <li><span className="font-medium text-fg">3. Canjean el premio.</span> Al completar la tarjeta les avisamos; tú marcas el canje y la tarjeta vuelve a empezar.</li>
        </ol>
        <p className={`${hintClass} mt-4`}>
            WhatsApp solo deja responder con mensajes libres hasta 24 horas después del último mensaje del cliente. Pasado ese plazo el sello se suma igual, pero el aviso no se envía.
        </p>
    </section>
);

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
            let text = ACTION_DONE[action];
            let ok = true;
            // Corrections are silent; stamps and rewards are announced by WhatsApp
            if (action !== 'unstamp') {
                try {
                    const result = await whatsappService.notifyLoyaltyCustomer(customer.id, action);
                    if (result.sent) {
                        text += ' Le avisamos por WhatsApp.';
                    } else {
                        ok = false;
                        text += result.reason === 'window'
                            ? ' No se le avisó: no te ha escrito por WhatsApp en las últimas 24 horas.'
                            : ` No se pudo avisar por WhatsApp: ${result.message ?? 'error de Meta'}.`;
                    }
                } catch (err) {
                    ok = false;
                    text += ` No se pudo avisar por WhatsApp: ${errorText(err, 'error del servidor')}`;
                }
            }
            setNotice({ id: customer.id, ok, text });
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
                            <label htmlFor="new_phone" className={labelClass}>WhatsApp del cliente</label>
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
                    Aún no hay clientes. Se suman solos cuando escriben "sellos" a tu WhatsApp, o agrégalos aquí.
                </p>
            ) : filtered.length === 0 ? (
                <p className="px-5 py-10 text-center text-sm text-fg-subtle">Ningún cliente coincide con la búsqueda.</p>
            ) : (
                <ul className="divide-y divide-line">
                    {filtered.map(customer => {
                        const complete = customer.stamps >= goal;
                        const reachable = canMessage(customer);
                        return (
                            <li key={customer.id} className="px-5 py-4">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                    <div className="min-w-0 md:w-56 md:flex-shrink-0">
                                        <p className="truncate text-sm font-medium text-fg">{customer.name || 'Sin nombre'}</p>
                                        <p className="text-xs tabular-nums text-fg-muted">{formatPhone(customer.phone)}</p>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle" title="WhatsApp deja enviar avisos hasta 24 horas después del último mensaje del cliente">
                                            <StatusDot ok={reachable} />
                                            {customer.last_message_at ? `Escribió ${relativeTime(customer.last_message_at)}` : customer.source === 'panel' ? 'Agregado en el panel' : 'Sin mensajes'}
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
                                        <button type="button" onClick={() => act(customer, 'stamp')} disabled={!active || busy === customer.id} className={buttonClass('primary', 'sm')}>
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
    const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
    const [loading, setLoading] = useState(true);
    const [missing, setMissing] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        const [connectionResult, profileResult, customersResult] = await Promise.allSettled([
            whatsappService.getWhatsAppConnection(),
            supabaseService.getProfile(),
            whatsappService.getLoyaltyCustomers(),
        ]);
        const failure = [connectionResult, customersResult].find(r => r.status === 'rejected') as PromiseRejectedResult | undefined;
        if (failure) {
            if (failure.reason instanceof SchemaMissing) setMissing(failure.reason.message);
            else setError(errorText(failure.reason, 'No se pudo cargar el sistema de lealtad.'));
        }
        if (connectionResult.status === 'fulfilled') setConnection(connectionResult.value);
        if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
        if (customersResult.status === 'fulfilled') setCustomers(customersResult.value);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const active = profile?.loyalty_enabled === true;

    return (
        <>
            <PageHeader
                title="Sistema de lealtad"
                description="Una tarjeta de sellos por WhatsApp: cada compra suma un sello y al completarla tu cliente se lleva un premio."
            />

            {loading ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="h-56 animate-pulse rounded-xl bg-muted" />
                        <div className="h-56 animate-pulse rounded-xl bg-muted" />
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
                        <HowItWorks />
                    </div>
                    <CustomersCard customers={customers} setCustomers={setCustomers} goal={profile?.loyalty_goal ?? DEFAULT_GOAL} active={active} />
                </div>
            )}
        </>
    );
};

export default LoyaltyPage;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Profile, Theme } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import * as whatsappService from '../services/whatsappService.ts';
import { LoyaltyCard } from '../services/whatsappService.ts';
import { normalizeThemeStyle, themeStyleVars } from './storeTheme.ts';
import { CheckIcon, CopyIcon, GiftIcon } from './Icons.tsx';
import ShinyText from './reactbits/ShinyText.tsx';

// Public page behind the counter QR (#/sellos/<business>): the customer asks for a stamp, the business
// validates it by WhatsApp and the card fills up here. The personal link (?tarjeta=<card>) opens the card on
// another phone. Uses the business's store theme.

const POLL_MS = 3000;
// The page stops asking after a while; the stamp still counts when the business validates it later
const POLL_LIMIT_MS = 10 * 60 * 1000;

interface Saved {
    card: string;
    phone: string;
    name: string;
    // Request still waiting, so a reload keeps following it
    request?: string;
}

const storageKey = (store: string) => `smartqr:loyalty:${store}`;

const loadSaved = (store: string): Saved | null => {
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey(store)) ?? 'null');
        return raw && typeof raw.card === 'string' ? raw : null;
    } catch {
        return null;
    }
};

const persist = (store: string, saved: Saved | null) => {
    try {
        if (saved) localStorage.setItem(storageKey(store), JSON.stringify(saved));
        else localStorage.removeItem(storageKey(store));
    } catch {
        // Private mode: the card link still works
    }
};

const fieldClass =
    'mt-1 block w-full rounded-lg border border-[color:var(--store-border)] bg-transparent px-3 py-2.5 text-base text-[color:var(--store-text)] ' +
    'placeholder:text-[color:var(--store-muted)] focus:border-[color:var(--store-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--store-accent-soft)]';

const primaryButtonClass =
    'inline-flex w-full items-center justify-center gap-2 rounded-full bg-[color:var(--store-accent)] px-5 py-3 text-base font-semibold text-[color:var(--store-on-accent)] shadow ' +
    'transition-opacity hover:opacity-90 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--store-accent)] focus-visible:ring-offset-2';

const linkButtonClass = 'text-sm font-medium text-[color:var(--store-accent)] underline-offset-4 hover:underline';

const Stamps: React.FC<{ stamps: number; goal: number }> = ({ stamps, goal }) => (
    <div className="grid grid-cols-5 gap-3" role="img" aria-label={`${Math.min(stamps, goal)} de ${goal} sellos`}>
        {Array.from({ length: goal }, (_, i) => {
            const filled = i < stamps;
            return (
                <span
                    key={i}
                    className={`flex aspect-square items-center justify-center rounded-full border-2 ${filled
                        ? 'border-[color:var(--store-accent)] bg-[color:var(--store-accent)] text-[color:var(--store-on-accent)]'
                        : 'border-dashed border-[color:var(--store-border)] text-transparent'}`}
                >
                    <CheckIcon />
                </span>
            );
        })}
    </div>
);

type Waiting = { token: string; since: number; result?: whatsappService.StampRequestStatus['status'] };

const LoyaltyLanding: React.FC = () => {
    const { userId = '' } = useParams<{ userId: string }>();
    const [searchParams] = useSearchParams();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [theme, setTheme] = useState<Theme | null>(null);
    const [loading, setLoading] = useState(true);

    const [saved, setSaved] = useState<Saved | null>(null);
    const [card, setCard] = useState<LoyaltyCard | null>(null);
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [consent, setConsent] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [waiting, setWaiting] = useState<Waiting | null>(null);
    const [copied, setCopied] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Business, theme and the card saved on this phone (or the one in the link)
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const profileData = await supabaseService.getPublicProfileByUserId(userId);
            const themeData = profileData?.theme_id ? await supabaseService.getTheme(profileData.theme_id).catch(() => null) : null;
            if (cancelled) return;
            setProfile(profileData);
            setTheme(themeData);

            const fromLink = searchParams.get('tarjeta');
            const local = loadSaved(userId);
            const initial = fromLink && fromLink !== local?.card ? { card: fromLink, phone: '', name: '' } : local;
            if (initial) {
                const found = await whatsappService.getLoyaltyCard(userId, initial.card).catch(() => null);
                if (cancelled) return;
                if (found) {
                    setSaved(initial);
                    setCard(found);
                    persist(userId, initial);
                    if (initial.request && found.pending) setWaiting({ token: initial.request, since: Date.now() });
                } else if (!fromLink) {
                    persist(userId, null);
                }
            }
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

    const refreshCard = useCallback(async (cardToken: string) => {
        const found = await whatsappService.getLoyaltyCard(userId, cardToken).catch(() => null);
        if (found) setCard(found);
    }, [userId]);

    // Follow the request until the business decides it
    useEffect(() => {
        if (!waiting || waiting.result) return;
        const check = async () => {
            if (Date.now() - waiting.since > POLL_LIMIT_MS) {
                if (pollRef.current) clearInterval(pollRef.current);
                return;
            }
            const status = await whatsappService.getStampRequestStatus(waiting.token).catch(() => null);
            if (!status || status.status === 'pending') return;
            setWaiting(prev => (prev ? { ...prev, result: status.status } : prev));
            setCard(prev => (prev ? { ...prev, stamps: status.stamps, goal: status.goal, pending: false } : prev));
            setSaved(prev => {
                if (!prev) return prev;
                const next = { ...prev, request: undefined };
                persist(userId, next);
                return next;
            });
        };
        pollRef.current = setInterval(check, POLL_MS);
        check();
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [waiting, userId]);

    const ask = async (askPhone: string, askName: string) => {
        setError(null);
        setSending(true);
        try {
            const { token, card_token } = await whatsappService.requestStamp(userId, askPhone, askName);
            const next: Saved = { card: card_token, phone: askPhone, name: askName, request: token };
            persist(userId, next);
            setSaved(next);
            setWaiting({ token, since: Date.now() });
            await refreshCard(card_token);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo enviar la solicitud.');
        } finally {
            setSending(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!phone.trim()) {
            setError('Escribe tu número de celular.');
            return;
        }
        if (!consent) {
            setError('Para sumar sellos tienes que aceptar que el local guarde tu número.');
            return;
        }
        ask(phone.trim(), name.trim());
    };

    const forget = () => {
        persist(userId, null);
        setSaved(null);
        setCard(null);
        setWaiting(null);
        setError(null);
    };

    const cardLink = saved ? `${whatsappService.loyaltyLandingUrl(userId)}?tarjeta=${saved.card}` : '';
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(cardLink);
            setCopied(true);
        } catch {
            // Clipboard blocked: nothing else to do
        }
    };

    const themeStyle = useMemo(() => normalizeThemeStyle(theme), [theme]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <ShinyText text="Cargando..." color="#6B7280" shineColor="#D1D5DB" speed={1.5} />
            </div>
        );
    }

    const business = profile?.business_name?.trim() || 'el local';
    const active = profile?.loyalty_enabled === true && !!profile.loyalty_reward;
    const goal = card?.goal ?? profile?.loyalty_goal ?? 10;
    const stamps = card?.stamps ?? 0;
    const complete = stamps >= goal;
    const isWaiting = !!waiting && !waiting.result && Date.now() - waiting.since <= POLL_LIMIT_MS;
    const stillPending = !!waiting && !waiting.result && !isWaiting;

    return (
        <div className="flex min-h-screen flex-col text-[color:var(--store-text)]" style={themeStyleVars(themeStyle)}>
            <header className="bg-[color:var(--store-card)] shadow-md">
                <div className="mx-auto max-w-md px-4 py-6 text-center">
                    <h1 className="text-2xl font-bold text-[color:var(--store-accent)]">{business}</h1>
                    <p className="mt-1 text-[color:var(--store-muted)]">Tarjeta de sellos</p>
                </div>
            </header>

            <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
                {!active ? (
                    <div className="rounded-xl bg-[color:var(--store-card)] p-6 text-center shadow-sm">
                        <p className="font-semibold">Este local no tiene un programa de sellos activo.</p>
                        <a href={`#/store/${userId}`} className={`${linkButtonClass} mt-4 inline-block`}>Ver la carta</a>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <section className="rounded-xl bg-[color:var(--store-card)] p-5 shadow-sm">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--store-accent-soft)] text-[color:var(--store-accent)]"><GiftIcon /></span>
                                <p className="font-semibold">Junta {goal} sellos y llévate: {profile?.loyalty_reward}</p>
                            </div>
                            {card && (
                                <div className="mt-5">
                                    <Stamps stamps={stamps} goal={goal} />
                                    <p className="mt-4 text-center text-lg font-semibold">
                                        {card.name ? `${card.name.split(/\s+/)[0]}, llevas` : 'Llevas'} {Math.min(stamps, goal)} de {goal} sellos
                                    </p>
                                    {complete && (
                                        <p className="mt-2 rounded-lg bg-[color:var(--store-accent-soft)] px-3 py-2 text-center text-sm font-medium">
                                            ¡Completaste tu tarjeta! Muestra esta pantalla en la caja para canjear tu premio.
                                        </p>
                                    )}
                                </div>
                            )}
                        </section>

                        {isWaiting && (
                            <section className="rounded-xl bg-[color:var(--store-card)] p-5 text-center shadow-sm" aria-live="polite">
                                <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-[color:var(--store-border)] border-t-[color:var(--store-accent)]" aria-hidden="true" />
                                <p className="mt-3 font-semibold">Esperando que {business} valide tu sello…</p>
                                <p className="mt-1 text-sm text-[color:var(--store-muted)]">Le llegó tu solicitud por WhatsApp. No cierres esta página.</p>
                            </section>
                        )}
                        {waiting?.result === 'approved' && (
                            <p className="rounded-xl bg-[color:var(--store-card)] p-4 text-center font-semibold shadow-sm" aria-live="polite">✅ ¡Sello sumado!</p>
                        )}
                        {waiting?.result === 'rejected' && (
                            <p className="rounded-xl bg-[color:var(--store-card)] p-4 text-center shadow-sm" aria-live="polite">El local no validó este sello. Si es un error, pregúntale en la caja.</p>
                        )}
                        {waiting?.result === 'expired' && (
                            <p className="rounded-xl bg-[color:var(--store-card)] p-4 text-center shadow-sm" aria-live="polite">La solicitud venció sin validarse. Pide el sello de nuevo en tu próxima compra.</p>
                        )}
                        {stillPending && (
                            <p className="rounded-xl bg-[color:var(--store-card)] p-4 text-center text-sm shadow-sm">
                                Tu solicitud sigue pendiente. Se sumará cuando el local la valide; vuelve a abrir esta página para ver tu tarjeta.
                            </p>
                        )}

                        {error && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}

                        {saved ? (
                            !isWaiting && (
                                <section className="space-y-4 rounded-xl bg-[color:var(--store-card)] p-5 shadow-sm">
                                    {saved.phone && (
                                        <button type="button" onClick={() => ask(saved.phone, saved.name)} disabled={sending} className={primaryButtonClass}>
                                            {sending ? 'Enviando…' : 'Pedir sello por esta compra'}
                                        </button>
                                    )}
                                    {!saved.phone && <p className="text-center text-sm text-[color:var(--store-muted)]">Para pedir un sello desde este teléfono, ingresa tu número.</p>}
                                    <div>
                                        <p className="text-sm font-medium">Tu link personal</p>
                                        <p className="text-xs text-[color:var(--store-muted)]">Guárdalo para ver tu tarjeta desde cualquier teléfono.</p>
                                        <div className="mt-2 flex gap-2">
                                            <input readOnly value={cardLink} onFocus={e => e.target.select()} className={`${fieldClass} mt-0 text-sm`} aria-label="Link de tu tarjeta" />
                                            <button type="button" onClick={copyLink} className="flex-shrink-0 rounded-lg border border-[color:var(--store-border)] px-3" aria-label="Copiar link">
                                                {copied ? <CheckIcon /> : <CopyIcon />}
                                            </button>
                                        </div>
                                    </div>
                                    <button type="button" onClick={forget} className={linkButtonClass}>
                                        {saved.phone ? '¿No eres tú? Usar otro número' : 'Ingresar mi número'}
                                    </button>
                                </section>
                            )
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-[color:var(--store-card)] p-5 shadow-sm">
                                <div>
                                    <p className="font-semibold">Pide tu sello</p>
                                    <p className="text-sm text-[color:var(--store-muted)]">Al pagar, ingresa tu número: el local valida tu compra y el sello aparece aquí.</p>
                                </div>
                                <label className="block text-sm font-medium">
                                    Tu celular
                                    <input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={e => setPhone(e.target.value)} placeholder="9 1234 5678" className={fieldClass} />
                                </label>
                                <label className="block text-sm font-medium">
                                    Tu nombre <span className="font-normal text-[color:var(--store-muted)]">(opcional)</span>
                                    <input autoComplete="given-name" maxLength={80} value={name} onChange={e => setName(e.target.value)} className={fieldClass} />
                                </label>
                                <label className="flex items-start gap-2 text-sm text-[color:var(--store-muted)]">
                                    <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[color:var(--store-accent)]" />
                                    Acepto que {business} guarde mi número para su programa de sellos.
                                </label>
                                <button type="submit" disabled={sending} className={primaryButtonClass}>{sending ? 'Enviando…' : 'Pedir sello'}</button>
                            </form>
                        )}

                        <p className="text-center">
                            <a href={`#/store/${userId}`} className={linkButtonClass}>Ver la carta de {business}</a>
                        </p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default LoyaltyLanding;

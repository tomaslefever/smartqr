import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageHeader } from './AppShell.tsx';
import { ChatIcon, CheckIcon, CopyIcon } from './Icons.tsx';
import { buttonClass, cardClass, errorBoxClass, successBoxClass } from './ui.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { WhatsAppAgentUnavailable, type WhatsAppLink } from '../services/supabaseService.ts';
import { whatsappLink } from '../services/whatsapp.ts';

// While a code is waiting, the page checks for the new link so it shows up without reloading
const POLL_MS = 4000;

// "+56912345678" → "+56 9 1234 5678"; other countries as they come
const formatPhone = (phone: string) => {
    const chile = /^\+56(9)(\d{4})(\d{4})$/.exec(phone);
    return chile ? `+56 ${chile[1]} ${chile[2]} ${chile[3]}` : phone;
};

const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

const remaining = (expiresAt: string, now: number) => {
    const seconds = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

// Links the business's WhatsApp numbers to its account: a one-time code generated here and sent to the
// agent by WhatsApp. Linked numbers can then change the menu by chatting with the agent.
const WhatsAppAgentPage: React.FC = () => {
    const [links, setLinks] = useState<WhatsAppLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [unavailable, setUnavailable] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
    const [generating, setGenerating] = useState(false);
    const [justLinked, setJustLinked] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [now, setNow] = useState(Date.now());
    const known = useRef<Set<string>>(new Set());

    const load = useCallback(async () => {
        try {
            const data = await supabaseService.getWhatsAppLinks();
            setLinks(data);
            return data;
        } catch (e) {
            if (e instanceof WhatsAppAgentUnavailable) setUnavailable(true);
            else setError(e instanceof Error ? e.message : 'No se pudieron cargar los números.');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load().then(data => { if (data) known.current = new Set(data.map(l => l.phone)); });
    }, [load]);

    const expired = code ? new Date(code.expires_at).getTime() <= now : false;

    // Countdown and, while the code is valid, watching for the number it links
    useEffect(() => {
        if (!code || expired) return;
        const tick = setInterval(() => setNow(Date.now()), 1000);
        const poll = setInterval(async () => {
            const data = await load();
            const added = data?.find(l => !known.current.has(l.phone));
            if (added) {
                known.current = new Set(data!.map(l => l.phone));
                setJustLinked(added.phone);
                setCode(null);
            }
        }, POLL_MS);
        return () => { clearInterval(tick); clearInterval(poll); };
    }, [code, expired, load]);

    const generate = async () => {
        setGenerating(true);
        setError(null);
        setJustLinked(null);
        setCopied(false);
        try {
            setCode(await supabaseService.createWhatsAppLinkCode());
            setNow(Date.now());
        } catch (e) {
            if (e instanceof WhatsAppAgentUnavailable) setUnavailable(true);
            else setError(e instanceof Error ? e.message : 'No se pudo generar el código.');
        } finally {
            setGenerating(false);
        }
    };

    const copy = async () => {
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code.code);
            setCopied(true);
        } catch {
            // Clipboard can be blocked; the code is on screen to copy by hand
        }
    };

    const remove = async (phone: string) => {
        if (!window.confirm(`¿Desvincular ${formatPhone(phone)}? Ese número ya no podrá cambiar tu carta por WhatsApp.`)) return;
        setError(null);
        try {
            await supabaseService.removeWhatsAppLink(phone);
            known.current.delete(phone);
            if (justLinked === phone) setJustLinked(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo desvincular el número.');
        }
    };

    const sendLink = code ? whatsappLink(`Hola, mi código de SmartQR es ${code.code}`) : null;

    return (
        <>
            <PageHeader
                title="Agente de WhatsApp"
                description="Cambia precios, oculta productos o agrega nuevos escribiéndole al agente por WhatsApp, sin entrar al panel."
            />

            {unavailable ? (
                <p className={errorBoxClass}>El agente de WhatsApp todavía no está habilitado en SmartQR. Vuelve a intentarlo más tarde.</p>
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <section className={`${cardClass} p-5`}>
                        <h2 className="text-sm font-semibold text-fg">Vincular un número</h2>
                        <ol className="mt-3 space-y-1.5 text-sm text-fg-muted">
                            <li>1. Genera un código aquí.</li>
                            <li>2. Envíaselo al agente por WhatsApp, desde el número que vas a usar.</li>
                            <li>3. Listo: ese número queda vinculado a tu carta.</li>
                        </ol>

                        {error && <p className={`${errorBoxClass} mt-4`}>{error}</p>}
                        {justLinked && (
                            <p className={`${successBoxClass} mt-4 flex items-center gap-2`}>
                                <CheckIcon />
                                {formatPhone(justLinked)} quedó vinculado. Ya puedes escribirle al agente.
                            </p>
                        )}

                        {code && !expired ? (
                            <div className="mt-5 rounded-xl border border-line bg-muted/40 p-4 text-center">
                                <p className="text-xs font-medium text-fg-subtle">Tu código</p>
                                <div className="mt-1 flex items-center justify-center gap-2">
                                    <span className="text-3xl font-semibold tracking-[0.18em] tabular-nums text-fg" aria-live="polite">{code.code}</span>
                                    <button type="button" onClick={copy} className={buttonClass('ghost', 'sm')} title={copied ? 'Copiado' : 'Copiar código'} aria-label="Copiar código">
                                        {copied ? <span className="text-success"><CheckIcon /></span> : <CopyIcon />}
                                    </button>
                                </div>
                                <p className="mt-1 text-xs tabular-nums text-fg-subtle">Vence en {remaining(code.expires_at, now)} · sirve una sola vez</p>
                                <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                                    {sendLink && (
                                        <a href={sendLink} target="_blank" rel="noopener noreferrer" className={buttonClass('primary')}>
                                            <ChatIcon />
                                            Enviar por WhatsApp
                                        </a>
                                    )}
                                    <button type="button" onClick={generate} disabled={generating} className={buttonClass('secondary')}>
                                        Generar otro
                                    </button>
                                </div>
                                <p className="mt-3 flex items-center justify-center gap-2 text-xs text-fg-subtle">
                                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-primary" aria-hidden="true" />
                                    Esperando el mensaje…
                                </p>
                            </div>
                        ) : (
                            <div className="mt-5">
                                {code && expired && <p className="mb-3 text-sm text-fg-muted">El código venció. Genera otro para vincular tu número.</p>}
                                <button type="button" onClick={generate} disabled={generating} className={buttonClass('primary')}>
                                    {generating ? 'Generando…' : code ? 'Generar otro código' : 'Generar código'}
                                </button>
                            </div>
                        )}
                    </section>

                    <section className={`${cardClass} p-5`}>
                        <h2 className="text-sm font-semibold text-fg">Números vinculados</h2>
                        <p className="mt-1 text-sm text-fg-muted">Pueden cambiar tu carta por WhatsApp.</p>
                        {loading ? (
                            <div className="mt-4 space-y-2">{Array.from({ length: 2 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
                        ) : links.length === 0 ? (
                            <p className="mt-4 rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-subtle">Aún no hay números vinculados.</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-line">
                                {links.map(link => (
                                    <li key={link.phone} className="flex items-center gap-3 py-3">
                                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><ChatIcon /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-medium tabular-nums text-fg">{formatPhone(link.phone)}</span>
                                            <span className="block text-xs text-fg-subtle">Vinculado el {formatDate(link.created_at)}</span>
                                        </span>
                                        <button type="button" onClick={() => remove(link.phone)} className={buttonClass('danger', 'sm')}>Desvincular</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </>
    );
};

export default WhatsAppAgentPage;

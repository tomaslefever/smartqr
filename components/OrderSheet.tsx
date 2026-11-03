import React, { useEffect, useRef, useState } from 'react';
import { Product } from '../types.ts';
import { CloseIcon } from './Icons.tsx';
import {
    OrderDetails,
    OrderLine,
    formatPrice,
    formatQuantity,
    lineTotal,
    orderTotal,
} from './storeOrder.ts';

interface OrderSheetProps {
    lines: OrderLine[];
    details: OrderDetails;
    onDetailsChange: (changes: Partial<OrderDetails>) => void;
    // Whether the business delivers; otherwise orders without a table are for pickup
    delivery: boolean;
    onChangeQuantity: (product: Product, delta: number) => void;
    onClear: () => void;
    // Opens WhatsApp with the order
    onSend: () => void;
    onClose: () => void;
}

const fieldClass =
    'mt-1 block w-full rounded-lg border border-[color:var(--store-border)] bg-transparent px-3 py-2 text-sm text-[color:var(--store-text)] ' +
    'placeholder:text-[color:var(--store-muted)] focus:border-[color:var(--store-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--store-accent-soft)]';

const stepButtonClass =
    'flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--store-subtle)] text-lg font-semibold leading-none text-[color:var(--store-text)] ' +
    'transition-colors hover:bg-[color:var(--store-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--store-accent)]';

// The customer's order in the public store, as a bottom sheet on phones and a dialog on wider screens.
// Rendered inside the store so it uses the business's theme.
const OrderSheet: React.FC<OrderSheetProps> = ({ lines, details, onDetailsChange, delivery, onChangeQuantity, onClear, onSend, onClose }) => {
    const [sent, setSent] = useState(false);
    const [addressMissing, setAddressMissing] = useState(false);
    const addressRef = useRef<HTMLInputElement>(null);
    const total = orderTotal(lines);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKeyDown);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = overflow;
        };
    }, [onClose]);

    // Removing the last product closes the sheet
    useEffect(() => {
        if (lines.length === 0 && !sent) onClose();
    }, [lines.length, sent, onClose]);

    const fulfillment = delivery ? details.fulfillment : 'pickup';

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!details.table && fulfillment === 'delivery' && !details.address.trim()) {
            setAddressMissing(true);
            addressRef.current?.focus();
            return;
        }
        setAddressMissing(false);
        onSend();
        setSent(true);
    };

    const choiceClass = (active: boolean) =>
        `flex-1 rounded-full px-3 py-2 text-sm font-medium transition-colors ${active
            ? 'bg-[color:var(--store-accent)] text-[color:var(--store-on-accent)] shadow'
            : 'bg-[color:var(--store-subtle)] text-[color:var(--store-text)] hover:bg-[color:var(--store-border)]'}`;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="order-title">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-[color:var(--store-card)] text-[color:var(--store-text)] shadow-2xl sm:rounded-2xl">
                <div className="flex items-center justify-between gap-4 border-b border-[color:var(--store-border)] px-5 py-4">
                    <div className="flex items-center gap-3">
                        <h2 id="order-title" className="text-lg font-bold">Tu pedido</h2>
                        {details.table && (
                            <span className="rounded-full bg-[color:var(--store-accent-soft)] px-3 py-0.5 text-sm font-semibold">Mesa {details.table}</span>
                        )}
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full p-2 text-[color:var(--store-muted)] transition-colors hover:bg-[color:var(--store-subtle)] hover:text-[color:var(--store-text)]" aria-label="Cerrar pedido">
                        <CloseIcon />
                    </button>
                </div>

                {sent ? (
                    <div className="space-y-4 px-5 py-6 text-center">
                        <p className="text-lg font-bold">Abrimos WhatsApp con tu pedido</p>
                        <p className="text-sm text-[color:var(--store-muted)]">
                            Envía el mensaje para que el negocio lo reciba. Ahí mismo te confirmarán el pedido y cómo pagar.
                        </p>
                        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
                            <button type="button" onClick={() => setSent(false)} className="rounded-full px-5 py-2.5 text-sm font-semibold text-[color:var(--store-text)] hover:bg-[color:var(--store-subtle)]">
                                Volver al pedido
                            </button>
                            <button type="button" onClick={() => { onClear(); onClose(); }} className="rounded-full bg-[color:var(--store-accent)] px-5 py-2.5 text-sm font-semibold text-[color:var(--store-on-accent)] shadow">
                                Ya lo envié, vaciar pedido
                            </button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSend} className="flex min-h-0 flex-1 flex-col">
                        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
                            <ul className="divide-y divide-[color:var(--store-border)]">
                                {lines.map(({ product, quantity }) => (
                                    <li key={product.id} className="flex items-center gap-3 py-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold leading-snug line-clamp-2">{product.name}</p>
                                            {product.price > 0 && (
                                                <p className="text-sm text-[color:var(--store-muted)]">
                                                    {formatPrice(lineTotal(product, quantity))}
                                                    {quantity !== 1 && <span> · {formatPrice(product.price)}{product.unit === 'kg' ? '/kg' : ' c/u'}</span>}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-shrink-0 items-center gap-2">
                                            <button type="button" onClick={() => onChangeQuantity(product, -1)} className={stepButtonClass} aria-label={`Quitar ${product.name}`}>−</button>
                                            <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums" aria-live="polite">{formatQuantity(product, quantity)}</span>
                                            <button type="button" onClick={() => onChangeQuantity(product, 1)} className={stepButtonClass} aria-label={`Agregar ${product.name}`}>+</button>
                                        </div>
                                    </li>
                                ))}
                            </ul>

                            {total > 0 && (
                                <div className="flex items-baseline justify-between border-t-2 border-[color:var(--store-accent-soft)] pt-3">
                                    <span className="font-semibold">Total</span>
                                    <span className="text-2xl font-bold text-[color:var(--store-accent)]">{formatPrice(total)}</span>
                                </div>
                            )}

                            {!details.table && delivery && (
                                <div className="flex gap-2" role="radiogroup" aria-label="Entrega">
                                    <button type="button" role="radio" aria-checked={fulfillment === 'pickup'} onClick={() => onDetailsChange({ fulfillment: 'pickup' })} className={choiceClass(fulfillment === 'pickup')}>Retiro en el local</button>
                                    <button type="button" role="radio" aria-checked={fulfillment === 'delivery'} onClick={() => onDetailsChange({ fulfillment: 'delivery' })} className={choiceClass(fulfillment === 'delivery')}>Despacho</button>
                                </div>
                            )}
                            {!details.table && !delivery && (
                                <p className="text-sm text-[color:var(--store-muted)]">El pedido es para retiro en el local.</p>
                            )}
                            {!details.table && fulfillment === 'delivery' && (
                                <div>
                                    <label htmlFor="order-address" className="text-sm font-medium">Dirección de despacho</label>
                                    <input
                                        ref={addressRef}
                                        id="order-address"
                                        type="text"
                                        autoComplete="street-address"
                                        value={details.address}
                                        maxLength={200}
                                        aria-invalid={addressMissing}
                                        aria-describedby={addressMissing ? 'order-address-error' : undefined}
                                        onChange={e => { onDetailsChange({ address: e.target.value }); setAddressMissing(false); }}
                                        className={fieldClass}
                                    />
                                    {addressMissing && <p id="order-address-error" role="alert" className="mt-1 text-sm font-medium">Escribe la dirección para el despacho.</p>}
                                </div>
                            )}

                            <div>
                                <label htmlFor="order-name" className="text-sm font-medium">Tu nombre <span className="font-normal text-[color:var(--store-muted)]">(opcional)</span></label>
                                <input id="order-name" type="text" autoComplete="name" value={details.name} maxLength={80} onChange={e => onDetailsChange({ name: e.target.value })} className={fieldClass} />
                            </div>
                            <div>
                                <label htmlFor="order-note" className="text-sm font-medium">Nota <span className="font-normal text-[color:var(--store-muted)]">(opcional)</span></label>
                                <textarea id="order-note" rows={2} value={details.note} maxLength={300} placeholder="Ej: sin cebolla" onChange={e => onDetailsChange({ note: e.target.value })} className={fieldClass} />
                            </div>

                        </div>

                        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--store-border)] px-5 py-4">
                            <button
                                type="button"
                                onClick={() => { if (window.confirm('¿Vaciar el pedido?')) onClear(); }}
                                className="rounded-full px-3 py-2 text-sm font-medium text-[color:var(--store-muted)] hover:bg-[color:var(--store-subtle)] hover:text-[color:var(--store-text)]"
                            >
                                Vaciar
                            </button>
                            <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-[color:var(--store-accent)] px-5 py-3 text-sm font-semibold text-[color:var(--store-on-accent)] shadow transition-transform hover:-translate-y-0.5">
                                <WhatsAppIcon />
                                Enviar pedido por WhatsApp
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export const WhatsAppIcon = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="currentColor">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.55-3.7 8.24-8.24 8.24Zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.29Z" />
    </svg>
);

export default OrderSheet;

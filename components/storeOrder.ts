import { Product, Profile } from '../types.ts';

// WhatsApp orders from the public store: the customer builds the order in the store and WhatsApp opens
// with the message ready for the business's number. Nothing is stored on the server.

// Product id -> quantity (units, or kg for products sold by weight)
export type OrderItems = Record<number, number>;

export type Fulfillment = 'pickup' | 'delivery';

export interface OrderDetails {
    name: string;
    note: string;
    // Table from the QR (?mesa=5); when set, pickup and delivery do not apply
    table: string | null;
    fulfillment: Fulfillment;
    address: string;
}

// Products sold by weight go up and down a quarter of a kilo at a time
export const quantityStep = (product: Product) => (product.unit === 'kg' ? 0.25 : 1);

// Avoids 0.1 + 0.2 style leftovers when adding quarters
const roundQuantity = (quantity: number) => Math.round(quantity * 100) / 100;

export const changeQuantity = (items: OrderItems, product: Product, delta: number): OrderItems => {
    const next = roundQuantity((items[product.id] ?? 0) + delta * quantityStep(product));
    const rest = { ...items };
    delete rest[product.id];
    return next > 0 ? { ...rest, [product.id]: next } : rest;
};

export const formatQuantity = (product: Product, quantity: number) =>
    product.unit === 'kg'
        ? `${quantity.toLocaleString('es-CL', { maximumFractionDigits: 2 })} kg`
        : String(quantity);

export const formatPrice = (amount: number) => `$${amount.toLocaleString('es-CL')}`;

export const lineTotal = (product: Product, quantity: number) => Math.round(product.price * quantity);

export interface OrderLine {
    product: Product;
    quantity: number;
}

// Order lines in menu order, only for products still in the store and available
export const orderLines = (items: OrderItems, products: Product[]): OrderLine[] =>
    products
        .filter(p => items[p.id] > 0 && !p.out_of_stock)
        .map(p => ({ product: p, quantity: items[p.id] }));

export const orderTotal = (lines: OrderLine[]) =>
    lines.reduce((sum, { product, quantity }) => sum + (product.price > 0 ? lineTotal(product, quantity) : 0), 0);

// Number of products for the cart bar: units count one by one, a product by weight counts once
export const orderCount = (lines: OrderLine[]) =>
    lines.reduce((sum, { product, quantity }) => sum + (product.unit === 'kg' ? 1 : quantity), 0);

export const buildOrderMessage = (businessName: string, lines: OrderLine[], details: OrderDetails) => {
    const greeting = businessName.trim() ? `¡Hola, ${businessName.trim()}!` : '¡Hola!';
    const items = lines.map(({ product, quantity }) => {
        const price = product.price > 0 ? ` — ${formatPrice(lineTotal(product, quantity))}` : '';
        return `• ${formatQuantity(product, quantity)} × ${product.name}${price}`;
    });

    const total = orderTotal(lines);
    const withoutPrice = lines.some(({ product }) => product.price <= 0);
    const summary = total > 0 ? [`Total: ${formatPrice(total)}${withoutPrice ? ' (sin contar los productos sin precio)' : ''}`] : [];

    const where = details.table
        ? `Mesa: ${details.table}`
        : details.fulfillment === 'delivery'
            ? `Despacho a: ${details.address.trim()}`
            : 'Retiro en el local';

    return [
        `${greeting} Quiero hacer este pedido:`,
        '',
        ...items,
        '',
        ...summary,
        where,
        ...(details.name.trim() ? [`Nombre: ${details.name.trim()}`] : []),
        ...(details.note.trim() ? [`Nota: ${details.note.trim()}`] : []),
    ].join('\n');
};

// wa.me wants the number with country code and digits only. Chilean numbers written without the
// country code (9 1234 5678) get it added.
export const normalizeWhatsAppNumber = (input: string) => {
    const digits = input.replace(/\D/g, '');
    if (/^9\d{8}$/.test(digits)) return `56${digits}`;
    return digits;
};

export const isValidWhatsAppNumber = (digits: string) => /^\d{8,15}$/.test(digits);

export const orderLink = (number: string, message: string) =>
    `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

// The store takes orders only when the business turned them on and left a valid number
export const ordersNumber = (profile: Profile | null): string | null => {
    const number = profile?.orders_whatsapp ?? '';
    return profile?.orders_enabled === true && isValidWhatsAppNumber(number) ? number : null;
};

// The table comes from the URL, so only short, plain values are accepted
export const parseTable = (value: string | null): string | null => {
    const table = (value ?? '').trim();
    return table && table.length <= 20 && /^[\p{L}\p{N} -]+$/u.test(table) ? table : null;
};

// The order survives reloads in this browser, one per store
const storageKey = (storeId: string) => `smartqr:order:${storeId}`;

export const loadOrder = (storeId: string): OrderItems => {
    try {
        const raw = JSON.parse(localStorage.getItem(storageKey(storeId)) ?? '{}');
        if (!raw || typeof raw !== 'object') return {};
        return Object.fromEntries(
            Object.entries(raw).filter(([id, quantity]) => /^\d+$/.test(id) && typeof quantity === 'number' && quantity > 0),
        ) as OrderItems;
    } catch {
        return {};
    }
};

export const saveOrder = (storeId: string, items: OrderItems) => {
    try {
        if (Object.keys(items).length === 0) localStorage.removeItem(storageKey(storeId));
        else localStorage.setItem(storageKey(storeId), JSON.stringify(items));
    } catch {
        // Private mode or blocked storage: the order just does not survive a reload
    }
};

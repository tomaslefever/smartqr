import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Product, ThemeStyle } from '../types.ts';
import { whatsappLink } from '../services/whatsapp.ts';
import { Logo } from './AppShell.tsx';
import ColorModeToggle from './ColorModeToggle.tsx';
import QRCodeComponent from './QRCode.tsx';
import { ProductCard } from './Store.tsx';
import Switch from './Switch.tsx';
import { DEFAULT_THEME_STYLE, themeStyleVars } from './storeTheme.ts';
import {
    ArrowRightIcon, CardIcon, ChatIcon, CheckIcon, ColorSwatchIcon, DeleteIcon, DownloadIcon, EditIcon, ExternalLinkIcon,
    GripIcon, HomeIcon, MicIcon, PhotoIcon, PlusIcon, PrinterIcon, QrCodeIcon, QrMarkIcon, SearchIcon, TagIcon, UploadIcon, ViewGridIcon,
} from './Icons.tsx';
import { buttonClass, cardClass } from './ui.ts';
import { Reveal, usePanelColors } from './effects.tsx';
import AnimatedContent from './reactbits/AnimatedContent.tsx';
import Aurora from './reactbits/Aurora.tsx';

const WHATSAPP_MESSAGE = 'Hola, quiero crear la tienda de mi negocio con SmartQR';

/* ---------- Example businesses (labeled as examples wherever they appear) ---------- */

// Theme colors copied from the predefined themes in supabase/themes.sql
const theme = (background_color: string, text_color: string, accent_color: string, card_color = '#FFFFFF'): ThemeStyle => ({
    ...DEFAULT_THEME_STYLE, background_color, card_color, text_color, accent_color,
});

const THEMES = {
    crema: theme('#FAF6EF', '#4B3B2F', '#8B5E3C'),
    minimalista: theme('#F4F4F5', '#18181B', '#18181B'),
    kraft: theme('#E9DCC7', '#3B2F22', '#7E5225', '#F8F1E5'),
};

const THEME_SWATCHES = [
    { name: 'Clásico', bg: '#F9F9F0', accent: '#4A7C59' },
    { name: 'Crema', bg: '#FAF6EF', accent: '#8B5E3C' },
    { name: 'Minimalista', bg: '#F4F4F5', accent: '#18181B' },
    { name: 'Terracota', bg: '#F7EDE6', accent: '#B4512A' },
    { name: 'Papel kraft', bg: '#E9DCC7', accent: '#7E5225' },
    { name: 'Cielo', bg: '#EEF5FF', accent: '#2563EB' },
    { name: 'Lavanda', bg: '#F4F1FA', accent: '#6D4FB3' },
    { name: 'Menta', bg: '#EAF7F1', accent: '#1A7A50' },
];

const product = (id: number, name: string, description: string, price: number, category: string, extra: Partial<Product> = {}): Product => ({
    id, name, description, price, category,
    image_url: '', stock: 0, track_stock: false, out_of_stock: false, active: true, created_at: '', unit: 'unit',
    ...extra,
});

const CAFE = {
    name: 'Café Brisa',
    theme: THEMES.crema,
    categories: ['Todos', 'Cafés', 'Pastelería', 'Jugos'],
    products: [
        product(1, 'Cappuccino', 'Espresso doble con leche vaporizada', 2800, 'Cafés'),
        product(2, 'Latte de avena', '', 3200, 'Cafés'),
        product(3, 'Croissant', 'De almendras, recién horneado', 1900, 'Pastelería', { out_of_stock: true }),
        product(4, 'Kuchen', 'De nuez', 2500, 'Pastelería', { active: false }),
        product(5, 'Jugo natural de naranja', '', 2600, 'Jugos'),
    ],
};

const formatPrice = (price: number) => `$${price.toLocaleString('es-CL')}`;

/* ---------- Helpers ---------- */

// Section anchors scroll in place: with the hash router, a #fragment link would change the route
const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const sectionClass = 'mx-auto max-w-6xl px-4 sm:px-6';
const sectionTitleClass = 'text-2xl font-semibold tracking-tight text-fg sm:text-3xl';

// Draws a fixed-size composition and scales it down to fit narrower containers
const FitScale: React.FC<{ width: number; height: number; className?: string; children: React.ReactNode }> = ({ width, height, className = '', children }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / width)));
        observer.observe(element);
        return () => observer.disconnect();
    }, [width]);
    return (
        <div ref={ref} className={`w-full ${className}`} style={{ maxWidth: width, height: height * scale }}>
            <div className="relative origin-top-left" style={{ width, height, transform: `scale(${scale})` }}>{children}</div>
        </div>
    );
};

/* ---------- Calls to action ---------- */

const PrimaryCTA: React.FC<{ className?: string }> = ({ className = '' }) => (
    <Link to="/register" className={`${buttonClass('primary')} h-12 px-6 text-base ${className}`}>
        Crear mi tienda
        <ArrowRightIcon />
    </Link>
);

// The WhatsApp assistant; nothing when its number is not configured
const WhatsAppCTA: React.FC<{ className?: string; label?: string }> = ({ className = '', label = 'Armarla por WhatsApp' }) => {
    const href = whatsappLink(WHATSAPP_MESSAGE);
    return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={`${buttonClass('secondary')} h-12 px-6 text-base ${className}`}>
            <ChatIcon />
            {label}
        </a>
    ) : null;
};

/* ---------- Mockups ---------- */

const PhoneFrame: React.FC<{ children: React.ReactNode; className?: string; label: string }> = ({ children, className = '', label }) => (
    <div role="img" aria-label={label} className={`rounded-[2.25rem] border border-line bg-surface p-2 shadow-pop ${className}`}>
        {/* inert: the example cards inside are real store components, but here they are only a picture */}
        <div inert className="h-full overflow-hidden rounded-[1.75rem]">{children}</div>
    </div>
);

// The public store as customers see it, built with the store's own product cards
const StoreScreen: React.FC<{ name: string; theme: ThemeStyle; categories: string[]; products: Product[] }> = ({ name, theme, categories, products }) => (
    <div className="h-full overflow-hidden text-[color:var(--store-text)]" style={{ ...themeStyleVars(theme), background: theme.background_color }}>
        <div className="bg-[color:var(--store-card)] px-4 pb-4 pt-5 text-center shadow-md">
            <p className="text-xl font-bold text-[color:var(--store-accent)]">{name}</p>
            <p className="mt-1 text-xs text-[color:var(--store-muted)]">Productos de calidad, a tu alcance.</p>
        </div>
        <div className="space-y-3 px-3 py-3">
            <div className="flex items-center gap-2 rounded-full border border-[color:var(--store-border)] bg-[color:var(--store-card)] px-3 py-1.5 text-xs text-[color:var(--store-muted)] [&_svg]:h-4 [&_svg]:w-4">
                <SearchIcon />
                Buscar productos...
            </div>
            <div className="flex gap-1.5 overflow-hidden">
                {categories.map((category, i) => (
                    <span key={category} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${i === 0 ? 'bg-[color:var(--store-accent)] text-[color:var(--store-on-accent)]' : 'bg-[color:var(--store-subtle)]'}`}>
                        {category}
                    </span>
                ))}
            </div>
            <div className="space-y-2.5">
                {products.filter(p => p.active).map(p => <ProductCard key={p.id} product={p} onClick={() => {}} />)}
            </div>
        </div>
    </div>
);

const PANEL_NAV = [
    { icon: <HomeIcon />, label: 'Inicio' },
    { icon: <ViewGridIcon />, label: 'Productos', active: true },
    { icon: <TagIcon />, label: 'Categorías' },
    { icon: <ColorSwatchIcon />, label: 'Estilo de la carta' },
    { icon: <QrCodeIcon />, label: 'Código QR' },
    { icon: <ExternalLinkIcon />, label: 'Ver tienda' },
];

const PanelBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">{children}</span>
);

// The panel's product list, drawn with the panel's own tokens and controls
const PanelWindow: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div role="img" aria-label={`Ejemplo del panel de SmartQR con los productos de ${CAFE.name}`} className={`overflow-hidden rounded-xl border border-line bg-canvas shadow-pop ${className}`}>
        <div inert className="flex h-full flex-col">
            <div className="flex h-9 flex-shrink-0 items-center gap-1.5 border-b border-line bg-surface px-3">
                {['#FF5F57', '#FEBC2E', '#28C840'].map(color => <span key={color} className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />)}
                <span className="mx-auto rounded-md bg-muted px-16 py-0.5 text-[11px] text-fg-subtle">smartqr.cl</span>
            </div>
            <div className="flex min-h-0 flex-1">
                <div className="w-[9.5rem] flex-shrink-0 border-r border-line bg-surface px-2.5 py-4">
                    <div className="mb-5 flex items-center gap-2 px-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-fg [&_svg]:h-3.5 [&_svg]:w-3.5"><QrMarkIcon /></span>
                        <span className="text-[13px] font-semibold text-fg">SmartQR</span>
                    </div>
                    <div className="space-y-0.5">
                        {PANEL_NAV.map(item => (
                            <div key={item.label} className={`flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium [&_svg]:h-4 [&_svg]:w-4 ${item.active ? 'bg-muted text-fg' : 'text-fg-muted'}`}>
                                {item.icon}
                                {item.label}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="min-w-0 flex-1 px-5 py-4">
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-base font-semibold tracking-tight text-fg">Productos</p>
                            <p className="text-[11px] text-fg-muted">Edita, ordena y activa lo que muestra tu carta.</p>
                        </div>
                        <span className={`${buttonClass('primary', 'sm')} h-7 px-2.5 text-xs [&_svg]:h-4 [&_svg]:w-4`}><PlusIcon />Añadir producto</span>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5">
                        <SearchIcon />Buscar productos
                    </div>
                    <div className={`${cardClass} mt-3 overflow-hidden`}>
                        {CAFE.products.map(p => (
                            <div key={p.id} className="flex items-center gap-2 border-b border-line px-2 py-2 last:border-0">
                                <span className="text-fg-subtle [&_svg]:h-3.5 [&_svg]:w-3.5"><GripIcon /></span>
                                <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${p.active ? '' : 'opacity-50'}`}>
                                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-control bg-muted/40 text-fg-subtle [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-current"><UploadIcon /></span>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-xs font-medium text-fg">{p.name}</span>
                                            {!p.active && <PanelBadge>Desactivado</PanelBadge>}
                                            {p.out_of_stock && <PanelBadge>No disponible</PanelBadge>}
                                        </div>
                                        <p className="text-[11px] text-fg-subtle">{p.category}</p>
                                    </div>
                                </div>
                                <span className="w-14 text-right text-xs tabular-nums text-fg">{formatPrice(p.price)}</span>
                                <span className="px-2"><Switch checked={p.active} onChange={() => {}} label={`Activo: ${p.name}`} /></span>
                                <span className="flex gap-0.5 text-fg-subtle [&_svg]:h-4 [&_svg]:w-4"><span className="p-1"><EditIcon /></span><span className="p-1"><DeleteIcon /></span></span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </div>
);

// A printed QR card, as a business would leave it on a table or counter. Opens this page when scanned.
const QRCard: React.FC<{ name: string; accent: string; caption: string; size?: number; className?: string; style?: React.CSSProperties }> = ({ name, accent, caption, size = 92, className = '', style }) => (
    <div className={`rounded-xl border border-black/5 bg-white p-3 text-center text-[#3D3D3D] shadow-pop ${className}`} style={style} aria-hidden="true">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>{name}</p>
        <div className="mx-auto mt-2 w-fit"><QRCodeComponent url={`${window.location.origin}/`} size={size} /></div>
        <p className="mt-2 text-[10px] leading-tight">{caption}</p>
    </div>
);

// Hero: the panel where the business edits, the store customers see, and the printed QR between them
const HeroComposition: React.FC = () => (
    <FitScale width={780} height={500} className="mx-auto">
        <PanelWindow className="absolute left-0 top-0 h-[372px] w-[620px]" />
        <PhoneFrame label={`Ejemplo de la tienda de ${CAFE.name} en el celular de un cliente`} className="absolute right-0 top-[110px] h-[390px] w-[214px]">
            <StoreScreen {...CAFE} />
        </PhoneFrame>
        <QRCard name={CAFE.name} accent={CAFE.theme.accent_color} caption="Escanea y mira nuestra carta" className="absolute bottom-0 left-6 w-36 -rotate-3" />
    </FitScale>
);

/* ---------- Scenes: the QR where each kind of business would put it ---------- */

const CoffeeCup = () => (
    <svg viewBox="0 0 90 80" className="h-full w-full" aria-hidden="true">
        <path d="M30 14c-4-5 4-8 0-13M42 14c-4-5 4-8 0-13M54 14c-4-5 4-8 0-13" fill="none" stroke="#B9A48E" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx="44" cy="72" rx="40" ry="7" fill="#F4EEE6" stroke="#D9CBBB" strokeWidth="1.5" />
        <path d="M66 32a11 11 0 0 1 0 22" fill="none" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M16 24h52v22a26 26 0 0 1-26 26 26 26 0 0 1-26-26z" fill="#FFFFFF" />
        <ellipse cx="42" cy="24" rx="26" ry="5" fill="#7A5236" />
    </svg>
);

const Shirt: React.FC<{ color: string }> = ({ color }) => (
    <svg viewBox="0 0 120 150" className="h-full w-full" aria-hidden="true">
        <path d="M60 2v10M28 26 60 12l32 14" fill="none" stroke="#8C8F96" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M42 22 20 30 4 58l18 10 6-10v88h64V58l6 10 18-10-16-28-22-8c-4 8-10 12-18 12s-14-4-18-12z" fill={color} />
        <path d="M42 22c4 8 10 12 18 12s14-4 18-12" fill="none" stroke="rgb(0 0 0 / 0.15)" strokeWidth="2" />
    </svg>
);

const Vase = () => (
    <svg viewBox="0 0 90 130" className="h-full w-full" aria-hidden="true">
        <path d="M33 4h24v10q-4 4-4 12 25 18 25 50 0 34-33 50-33-16-33-50 0-32 25-50 0-8-4-12z" fill="#B4512A" />
        <path d="M16 62h58M13 80h64M18 98h54" stroke="#F7EDE6" strokeWidth="3" strokeDasharray="6 6" opacity="0.7" />
    </svg>
);

const Bowl = () => (
    <svg viewBox="0 0 90 40" className="h-full w-full" aria-hidden="true">
        <path d="M2 4h86q-6 34-43 34T2 4z" fill="#D9A46C" />
        <path d="M14 14h62" stroke="#7E5225" strokeWidth="2.5" strokeDasharray="4 5" />
    </svg>
);

const SCENES = [
    {
        kind: 'Cafetería',
        title: 'En cada mesa',
        text: 'Un QR en la mesa y tus clientes ven la carta con precios, sin esperar al mesero.',
        business: CAFE.name,
        themeName: 'Crema',
        accent: THEMES.crema.accent_color,
        scene: (
            <>
                <div className="absolute inset-0 bg-gradient-to-b from-[#EFE4D6] to-[#E6D6C3]" />
                <div className="absolute left-6 top-6 h-16 w-24 rounded-md border-4 border-[#D8C6B0] bg-[#F7F1E8]" />
                <div className="absolute inset-x-0 bottom-0 h-24 bg-[#B98A5E]"><div className="h-2 bg-[#A87B51]" /></div>
                <div className="absolute bottom-14 left-14 h-[72px] w-[82px]"><CoffeeCup /></div>
                <QRCard name={CAFE.name} accent={THEMES.crema.accent_color} caption="Escanea y mira la carta" size={78} className="absolute bottom-12 right-14 w-[120px] rotate-2" />
            </>
        ),
    },
    {
        kind: 'Tienda de ropa',
        title: 'En la etiqueta',
        text: 'El QR va colgado en la prenda o en la vitrina, con el precio siempre al día.',
        business: 'Ropa Norte',
        themeName: 'Minimalista',
        accent: THEMES.minimalista.accent_color,
        scene: (
            <>
                <div className="absolute inset-0 bg-gradient-to-b from-[#ECEFF2] to-[#E1E5EA]" />
                <div className="absolute inset-x-6 top-7 h-1.5 rounded-full bg-[#9AA0A8]" />
                <div className="absolute left-8 top-7 h-[150px] w-[120px]"><Shirt color="#3E6A8A" /></div>
                <div className="absolute left-[132px] top-7 h-[150px] w-[120px]"><Shirt color="#C9B8A0" /></div>
                {/* Hang tag on a string from the second shirt */}
                <div className="absolute left-[236px] top-[46px] h-12 w-px -rotate-[28deg] bg-[#8C8F96]" />
                <div className="absolute right-6 top-[56px] w-[104px] rotate-[-6deg] rounded-lg bg-white p-2.5 text-center text-[#18181B] shadow-pop" aria-hidden="true">
                    <span className="mx-auto mb-1.5 block h-2 w-2 rounded-full border border-[#C4C7CC]" />
                    <p className="text-[9px] font-semibold uppercase tracking-wider">Ropa Norte</p>
                    <div className="mx-auto mt-1.5 w-fit"><QRCodeComponent url={`${window.location.origin}/`} size={64} /></div>
                    <p className="mt-1.5 text-[9px] leading-tight">Escanea para ver precios</p>
                </div>
            </>
        ),
    },
    {
        kind: 'Artesanía',
        title: 'En tu puesto o feria',
        text: 'Un letrero con QR junto a tus piezas: tus clientes ven todo tu catálogo, no solo lo que cabe en la mesa.',
        business: 'Taller Raíces',
        themeName: 'Papel kraft',
        accent: THEMES.kraft.accent_color,
        scene: (
            <>
                <div className="absolute inset-0 bg-gradient-to-b from-[#F1E6D6] to-[#E9DCC7]" />
                <div className="absolute inset-x-0 bottom-0 h-[112px] bg-[#F8F1E5]">
                    <div className="h-2 bg-[repeating-linear-gradient(90deg,#B4512A_0_12px,#F8F1E5_12px_24px)] opacity-60" />
                </div>
                <div className="absolute bottom-10 left-8 h-[118px] w-[82px]"><Vase /></div>
                <div className="absolute bottom-10 left-[108px] h-9 w-[78px]"><Bowl /></div>
                <div className="absolute bottom-12 right-10 w-[122px] -rotate-2 rounded-lg border-2 border-[#C9A97E] bg-[#E9DCC7] p-2.5 text-center text-[#3B2F22] shadow-pop" aria-hidden="true">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7E5225]">Taller Raíces</p>
                    <div className="mx-auto mt-2 w-fit rounded bg-white p-1"><QRCodeComponent url={`${window.location.origin}/`} size={70} /></div>
                    <p className="mt-2 text-[10px] leading-tight">Mira todas nuestras piezas</p>
                </div>
            </>
        ),
    },
];

/* ---------- WhatsApp assistant ---------- */

// Colors of a WhatsApp chat, so the conversation reads as one at a glance
const CHAT_COLORS = {
    light: { ground: '#EFEAE2', bar: '#F0F2F5', incoming: '#FFFFFF', outgoing: '#D9FDD3', text: '#111B21', meta: '#667781' },
    dark: { ground: '#0B141A', bar: '#202C33', incoming: '#202C33', outgoing: '#005C4B', text: '#E9EDEF', meta: '#8696A0' },
};

const Bubble: React.FC<{ from: 'me' | 'assistant'; time: string; children: React.ReactNode }> = ({ from, time, children }) => (
    <div className={`flex ${from === 'me' ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug shadow-sm" style={{ background: from === 'me' ? 'var(--chat-out)' : 'var(--chat-in)' }}>
            {children}
            <span className="mt-0.5 block text-right text-[10px]" style={{ color: 'var(--chat-meta)' }}>{time}</span>
        </div>
    </div>
);

// Illustrative conversation: a voice note and a photo become products and a QR
const ChatMockup: React.FC = () => {
    const { mode, primary } = usePanelColors();
    const c = CHAT_COLORS[mode];
    return (
        <PhoneFrame label="Ejemplo de conversación con el asistente de SmartQR en WhatsApp" className="w-[17.5rem] sm:w-[19rem]">
            <div style={{ '--chat-in': c.incoming, '--chat-out': c.outgoing, '--chat-meta': c.meta, color: c.text, background: c.ground } as React.CSSProperties}>
                <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: c.bar }}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: primary }}><QrCodeIcon /></span>
                    <div className="leading-tight">
                        <p className="text-sm font-semibold">Asistente SmartQR</p>
                        <p className="text-[11px]" style={{ color: c.meta }}>en línea</p>
                    </div>
                </div>
                <AnimatedContent distance={10} duration={0.4} stagger={0.3} ease="power2.out" className="space-y-1.5 px-3 py-3">
                    <Bubble from="me" time="10:02">Hola, tengo una cafetería y quiero mi carta con QR</Bubble>
                    <Bubble from="assistant" time="10:02">¡Hola! Cuéntame qué vendes: puedes mandarme audios, fotos o escribirme.</Bubble>
                    <Bubble from="me" time="10:03">
                        <span className="flex items-center gap-2 py-0.5">
                            <MicIcon />
                            <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
                                {[6, 12, 9, 16, 10, 14, 7, 12, 15, 8, 11, 6, 13, 9].map((h, i) => (
                                    <span key={i} className="w-[3px] rounded-full" style={{ height: h, background: c.meta }} />
                                ))}
                            </span>
                            <span className="text-[11px]" style={{ color: c.meta }}>0:14</span>
                        </span>
                    </Bubble>
                    <Bubble from="me" time="10:03">
                        <span className="mb-1 flex h-20 w-44 items-center justify-center gap-1.5 rounded-md text-[11px]" style={{ background: mode === 'dark' ? '#0B141A' : '#E9EDEF', color: c.meta }}>
                            <PhotoIcon />
                            Foto del cappuccino
                        </span>
                        El cappuccino a 2.800
                    </Bubble>
                    <Bubble from="assistant" time="10:04">
                        <span className="flex items-start gap-1.5">
                            <span className="mt-0.5 flex-shrink-0" style={{ color: primary }}><CheckIcon /></span>
                            <span>Listo: agregué 5 productos en Cafés, Pastelería y Jugos. Tu QR ya está listo para imprimir.</span>
                        </span>
                    </Bubble>
                </AnimatedContent>
                <div className="flex items-center gap-2 px-2 pb-2.5" aria-hidden="true">
                    <span className="flex-1 rounded-full px-3.5 py-2 text-[13px]" style={{ background: c.incoming, color: c.meta }}>Mensaje</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full text-white" style={{ background: '#00A884' }}><MicIcon /></span>
                </div>
            </div>
        </PhoneFrame>
    );
};

/* ---------- Content ---------- */

const STEPS = [
    { icon: <ViewGridIcon />, title: 'Carga tus productos', text: 'Nombre, precio, foto y categoría desde el panel. O mándaselos al asistente por WhatsApp.' },
    { icon: <ColorSwatchIcon />, title: 'Dale tu estilo', text: 'Elige un tema de colores para tu tienda o arma el tuyo, con el fondo que quieras.' },
    { icon: <QrCodeIcon />, title: 'Imprime tu QR', text: 'Descárgalo o imprímelo y ponlo en la mesa, el mostrador, la vitrina o tus etiquetas.' },
];

const PANEL_FEATURES = [
    { title: 'Productos y categorías', text: 'Con foto, descripción y precio por unidad o por kilo. Ordénalos arrastrando.' },
    { title: 'Disponibilidad al instante', text: 'Marca algo como “No disponible” u ocúltalo de la tienda sin borrarlo.' },
    { title: 'Stock opcional', text: 'Lleva la cuenta de lo que te queda solo en los productos que lo necesitan.' },
    { title: 'Tu información', text: 'Dirección, teléfono, correo y horarios al pie de tu tienda.' },
];

const COMPARISON = [
    { topic: 'Cambiar un precio', printed: 'Reimprimir la carta', smart: 'Al instante, sin imprimir nada' },
    { topic: 'Producto agotado', printed: 'Tacharlo o avisar en caja', smart: 'Se muestra como “No disponible”' },
    { topic: 'Fotos de productos', printed: 'Impresión a color', smart: 'Las tomas con tu celular' },
    { topic: 'Para tus clientes', printed: 'Pedir la carta y esperar', smart: 'Escanear con la cámara, sin descargar nada' },
];

const FAQS = [
    { q: '¿Cómo cargo mis productos?', a: 'Desde el panel web, con nombre, precio, foto y categoría. O enviándoselos al asistente por WhatsApp en audios, fotos o mensajes: él arma tu catálogo.' },
    { q: '¿Mis clientes tienen que descargar una aplicación?', a: 'No. Escanean el QR con la cámara del celular y tu tienda se abre en el navegador.' },
    { q: '¿Puedo cambiar precios o productos después?', a: 'Sí, cuando quieras, desde el panel. Los cambios se ven al instante en tu tienda, sin volver a imprimir el QR.' },
    { q: '¿Puedo adaptar la tienda a mi negocio?', a: 'Sí. Elige entre más de 20 temas de colores o crea el tuyo, con tus colores y un fondo con patrón.' },
    { q: '¿Sirve para mi negocio?', a: 'Si vendes productos con precio, sí: cafeterías, tiendas de ropa, artesanía, almacenes, panaderías, ferias y emprendimientos.' },
    { q: '¿Mis clientes pueden pagar desde la tienda?', a: 'Todavía no. Estamos integrando métodos de pago y te avisaremos apenas estén disponibles.' },
];

const NAV = [
    { id: 'como-funciona', label: 'Cómo funciona' },
    { id: 'ejemplos', label: 'Ejemplos' },
    { id: 'panel', label: 'Panel' },
    { id: 'asistente', label: 'Asistente' },
    { id: 'preguntas', label: 'Preguntas' },
];

const LandingPage: React.FC = () => {
    const { mode, primary } = usePanelColors();

    return (
        // clip, not hidden, so the sticky header keeps working
        <div className="min-h-screen overflow-x-clip bg-canvas text-fg">
            <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur">
                <div className={`${sectionClass} flex h-16 items-center justify-between gap-4`}>
                    <Logo />
                    <nav className="hidden items-center gap-1 lg:flex" aria-label="Secciones">
                        {NAV.map(item => (
                            <button key={item.id} type="button" onClick={() => scrollToSection(item.id)} className={buttonClass('ghost', 'sm')}>{item.label}</button>
                        ))}
                    </nav>
                    <div className="flex items-center gap-2">
                        <Link to="/login" className={buttonClass('ghost', 'sm')}>Iniciar sesión</Link>
                        <Link to="/register" className={`${buttonClass('primary', 'sm')} hidden sm:inline-flex`}>Crear cuenta</Link>
                    </div>
                </div>
            </header>

            <main>
                {/* Hero: the offer, and the whole system in one picture */}
                <section className="relative isolate">
                    <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem]">
                        <Aurora
                            colorStops={mode === 'dark' ? ['#1F3A2A', primary, '#2F5A3E'] : ['#CFE3D5', primary, '#9CC7AA']}
                            lightMode={mode === 'light'}
                            amplitude={0.8}
                            blend={0.6}
                            speed={0.5}
                            opacity={mode === 'dark' ? 0.55 : 0.35}
                        />
                    </div>
                    <div className={`${sectionClass} grid items-center gap-12 pb-20 pt-12 sm:pt-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-10 lg:pb-24 lg:pt-20`}>
                        <Reveal distance={20} duration={0.6}>
                            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-fg-muted">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                                Para cafeterías, tiendas y emprendimientos
                            </p>
                            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[3.25rem]">
                                Tu carta y tu catálogo, en un código QR
                            </h1>
                            <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
                                Carga tus productos en un panel simple, elige el estilo de tu tienda e imprime tu QR. Tus clientes lo escanean y ven todo con precios, sin descargar nada.
                            </p>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <PrimaryCTA className="w-full sm:w-auto" />
                                <WhatsAppCTA className="w-full sm:w-auto" />
                            </div>
                            <p className="mt-4 text-sm text-fg-subtle">
                                ¿Ya tienes tienda? <Link to="/login" className="font-medium text-primary hover:underline">Inicia sesión</Link>
                            </p>
                        </Reveal>
                        <div className="min-w-0">
                            <Reveal distance={24} duration={0.7} delay={0.15}>
                                <HeroComposition />
                            </Reveal>
                            <p className="mt-3 text-right text-xs text-fg-subtle">Ejemplo ilustrativo</p>
                        </div>
                    </div>
                </section>

                {/* How it works: a real sequence, so the steps are numbered */}
                <section id="como-funciona" className="scroll-mt-20 border-y border-line bg-surface py-20">
                    <div className={sectionClass}>
                        <div className="max-w-2xl">
                            <h2 className={sectionTitleClass}>Lista en tres pasos</h2>
                            <p className="mt-3 text-fg-muted">Sin programar ni contratar a nadie. Si sabes usar el celular, puedes armar tu tienda.</p>
                        </div>
                        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
                            {STEPS.map((step, i) => (
                                <li key={step.title} className="relative">
                                    {i < STEPS.length - 1 && (
                                        <span className="absolute left-14 right-4 top-5 hidden border-t border-dashed border-line md:block" aria-hidden="true" />
                                    )}
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">{step.icon}</span>
                                        <span className="relative bg-surface pr-3 text-sm font-medium tabular-nums text-fg-subtle">Paso {i + 1}</span>
                                    </div>
                                    <h3 className="mt-4 text-lg font-semibold text-fg">{step.title}</h3>
                                    <p className="mt-1.5 text-fg-muted">{step.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* Scenes: where each kind of business puts its QR */}
                <section id="ejemplos" className="scroll-mt-20 py-20 lg:py-28">
                    <div className={sectionClass}>
                        <div className="max-w-2xl">
                            <h2 className={sectionTitleClass}>Un QR para cada tipo de negocio</h2>
                            <p className="mt-3 text-fg-muted">En la mesa, colgado en la prenda o junto a tus piezas. Cada tienda con sus colores.</p>
                        </div>
                        <div className="mt-12 grid gap-6 md:grid-cols-3">
                            {SCENES.map(scene => (
                                <figure key={scene.kind} className={`${cardClass} overflow-hidden`}>
                                    <div role="img" aria-label={`Ejemplo: QR de ${scene.business}, ${scene.kind.toLowerCase()}`} className="border-b border-line">
                                        <FitScale width={360} height={240}>
                                            <div className="absolute inset-0 overflow-hidden">{scene.scene}</div>
                                        </FitScale>
                                    </div>
                                    <figcaption className="p-5">
                                        <p className="text-xs font-medium text-fg-subtle">{scene.kind}</p>
                                        <h3 className="mt-1 text-lg font-semibold text-fg">{scene.title}</h3>
                                        <p className="mt-1.5 text-sm text-fg-muted">{scene.text}</p>
                                        <p className="mt-4 flex items-center gap-2 text-xs text-fg-subtle">
                                            <span className="h-3 w-3 rounded-full ring-1 ring-black/10" style={{ background: scene.accent }} aria-hidden="true" />
                                            {scene.business} · tema {scene.themeName}
                                        </p>
                                    </figcaption>
                                </figure>
                            ))}
                        </div>
                        <p className="mt-4 text-xs text-fg-subtle">Negocios de ejemplo.</p>
                    </div>
                </section>

                {/* The panel: what the business manages, with the real QR card and themes */}
                <section id="panel" className="scroll-mt-20 border-y border-line bg-surface py-20 lg:py-28">
                    <div className={`${sectionClass} grid items-center gap-14 lg:grid-cols-2`}>
                        <div className="min-w-0">
                            <h2 className={sectionTitleClass}>Todo tu negocio en un panel simple</h2>
                            <p className="mt-3 max-w-lg text-fg-muted">
                                Desde el computador o el celular, cambias lo que muestra tu tienda y tus clientes lo ven al momento.
                            </p>
                            <dl className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                                {PANEL_FEATURES.map(feature => (
                                    <div key={feature.title}>
                                        <dt className="flex items-center gap-2 font-medium text-fg">
                                            <span className="text-primary"><CheckIcon /></span>
                                            {feature.title}
                                        </dt>
                                        <dd className="mt-1 pl-6 text-sm text-fg-muted">{feature.text}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                        <div role="img" aria-label="Ejemplo del código QR y los temas de la tienda en el panel" className="min-w-0 space-y-4">
                            <div inert className={`${cardClass} flex flex-col items-center gap-5 bg-canvas p-5 sm:flex-row sm:items-center`}>
                                <div className="flex-shrink-0 rounded-xl border border-line bg-white p-2"><QRCodeComponent url={`${window.location.origin}/`} size={120} /></div>
                                <div className="w-full min-w-0">
                                    <p className="text-sm font-semibold text-fg">Código QR de tu carta</p>
                                    <p className="mt-1 text-sm text-fg-muted">Tus clientes lo escanean para abrirla.</p>
                                    <p className="mt-3 truncate rounded-lg border border-line bg-muted/50 px-3 py-1.5 text-xs text-fg-muted">smartqr.cl/#/store/3f9a2c71-5b0e-4d8a-9c1f-7e2b6a4d0c95</p>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <span className={buttonClass('secondary', 'sm')}><DownloadIcon />Descargar</span>
                                        <span className={buttonClass('secondary', 'sm')}><PrinterIcon />Imprimir</span>
                                    </div>
                                </div>
                            </div>
                            <div inert className={`${cardClass} bg-canvas p-5`}>
                                <p className="text-sm font-semibold text-fg">Estilo de la carta</p>
                                <p className="mt-1 text-sm text-fg-muted">Más de 20 temas, o los colores que tú quieras.</p>
                                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                    {THEME_SWATCHES.map((swatch, i) => (
                                        <div key={swatch.name} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${i === 1 ? 'border-primary ring-2 ring-primary/20' : 'border-line'} bg-surface`}>
                                            <span className="flex h-6 w-6 flex-shrink-0 items-end justify-end overflow-hidden rounded-md ring-1 ring-black/10" style={{ background: swatch.bg }}>
                                                <span className="h-3 w-3 rounded-tl-md" style={{ background: swatch.accent }} />
                                            </span>
                                            <span className="truncate text-xs text-fg">{swatch.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* WhatsApp assistant: a highlighted way to set up the store */}
                <section id="asistente" className="scroll-mt-20 py-20 lg:py-28">
                    <div className={`${sectionClass} grid items-center gap-14 lg:grid-cols-2`}>
                        <div className="flex flex-col items-center">
                            <ChatMockup />
                            <p className="mt-3 text-xs text-fg-subtle">Ejemplo ilustrativo</p>
                        </div>
                        <div>
                            <p className="inline-flex items-center gap-2 text-sm font-medium text-primary"><ChatIcon />Asistente por WhatsApp</p>
                            <h2 className={`${sectionTitleClass} mt-3`}>¿Sin tiempo? Mándalo por WhatsApp</h2>
                            <p className="mt-3 max-w-lg text-fg-muted">
                                Escríbele al asistente de SmartQR como le escribirías a un ayudante. Mándale audios, fotos de tus productos o mensajes con precios: él configura tus productos y te deja el QR listo.
                            </p>
                            <ul className="mt-6 flex flex-wrap gap-2" aria-label="Lo que puedes enviar">
                                {[{ icon: <MicIcon />, label: 'Audios' }, { icon: <PhotoIcon />, label: 'Fotos' }, { icon: <ChatIcon />, label: 'Mensajes' }].map(input => (
                                    <li key={input.label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm text-fg [&_svg]:h-4 [&_svg]:w-4">
                                        <span className="text-primary">{input.icon}</span>
                                        {input.label}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-6 text-sm text-fg-muted">Después puedes seguir editando todo desde el panel.</p>
                            <WhatsAppCTA className="mt-8" label="Escribir al asistente" />
                        </div>
                    </div>
                </section>

                {/* Why it is cheaper than a printed menu */}
                <section className="pb-20 lg:pb-28">
                    <div className={sectionClass}>
                        <div className="max-w-2xl">
                            <h2 className={sectionTitleClass}>Ahorra en imprenta y en tiempo</h2>
                            <p className="mt-3 text-fg-muted">Imprimes el QR una vez. Todo lo demás lo cambias cuando quieras.</p>
                        </div>
                        <div className={`${cardClass} mt-10 hidden overflow-hidden sm:block`}>
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-line bg-muted/50 text-fg-muted">
                                        <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Situación</span></th>
                                        <th scope="col" className="px-5 py-3 font-medium">Carta impresa</th>
                                        <th scope="col" className="bg-primary/[0.06] px-5 py-3 font-semibold text-primary">Con SmartQR</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {COMPARISON.map(row => (
                                        <tr key={row.topic}>
                                            <th scope="row" className="px-5 py-4 font-medium text-fg">{row.topic}</th>
                                            <td className="px-5 py-4 text-fg-muted">{row.printed}</td>
                                            <td className="bg-primary/[0.06] px-5 py-4 text-fg">
                                                <span className="flex items-start gap-2">
                                                    <span className="mt-0.5 flex-shrink-0 text-primary"><CheckIcon /></span>
                                                    {row.smart}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <dl className={`${cardClass} mt-8 divide-y divide-line sm:hidden`}>
                            {COMPARISON.map(row => (
                                <div key={row.topic} className="p-4">
                                    <dt className="font-medium text-fg">{row.topic}</dt>
                                    <dd className="mt-2 text-sm text-fg-muted"><span className="font-medium">Carta impresa:</span> {row.printed}</dd>
                                    <dd className="mt-1 flex items-start gap-1.5 text-sm text-fg">
                                        <span className="mt-0.5 flex-shrink-0 text-primary"><CheckIcon /></span>
                                        {row.smart}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </div>
                </section>

                {/* Coming soon: payments */}
                <section className="pb-20 lg:pb-28">
                    <div className={sectionClass}>
                        <div className="flex flex-col gap-6 rounded-2xl border border-primary/25 bg-primary/[0.06] p-6 sm:flex-row sm:items-center sm:p-8">
                            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-fg"><CardIcon /></span>
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-xl font-semibold tracking-tight text-fg">Cobra desde tu tienda</h2>
                                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary">Próximamente</span>
                                </div>
                                <p className="mt-1.5 max-w-2xl text-fg-muted">
                                    Estamos integrando métodos de pago para que tus clientes paguen desde el mismo celular con el que escanean tu QR.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section id="preguntas" className="scroll-mt-20 border-t border-line bg-surface py-20">
                    <div className={`${sectionClass} grid gap-10 lg:grid-cols-[1fr_2fr]`}>
                        <div>
                            <h2 className={sectionTitleClass}>Preguntas frecuentes</h2>
                            <p className="mt-3 text-fg-muted">Lo que suelen preguntar los negocios antes de empezar.</p>
                        </div>
                        <div className="divide-y divide-line border-y border-line">
                            {FAQS.map(faq => (
                                <details key={faq.q} className="group">
                                    <summary className="-mx-3 flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-3 py-4 text-left font-medium text-fg transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
                                        {faq.q}
                                        <span className="flex-shrink-0 text-fg-subtle transition-transform group-open:rotate-45"><PlusIcon /></span>
                                    </summary>
                                    <p className="pb-5 pr-10 text-fg-muted">{faq.a}</p>
                                </details>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-20 lg:py-28">
                    <div className={`${sectionClass} text-center`}>
                        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Tu tienda puede estar lista hoy</h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg text-fg-muted">Carga tus productos, elige tu estilo y pega tu QR donde te vean tus clientes.</p>
                        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                            <PrimaryCTA className="w-full sm:w-auto" />
                            <WhatsAppCTA className="w-full sm:w-auto" />
                        </div>
                    </div>
                </section>
            </main>

            <footer className="border-t border-line">
                <div className={`${sectionClass} flex flex-col items-center justify-between gap-4 py-8 sm:flex-row`}>
                    <p className="text-sm text-fg-subtle">&copy; {new Date().getFullYear()} SmartQR</p>
                    <ColorModeToggle />
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;

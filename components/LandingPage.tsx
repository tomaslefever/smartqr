import React from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../types.ts';
import { whatsappLink } from '../services/whatsapp.ts';
import { Logo } from './AppShell.tsx';
import ColorModeToggle from './ColorModeToggle.tsx';
import QRCodeComponent from './QRCode.tsx';
import { ProductCard } from './Store.tsx';
import { DEFAULT_THEME_STYLE, themeStyleVars } from './storeTheme.ts';
import { ArrowRightIcon, CardIcon, ChatIcon, CheckIcon, MicIcon, PhotoIcon, PlusIcon, QrCodeIcon, SearchIcon } from './Icons.tsx';
import { buttonClass, cardClass } from './ui.ts';
import { Reveal, usePanelColors } from './effects.tsx';
import AnimatedContent from './reactbits/AnimatedContent.tsx';
import Aurora from './reactbits/Aurora.tsx';

const WHATSAPP_MESSAGE = 'Hola, quiero crear la tienda de mi negocio con SmartQR';

// Example business shown in the mockups, labeled as an example wherever it appears
const EXAMPLE_NAME = 'Almacén La Esquina';

const exampleProduct = (id: number, name: string, description: string, price: number, category: string, extra: Partial<Product> = {}): Product => ({
    id, name, description, price, category,
    image_url: '', stock: 0, track_stock: false, out_of_stock: false, active: true, created_at: '', unit: 'unit',
    ...extra,
});

const EXAMPLE_PRODUCTS: Product[] = [
    exampleProduct(1, 'Marraqueta', 'Horneada cada mañana', 2990, 'Panadería', { unit: 'kg' }),
    exampleProduct(2, 'Leche entera 1 L', '', 1190, 'Lácteos'),
    exampleProduct(3, 'Palta Hass', 'Llega el jueves', 4990, 'Verduras', { unit: 'kg', out_of_stock: true }),
];

// Section anchors scroll in place: with the hash router, a #fragment link would change the route
const scrollToSection = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const sectionClass = 'mx-auto max-w-6xl px-4 sm:px-6';
const sectionTitleClass = 'text-2xl font-semibold tracking-tight text-fg sm:text-3xl';

// Main call to action: the WhatsApp assistant when its number is configured, the web sign-up otherwise
const PrimaryCTA: React.FC<{ className?: string }> = ({ className = '' }) => {
    const href = whatsappLink(WHATSAPP_MESSAGE);
    const classes = `${buttonClass('primary')} h-12 px-6 text-base ${className}`;
    return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
            <ChatIcon />
            Armar mi tienda por WhatsApp
        </a>
    ) : (
        <Link to="/register" className={classes}>
            Crear mi tienda
            <ArrowRightIcon />
        </Link>
    );
};

// Compact version of the primary action for the sticky header
const HeaderCTA: React.FC = () => {
    const href = whatsappLink(WHATSAPP_MESSAGE);
    const classes = `${buttonClass('primary', 'sm')} hidden sm:inline-flex`;
    return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={classes}>
            <ChatIcon />
            Escribir al asistente
        </a>
    ) : (
        <Link to="/register" className={classes}>Crear cuenta</Link>
    );
};

const SecondaryCTA: React.FC<{ className?: string }> = ({ className = '' }) =>
    whatsappLink(WHATSAPP_MESSAGE) ? (
        <Link to="/register" className={`${buttonClass('secondary')} h-12 px-6 text-base ${className}`}>
            Prefiero hacerlo en la web
        </Link>
    ) : null;

/* ---------- Mockups ---------- */

const PhoneFrame: React.FC<{ children: React.ReactNode; className?: string; label: string }> = ({ children, className = '', label }) => (
    <div role="img" aria-label={label} className={`relative w-[17.5rem] rounded-[2.25rem] border border-line bg-surface p-2 shadow-pop sm:w-[19rem] ${className}`}>
        {/* inert: the example cards inside are real store components, but here they are only a picture */}
        <div inert className="overflow-hidden rounded-[1.75rem]">{children}</div>
    </div>
);

// Colors of a WhatsApp chat, so the conversation reads as one at a glance
const CHAT_COLORS = {
    light: { ground: '#EFEAE2', bar: '#F0F2F5', incoming: '#FFFFFF', outgoing: '#D9FDD3', text: '#111B21', meta: '#667781' },
    dark: { ground: '#0B141A', bar: '#202C33', incoming: '#202C33', outgoing: '#005C4B', text: '#E9EDEF', meta: '#8696A0' },
};

const Bubble: React.FC<{ from: 'me' | 'assistant'; time: string; children: React.ReactNode }> = ({ from, time, children }) => (
    <div className={`flex ${from === 'me' ? 'justify-end' : 'justify-start'}`}>
        <div
            className="max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13px] leading-snug shadow-sm"
            style={{ background: from === 'me' ? 'var(--chat-out)' : 'var(--chat-in)' }}
        >
            {children}
            <span className="mt-0.5 block text-right text-[10px]" style={{ color: 'var(--chat-meta)' }}>{time}</span>
        </div>
    </div>
);

// Illustrative conversation with the assistant: a voice note and a photo become products and a QR
const ChatMockup: React.FC = () => {
    const { mode, primary } = usePanelColors();
    const c = CHAT_COLORS[mode];
    return (
        <PhoneFrame label={`Ejemplo de conversación con el asistente de SmartQR en WhatsApp para ${EXAMPLE_NAME}`}>
            <div
                style={{ '--chat-in': c.incoming, '--chat-out': c.outgoing, '--chat-meta': c.meta, color: c.text, background: c.ground } as React.CSSProperties}
            >
                <div className="flex items-center gap-2.5 px-3 py-2.5" style={{ background: c.bar }}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: primary }}>
                        <QrCodeIcon />
                    </span>
                    <div className="leading-tight">
                        <p className="text-sm font-semibold">Asistente SmartQR</p>
                        <p className="text-[11px]" style={{ color: c.meta }}>en línea</p>
                    </div>
                </div>
                <AnimatedContent trigger="mount" distance={10} duration={0.4} delay={0.3} stagger={0.35} ease="power2.out" className="space-y-1.5 px-3 py-3">
                    <Bubble from="me" time="10:02">Hola, tengo un almacén y quiero mi carta con QR</Bubble>
                    <Bubble from="assistant" time="10:02">¡Hola! Cuéntame qué vendes: puedes mandarme audios, fotos o escribirme.</Bubble>
                    <Bubble from="me" time="10:03">
                        <span className="flex items-center gap-2 py-0.5">
                            <MicIcon />
                            {/* Waveform of the voice note */}
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
                            Foto de la marraqueta
                        </span>
                        La marraqueta a 2.990 el kilo
                    </Bubble>
                    <Bubble from="assistant" time="10:04">
                        <span className="flex items-start gap-1.5">
                            <span className="mt-0.5 flex-shrink-0" style={{ color: primary }}><CheckIcon /></span>
                            <span>Listo: agregué 3 productos en Panadería, Lácteos y Verduras. Tu QR ya está listo para imprimir.</span>
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

// The printed card a business leaves on the counter. Opens this page when scanned.
const QRTableCard: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`w-40 rounded-2xl border border-black/5 bg-white p-3.5 text-center text-[#3D3D3D] shadow-pop ${className}`} aria-hidden="true">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#4A7C59]">{EXAMPLE_NAME}</p>
        <div className="mx-auto mt-2.5 w-fit"><QRCodeComponent url={`${window.location.origin}/`} size={104} /></div>
        <p className="mt-2.5 text-[11px] leading-tight">Escanea y mira nuestros productos</p>
    </div>
);

// The public store as customers see it, built with the store's own product cards and default theme
const StoreMockup: React.FC = () => (
    <PhoneFrame label={`Ejemplo de la tienda de ${EXAMPLE_NAME} vista desde el celular de un cliente`}>
        <div className="h-[34rem] overflow-hidden text-[color:var(--store-text)]" style={{ ...themeStyleVars(DEFAULT_THEME_STYLE), background: DEFAULT_THEME_STYLE.background_color }}>
            <div className="bg-[color:var(--store-card)] px-4 pb-4 pt-5 text-center shadow-md">
                <p className="text-xl font-bold text-[color:var(--store-accent)]">{EXAMPLE_NAME}</p>
                <p className="mt-1 text-xs text-[color:var(--store-muted)]">Productos de calidad, a tu alcance.</p>
            </div>
            <div className="space-y-3 px-3 py-3">
                <div className="flex items-center gap-2 rounded-full border border-[color:var(--store-border)] bg-[color:var(--store-card)] px-3 py-1.5 text-xs text-[color:var(--store-muted)]">
                    <SearchIcon />
                    Buscar productos...
                </div>
                <div className="flex gap-1.5 overflow-hidden">
                    {['Todos', 'Panadería', 'Lácteos', 'Verduras'].map((category, i) => (
                        <span key={category} className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${i === 0 ? 'bg-[color:var(--store-accent)] text-[color:var(--store-on-accent)]' : 'bg-[color:var(--store-subtle)]'}`}>
                            {category}
                        </span>
                    ))}
                </div>
                <div className="space-y-2.5">
                    {EXAMPLE_PRODUCTS.map(product => <ProductCard key={product.id} product={product} onClick={() => {}} />)}
                </div>
            </div>
        </div>
    </PhoneFrame>
);

/* ---------- Content ---------- */

const STEPS = [
    { icon: <ChatIcon />, title: 'Escríbele al asistente', text: 'Abre el chat de SmartQR en WhatsApp, el mismo que ya usas todos los días.' },
    { icon: <MicIcon />, title: 'Cuéntale qué vendes', text: 'Con nombres y precios, como te salga más fácil. Él arma tu catálogo.', inputs: true },
    { icon: <QrCodeIcon />, title: 'Imprime tu QR', text: 'Recibe tu código listo para pegar en el mostrador, la vitrina o cada mesa.' },
];

const COMPARISON = [
    { topic: 'Cambiar un precio', printed: 'Reimprimir la carta', smart: 'Al instante, sin imprimir nada' },
    { topic: 'Producto agotado', printed: 'Tacharlo o avisar en caja', smart: 'Se muestra como “No disponible”' },
    { topic: 'Fotos de productos', printed: 'Impresión a color', smart: 'Las tomas con tu celular' },
    { topic: 'Para tus clientes', printed: 'Pedir la carta y esperar', smart: 'Escanear con la cámara, sin descargar nada' },
];

const FEATURES = [
    'Categorías en el orden que quieras',
    'Precios por unidad o por kilo',
    'Control de stock opcional',
    'Oculta productos sin borrarlos',
    'Colores y estilo para tu tienda',
    'Dirección, contacto y horarios',
    'Buscador para tus clientes',
    'QR para descargar o imprimir',
];

const FAQS = [
    { q: '¿Mis clientes tienen que descargar una aplicación?', a: 'No. Escanean el QR con la cámara del celular y tu tienda se abre en el navegador.' },
    { q: '¿Qué le puedo enviar al asistente?', a: 'Audios contándole qué vendes, fotos de tus productos y mensajes de texto con nombres y precios. El asistente los convierte en tu catálogo y te deja el QR listo.' },
    { q: '¿Necesito saber de tecnología?', a: 'No. Si sabes usar WhatsApp, puedes armar tu tienda. Y si prefieres, también puedes cargar todo tú desde el panel web.' },
    { q: '¿Puedo cambiar precios o productos después?', a: 'Sí, cuando quieras, desde el panel. Los cambios se ven al instante en tu tienda, sin volver a imprimir el QR.' },
    { q: '¿Sirve para mi negocio?', a: 'Si vendes productos con precio, sí: almacenes, panaderías, verdulerías, cafeterías, botillerías, ferias y emprendimientos.' },
    { q: '¿Mis clientes pueden pagar desde la tienda?', a: 'Todavía no. Estamos integrando métodos de pago y te avisaremos apenas estén disponibles.' },
];

const LandingPage: React.FC = () => {
    const { mode, primary } = usePanelColors();

    return (
        // clip, not hidden, so the sticky header keeps working
        <div className="min-h-screen overflow-x-clip bg-canvas text-fg">
            <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/80 backdrop-blur">
                <div className={`${sectionClass} flex h-16 items-center justify-between gap-4`}>
                    <Logo />
                    <nav className="hidden items-center gap-1 md:flex" aria-label="Secciones">
                        <button type="button" onClick={() => scrollToSection('como-funciona')} className={buttonClass('ghost', 'sm')}>Cómo funciona</button>
                        <button type="button" onClick={() => scrollToSection('tienda')} className={buttonClass('ghost', 'sm')}>Tu tienda</button>
                        <button type="button" onClick={() => scrollToSection('preguntas')} className={buttonClass('ghost', 'sm')}>Preguntas</button>
                    </nav>
                    <div className="flex items-center gap-2">
                        <Link to="/login" className={buttonClass('ghost', 'sm')}>Iniciar sesión</Link>
                        <HeaderCTA />
                    </div>
                </div>
            </header>

            <main>
                {/* Hero: the offer on the left, the WhatsApp conversation and the printed QR on the right */}
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
                    <div className={`${sectionClass} grid items-center gap-14 pb-20 pt-12 sm:pt-16 lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20`}>
                        <Reveal distance={20} duration={0.6}>
                            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-fg-muted">
                                <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                                Para almacenes, cafés y pequeñas tiendas
                            </p>
                            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl lg:text-[3.25rem]">
                                Tu tienda con QR, <span className="whitespace-nowrap">armada por WhatsApp</span>
                            </h1>
                            <p className="mt-5 max-w-xl text-lg leading-relaxed text-fg-muted">
                                Mándale al asistente audios, fotos y mensajes con tus productos y precios. Él arma tu catálogo y te deja el QR listo para imprimir. Tus clientes lo abren con la cámara, sin descargar nada.
                            </p>
                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <PrimaryCTA className="w-full sm:w-auto" />
                                <SecondaryCTA className="w-full sm:w-auto" />
                            </div>
                            <p className="mt-4 text-sm text-fg-subtle">
                                ¿Ya tienes tienda? <Link to="/login" className="font-medium text-primary hover:underline">Inicia sesión</Link>
                            </p>
                        </Reveal>

                        <div className="relative mx-auto flex justify-center lg:justify-end">
                            <ChatMockup />
                            <QRTableCard className="absolute -bottom-6 -left-[9.5rem] hidden -rotate-3 sm:block" />
                            <p className="absolute -bottom-7 right-2 text-xs text-fg-subtle">Ejemplo ilustrativo</p>
                        </div>
                    </div>
                </section>

                {/* How it works over WhatsApp: a real sequence, so the steps are numbered */}
                <section id="como-funciona" className="scroll-mt-20 border-y border-line bg-surface py-20">
                    <div className={sectionClass}>
                        <div className="max-w-2xl">
                            <h2 className={sectionTitleClass}>Lista en una conversación</h2>
                            <p className="mt-3 text-fg-muted">Sin formularios ni planillas: le hablas al asistente como le hablarías a un ayudante.</p>
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
                                    {step.inputs && (
                                        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Lo que puedes enviar">
                                            {[{ icon: <MicIcon />, label: 'Audios' }, { icon: <PhotoIcon />, label: 'Fotos' }, { icon: <ChatIcon />, label: 'Mensajes' }].map(input => (
                                                <li key={input.label} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1 text-sm text-fg [&_svg]:h-4 [&_svg]:w-4">
                                                    <span className="text-primary">{input.icon}</span>
                                                    {input.label}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                {/* What customers see, with the real store cards */}
                <section id="tienda" className="scroll-mt-20 py-20 lg:py-28">
                    <div className={`${sectionClass} grid items-center gap-14 lg:grid-cols-2`}>
                        <div className="order-2 flex justify-center lg:order-1">
                            <StoreMockup />
                        </div>
                        <div className="order-1 lg:order-2">
                            <h2 className={sectionTitleClass}>Así ven tu tienda tus clientes</h2>
                            <p className="mt-3 max-w-lg text-fg-muted">
                                Escanean el QR y ven tus productos con precio, ordenados por categoría, con un buscador y tus datos de contacto. Desde cualquier celular.
                            </p>
                            <ul className="mt-8 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                                {FEATURES.map(feature => (
                                    <li key={feature} className="flex items-start gap-2.5 text-sm text-fg">
                                        <span className="mt-0.5 text-primary"><CheckIcon /></span>
                                        {feature}
                                    </li>
                                ))}
                            </ul>
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
                        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Tu tienda puede estar lista hoy</h2>
                        <p className="mx-auto mt-4 max-w-xl text-lg text-fg-muted">Escríbele al asistente, cuéntale qué vendes y pega tu QR en el mostrador.</p>
                        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                            <PrimaryCTA className="w-full sm:w-auto" />
                            <SecondaryCTA className="w-full sm:w-auto" />
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

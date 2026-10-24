import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Category, Product } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useColorMode } from '../context/ColorModeContext.tsx';
import { PageHeader, useShell } from './AppShell.tsx';
import QRCodeComponent from './QRCode.tsx';
import { getStoreUrl, printQR, toPrintableDataUrl } from './StoreQRModal.tsx';
import { STATUS_FILTERS, isActive } from './ProductsPage.tsx';
import { ArrowRightIcon, CheckIcon, ColorSwatchIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, PlusIcon, PrinterIcon, QrCodeIcon, TagIcon, ViewGridIcon } from './Icons.tsx';
import { buttonClass, cardClass, iconButtonClass } from './ui.ts';

// Recharts sets colors as SVG attributes, where CSS variables do not resolve, so they are picked per mode
const CHART_COLORS = {
    light: { bar: '#3D6B4C', grid: '#E4E4E7', tick: '#71717A', tooltipBg: '#FFFFFF', tooltipBorder: '#E4E4E7', tooltipText: '#18181B', cursor: '#F4F4F5' },
    dark: { bar: '#84B896', grid: '#27272C', tick: '#85858F', tooltipBg: '#131315', tooltipBorder: '#27272C', tooltipText: '#F4F4F5', cursor: '#1E1E22' },
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const StatCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <div className={`${cardClass} p-5`}>
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
);

const shortcutClass = `${cardClass} group flex items-center gap-4 p-4 text-left transition-colors hover:border-control hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40`;

const ShortcutContent: React.FC<{ icon: React.ReactNode; title: string; detail: string; primary?: boolean }> = ({ icon, title, detail, primary }) => (
    <>
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${primary ? 'bg-primary text-primary-fg' : 'bg-muted text-fg-muted'} [&_svg]:h-5 [&_svg]:w-5`}>{icon}</span>
        <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg">{title}</span>
            <span className="block truncate text-xs text-fg-subtle">{detail}</span>
        </span>
        <span className="text-fg-subtle transition-transform group-hover:translate-x-0.5"><ArrowRightIcon /></span>
    </>
);

const HomePage: React.FC = () => {
    const { user } = useAuth();
    const { openQR } = useShell();
    const { resolved } = useColorMode();
    const chartColors = CHART_COLORS[resolved];
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [businessName, setBusinessName] = useState('');
    const [themeName, setThemeName] = useState('');
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const storeUrl = getStoreUrl(user?.id);

    useEffect(() => {
        const load = async () => {
            const [productsData, categoriesData, profile] = await Promise.all([
                supabaseService.getProducts(),
                supabaseService.getCategoryList(),
                supabaseService.getProfile(),
            ]);
            const theme = profile?.theme_id ? await supabaseService.getTheme(profile.theme_id) : null;
            setProducts(productsData);
            setCategories(categoriesData);
            setBusinessName(profile?.business_name ?? '');
            setThemeName(theme?.name ?? 'Estilo por defecto');
            setLoading(false);
        };
        load();
    }, []);

    const stats = useMemo(() => {
        const visible = products.filter(isActive);
        return {
            total: products.length,
            visible: visible.length,
            inactive: products.length - visible.length,
            unavailable: products.filter(p => p.out_of_stock).length,
            withPhoto: products.filter(p => p.image_url).length,
        };
    }, [products]);

    // Things worth fixing, each linking to the product list filtered to the affected products
    const insights = useMemo(() => {
        const items: { key: string; text: string; detail: string }[] = [];
        const count = (key: string) => products.filter(STATUS_FILTERS[key].matches).length;
        const noPhoto = count('sin-foto');
        const noPrice = count('sin-precio');
        const noCategory = count('sin-categoria');
        const inactive = count('ocultos');
        const unavailable = count('no-disponibles');
        if (noPhoto) items.push({ key: 'sin-foto', text: `${plural(noPhoto, 'producto', 'productos')} sin foto`, detail: 'Una foto ayuda a decidir: puedes subirla desde la lista.' });
        if (noPrice) items.push({ key: 'sin-precio', text: `${plural(noPrice, 'producto', 'productos')} sin precio`, detail: 'Tu carta no muestra precio para ellos.' });
        if (noCategory && categories.length > 0) items.push({ key: 'sin-categoria', text: `${plural(noCategory, 'producto', 'productos')} sin categoría`, detail: 'Aparecen al inicio de tu carta, sin título.' });
        if (unavailable) items.push({ key: 'no-disponibles', text: `${plural(unavailable, 'producto', 'productos')} no ${unavailable === 1 ? 'disponible' : 'disponibles'}`, detail: 'Se muestran atenuados en tu carta.' });
        if (inactive) items.push({ key: 'ocultos', text: `${plural(inactive, 'producto desactivado', 'productos desactivados')}`, detail: 'No aparecen en tu carta.' });
        return items;
    }, [products, categories]);

    const categoryData = useMemo(() => {
        const counts = new Map<string, number>(categories.map(c => [c.name, 0]));
        products.forEach(p => {
            const name = p.category || 'Sin categoría';
            counts.set(name, (counts.get(name) ?? 0) + 1);
        });
        return Array.from(counts, ([name, value]) => ({ name, value })).filter(d => d.value > 0);
    }, [products, categories]);

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(storeUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Error copying store URL:', error);
        }
    };

    const handleDownload = async () => {
        try {
            const link = document.createElement('a');
            link.href = await toPrintableDataUrl(storeUrl);
            link.download = 'smartqr-tienda.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error generating QR code for download:', error);
        }
    };

    const handlePrint = async () => {
        try {
            printQR(await toPrintableDataUrl(storeUrl), businessName);
        } catch (error) {
            console.error('Error generating QR code for printing:', error);
        }
    };

    const value = (n: number) => (loading ? '—' : n.toLocaleString('es-CL'));

    return (
        <>
            <PageHeader
                title={businessName ? `Hola, ${businessName}` : 'Inicio'}
                description="El resumen de tu carta y accesos directos."
            />

            <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Link to="/productos?nuevo=1" className={shortcutClass}>
                    <ShortcutContent primary icon={<PlusIcon />} title="Añadir producto" detail="Suma algo nuevo a tu carta" />
                </Link>
                <Link to="/productos" className={shortcutClass}>
                    <ShortcutContent icon={<ViewGridIcon />} title="Productos" detail={loading ? 'Edita y ordena tu carta' : plural(stats.total, 'producto', 'productos')} />
                </Link>
                <Link to="/categorias" className={shortcutClass}>
                    <ShortcutContent icon={<TagIcon />} title="Categorías" detail={loading ? 'Agrupa tus productos' : categories.length ? plural(categories.length, 'categoría', 'categorías') : 'Crea tu primera categoría'} />
                </Link>
                <Link to="/estilo" className={shortcutClass}>
                    <ShortcutContent icon={<ColorSwatchIcon />} title="Estilo de la carta" detail={loading ? 'Colores y fondo' : `Tema: ${themeName}`} />
                </Link>
                <button type="button" onClick={openQR} className={shortcutClass}>
                    <ShortcutContent icon={<QrCodeIcon />} title="Código QR" detail="Descárgalo o imprímelo" />
                </button>
                <a href={storeUrl} target="_blank" rel="noopener noreferrer" className={shortcutClass}>
                    <ShortcutContent icon={<ExternalLinkIcon />} title="Ver tienda" detail="Tu carta como la ven tus clientes" />
                </a>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Productos en la carta" value={value(stats.visible)} hint={stats.inactive > 0 ? `${plural(stats.inactive, 'desactivado', 'desactivados')}` : 'Todos activos'} />
                <StatCard label="Categorías" value={value(categories.length)} />
                <StatCard label="No disponibles" value={value(stats.unavailable)} hint="Marcados como agotados" />
                <StatCard label="Con foto" value={loading ? '—' : `${stats.withPhoto} de ${stats.total}`} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="min-w-0 space-y-6 xl:col-span-2">
                    <section className={`${cardClass} p-5`}>
                        <h2 className="text-sm font-semibold text-fg">Para mejorar tu carta</h2>
                        {loading ? (
                            <div className="mt-4 space-y-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
                        ) : insights.length === 0 ? (
                            <p className="mt-4 flex items-center gap-2 text-sm text-fg-muted"><span className="text-success"><CheckIcon /></span>Todo en orden: tus productos tienen foto, precio y categoría.</p>
                        ) : (
                            <ul className="mt-3 divide-y divide-line">
                                {insights.map(item => (
                                    <li key={item.key}>
                                        <Link to={`/productos?estado=${item.key}`} className="group flex items-center gap-4 py-3">
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-medium text-fg">{item.text}</span>
                                                <span className="block text-xs text-fg-subtle">{item.detail}</span>
                                            </span>
                                            <span className="flex items-center gap-1 text-sm font-medium text-primary">Revisar <span className="transition-transform group-hover:translate-x-0.5"><ArrowRightIcon /></span></span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className={`${cardClass} p-5`}>
                        <h2 className="text-sm font-semibold text-fg">Productos por categoría</h2>
                        {!loading && categoryData.length === 0 ? (
                            <p className="mt-4 text-sm text-fg-muted">Aún no hay productos.</p>
                        ) : (
                            <div className="mt-4 h-64">
                                <ResponsiveContainer>
                                    <BarChart data={categoryData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartColors.grid} />
                                        <XAxis dataKey="name" tick={{ fill: chartColors.tick, fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={56} />
                                        <YAxis allowDecimals={false} tick={{ fill: chartColors.tick, fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            cursor={{ fill: chartColors.cursor }}
                                            contentStyle={{ background: chartColors.tooltipBg, border: `1px solid ${chartColors.tooltipBorder}`, borderRadius: 8, fontSize: 12, color: chartColors.tooltipText }}
                                            labelStyle={{ color: chartColors.tooltipText, fontWeight: 600 }}
                                            itemStyle={{ color: chartColors.tooltipText }}
                                            formatter={(count) => [count, 'Productos']}
                                        />
                                        <Bar dataKey="value" fill={chartColors.bar} radius={[4, 4, 0, 0]} maxBarSize={32} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </section>
                </div>

                <section className={`${cardClass} min-w-0 self-start p-5`}>
                    <h2 className="text-sm font-semibold text-fg">Código QR de tu carta</h2>
                    <p className="mt-1 text-sm text-fg-muted">Tus clientes lo escanean para abrirla.</p>
                    <div className="mt-5 flex justify-center">
                        <button type="button" onClick={openQR} className="rounded-xl border border-line bg-white p-2 transition-shadow hover:shadow-pop" title="Ver más grande" aria-label="Ver el código QR más grande">
                            <QRCodeComponent url={storeUrl} />
                        </button>
                    </div>
                    <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-muted/50 py-1 pl-3 pr-1">
                        <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-fg-muted hover:text-fg" title={storeUrl}>
                            {storeUrl.replace(/^https?:\/\//, '')}
                        </a>
                        <button onClick={handleCopyUrl} className={iconButtonClass} title={copied ? 'Copiado' : 'Copiar enlace'} aria-label="Copiar enlace">
                            {copied ? <span className="text-success"><CheckIcon /></span> : <CopyIcon />}
                        </button>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <button onClick={handleDownload} className={buttonClass('secondary')}><DownloadIcon />Descargar</button>
                        <button onClick={handlePrint} className={buttonClass('secondary')}><PrinterIcon />Imprimir</button>
                    </div>
                </section>
            </div>
        </>
    );
};

export default HomePage;

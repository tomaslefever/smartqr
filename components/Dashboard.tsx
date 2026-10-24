import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Product } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useColorMode } from '../context/ColorModeContext.tsx';
import ProductModal from './ProductModal.tsx';
import Switch from './Switch.tsx';
import ThemePickerCard from './ThemePickerCard.tsx';
import { PageHeader } from './AppShell.tsx';
import QRCode from 'qrcode';
import QRCodeComponent, { QR_OPTIONS } from './QRCode.tsx';
import { EditIcon, DeleteIcon, PlusIcon, DownloadIcon, SearchIcon, CopyIcon, CheckIcon, PackageIcon } from './Icons.tsx';
import { buttonClass, cardClass, iconButtonClass, inputClass } from './ui.ts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const formatPrice = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;

// Recharts sets colors as SVG attributes, where CSS variables do not resolve, so they are picked per mode
const CHART_COLORS = {
    light: { bar: '#3D6B4C', grid: '#E4E4E7', tick: '#71717A', tooltipBg: '#FFFFFF', tooltipBorder: '#E4E4E7', tooltipText: '#18181B', cursor: '#F4F4F5' },
    dark: { bar: '#84B896', grid: '#27272C', tick: '#85858F', tooltipBg: '#131315', tooltipBorder: '#27272C', tooltipText: '#F4F4F5', cursor: '#1E1E22' },
};

const StatCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
    <div className={`${cardClass} p-5`}>
        <p className="text-sm text-fg-muted">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-fg tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
    </div>
);

const ProductRow: React.FC<{ product: Product; onEdit: (product: Product) => void; onDelete: (id: number) => void; onToggleOutOfStock: (product: Product) => void; }> = ({ product, onEdit, onDelete, onToggleOutOfStock }) => (
    <tr className="group border-b border-line last:border-0 transition-colors hover:bg-muted/50">
        <td className="py-3 pl-5 pr-3">
            <div className="flex items-center gap-3">
                <img src={product.image_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg border border-line object-cover" />
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">{product.name}</p>
                    <p className="truncate text-xs text-fg-subtle">{product.category}</p>
                </div>
            </div>
        </td>
        <td className="px-3 py-3 text-sm text-fg tabular-nums whitespace-nowrap">
            {formatPrice(product.price)}{product.unit === 'kg' && <span className="text-fg-subtle">/kg</span>}
        </td>
        <td className="px-3 py-3 text-sm text-fg-muted tabular-nums">
            {product.track_stock ? product.stock : <span className="text-fg-subtle" title="Sin control de stock">—</span>}
        </td>
        <td className="px-3 py-3">
            <Switch checked={product.out_of_stock} onChange={() => onToggleOutOfStock(product)} label={`Marcar ${product.name} sin stock`} />
        </td>
        <td className="py-3 pl-3 pr-5">
            <div className="flex justify-end gap-1">
                <button onClick={() => onEdit(product)} className={iconButtonClass} title="Editar" aria-label={`Editar ${product.name}`}>
                    <EditIcon />
                </button>
                <button onClick={() => onDelete(product.id)} className={`${iconButtonClass} hover:!text-danger hover:!bg-danger/10`} title="Eliminar" aria-label={`Eliminar ${product.name}`}>
                    <DeleteIcon />
                </button>
            </div>
        </td>
    </tr>
);

const SkeletonRows: React.FC = () => (
    <>
        {Array.from({ length: 5 }, (_, i) => (
            <tr key={i} className="border-b border-line last:border-0">
                <td className="py-3 pl-5 pr-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                        <div className="space-y-2"><div className="h-3 w-32 animate-pulse rounded bg-muted" /><div className="h-2.5 w-20 animate-pulse rounded bg-muted" /></div>
                    </div>
                </td>
                <td className="px-3 py-3"><div className="h-3 w-14 animate-pulse rounded bg-muted" /></td>
                <td className="px-3 py-3"><div className="h-3 w-6 animate-pulse rounded bg-muted" /></td>
                <td className="px-3 py-3"><div className="h-5 w-9 animate-pulse rounded-full bg-muted" /></td>
                <td className="py-3 pl-3 pr-5" />
            </tr>
        ))}
    </>
);

const Dashboard: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [copied, setCopied] = useState(false);
    const { user } = useAuth();
    const { resolved } = useColorMode();
    const chartColors = CHART_COLORS[resolved];

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const [productsData, categoriesData] = await Promise.all([
                supabaseService.getProducts(),
                supabaseService.getCategories()
            ]);
            setProducts(productsData);
            setCategories(categoriesData);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenProductModal = (product: Product | null = null) => {
        setEditingProduct(product);
        setIsProductModalOpen(true);
    };

    const handleCloseProductModal = () => {
        setIsProductModalOpen(false);
        setEditingProduct(null);
    };

    const handleSaveProduct = async (product: Product | Omit<Product, 'id' | 'created_at'>, imageFile: File | null) => {
        let image_url = product.image_url;

        if (imageFile) {
            image_url = await supabaseService.uploadImage(imageFile);
        }

        const productData = { ...product, image_url };

        const saved = 'id' in productData
            ? await supabaseService.updateProduct(productData.id, productData)
            : await supabaseService.addProduct(productData);

        if (!saved) {
            throw new Error('No se pudo guardar el producto. Inténtalo de nuevo.');
        }
        fetchData();
        handleCloseProductModal();
    };

    const handleDeleteProduct = async (id: number) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este producto?')) {
            await supabaseService.deleteProduct(id);
            fetchData();
        }
    };

    const handleToggleOutOfStock = async (product: Product) => {
        const out_of_stock = !product.out_of_stock;
        const setFlag = (value: boolean) =>
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, out_of_stock: value } : p));

        // Update the row immediately and roll back if Supabase rejects the change
        setFlag(out_of_stock);
        const saved = await supabaseService.updateProduct(product.id, { out_of_stock });
        if (!saved) {
            setFlag(product.out_of_stock);
            alert('No se pudo actualizar el producto. Inténtalo de nuevo.');
        }
    };

    const stats = useMemo(() => {
        // Only products with stock control count towards inventory figures
        const stocked = products.filter(p => p.track_stock);
        return {
            totalProducts: products.length,
            unavailable: products.filter(p => p.out_of_stock).length,
            totalStock: stocked.reduce((sum, p) => sum + p.stock, 0),
            totalValue: stocked.reduce((sum, p) => sum + (p.price * p.stock), 0),
            stockedCount: stocked.length,
        };
    }, [products]);

    const categoryData = useMemo(() => {
        const counts: { [key: string]: number } = {};
        products.forEach(p => {
            counts[p.category] = (counts[p.category] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [products]);

    const visibleProducts = useMemo(() => {
        const term = search.trim().toLowerCase();
        return products.filter(p =>
            (!categoryFilter || p.category === categoryFilter) &&
            (!term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)));
    }, [products, search, categoryFilter]);

    const storeUrl = `${window.location.origin}${window.location.pathname}#/store/${user?.id}`;

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(storeUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Error copying store URL:', error);
        }
    };

    const handleDownloadQR = async () => {
        try {
            // margin 4 keeps the standard quiet zone so the printed code scans reliably
            const dataUrl = await QRCode.toDataURL(storeUrl, { ...QR_OPTIONS, width: 1024, margin: 4 });
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = 'smartqr-tienda.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error generating QR code for download:', error);
        }
    };

    const stockHint = stats.stockedCount === 0 ? 'Ningún producto maneja stock' : `${stats.stockedCount} con control de stock`;

    return (
        <>
            <PageHeader
                title="Productos"
                description="Administra la carta de tu negocio."
                actions={
                    <button onClick={() => handleOpenProductModal()} className={buttonClass('primary')}>
                        <PlusIcon />
                        Añadir producto
                    </button>
                }
            />

            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Productos" value={loading ? '—' : stats.totalProducts.toString()} />
                <StatCard label="No disponibles" value={loading ? '—' : stats.unavailable.toString()} hint="Marcados sin stock" />
                <StatCard label="Artículos en stock" value={loading ? '—' : stats.totalStock.toLocaleString('es-CL')} hint={stockHint} />
                <StatCard label="Valor del inventario" value={loading ? '—' : formatPrice(stats.totalValue)} hint={stockHint} />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <section className={`${cardClass} min-w-0 overflow-hidden xl:col-span-2`}>
                    <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-fg-subtle"><SearchIcon /></span>
                            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar productos..." aria-label="Buscar productos" className={`${inputClass} pl-9`} />
                        </div>
                        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Filtrar por categoría" className={`${inputClass} sm:w-48`}>
                            <option value="">Todas las categorías</option>
                            {categories.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                    </div>
                    {/* relative: keeps absolutely positioned children (e.g. sr-only labels) inside the scroller */}
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-line text-xs font-medium text-fg-subtle">
                                    <th className="py-2.5 pl-5 pr-3 font-medium">Producto</th>
                                    <th className="px-3 py-2.5 font-medium">Precio</th>
                                    <th className="px-3 py-2.5 font-medium">Stock</th>
                                    <th className="px-3 py-2.5 font-medium">Sin stock</th>
                                    <th className="py-2.5 pl-3 pr-5"><span className="sr-only">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <SkeletonRows />
                                ) : visibleProducts.length > 0 ? (
                                    visibleProducts.map(p => <ProductRow key={p.id} product={p} onEdit={() => handleOpenProductModal(p)} onDelete={handleDeleteProduct} onToggleOutOfStock={handleToggleOutOfStock} />)
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-16 text-center">
                                            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-fg-subtle [&_svg]:h-5 [&_svg]:w-5"><PackageIcon /></div>
                                            {products.length === 0 ? (
                                                <>
                                                    <p className="text-sm font-medium text-fg">Aún no tienes productos</p>
                                                    <p className="mt-1 text-sm text-fg-muted">Añade el primero para que aparezca en tu carta.</p>
                                                    <button onClick={() => handleOpenProductModal()} className={`${buttonClass('primary', 'sm')} mt-4`}><PlusIcon />Añadir producto</button>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-sm font-medium text-fg">Sin resultados</p>
                                                    <p className="mt-1 text-sm text-fg-muted">Ningún producto coincide con la búsqueda.</p>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {!loading && products.length > 0 && (
                        <p className="border-t border-line px-5 py-3 text-xs text-fg-subtle">
                            {visibleProducts.length === products.length ? `${products.length} productos` : `${visibleProducts.length} de ${products.length} productos`}
                        </p>
                    )}
                </section>

                <div className="min-w-0 space-y-6">
                    <section className={`${cardClass} p-5`}>
                        <h2 className="text-sm font-semibold text-fg">Código QR de la tienda</h2>
                        <p className="mt-1 text-sm text-fg-muted">Escanéalo para abrir tu carta pública.</p>
                        <div className="mt-5 flex justify-center">
                            <div className="rounded-xl border border-line bg-white p-2">
                                <QRCodeComponent url={storeUrl} />
                            </div>
                        </div>
                        <div className="mt-5 flex items-center gap-2 rounded-lg border border-line bg-muted/50 py-1 pl-3 pr-1">
                            <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-fg-muted hover:text-fg" title={storeUrl}>
                                {storeUrl.replace(/^https?:\/\//, '')}
                            </a>
                            <button onClick={handleCopyUrl} className={iconButtonClass} title={copied ? 'Copiado' : 'Copiar enlace'} aria-label="Copiar enlace">
                                {copied ? <span className="text-success"><CheckIcon /></span> : <CopyIcon />}
                            </button>
                        </div>
                        <button onClick={handleDownloadQR} className={`${buttonClass('secondary')} mt-3 w-full`}>
                            <DownloadIcon />
                            Descargar QR (1024 px)
                        </button>
                    </section>

                    <ThemePickerCard />

                    <section className={`${cardClass} p-5`}>
                        <h2 className="text-sm font-semibold text-fg">Productos por categoría</h2>
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
                                        formatter={(value) => [value, 'Productos']}
                                    />
                                    <Bar dataKey="value" fill={chartColors.bar} radius={[4, 4, 0, 0]} maxBarSize={32} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                </div>
            </div>

            {isProductModalOpen && <ProductModal product={editingProduct} categories={categories} onClose={handleCloseProductModal} onSave={handleSaveProduct} />}
        </>
    );
};

export default Dashboard;

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Product } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useColorMode } from '../context/ColorModeContext.tsx';
import ProductModal from './ProductModal.tsx';
import Switch from './Switch.tsx';
import StoreQRModal from './StoreQRModal.tsx';
import { PageHeader } from './AppShell.tsx';
import { EditIcon, DeleteIcon, PlusIcon, SearchIcon, PackageIcon, UploadIcon, QrCodeIcon } from './Icons.tsx';
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

// Clicking the empty thumbnail opens the file picker and uploads the picture without going through the edit modal
const ImagePlaceholderButton: React.FC<{ product: Product; uploading: boolean; onUploadImage: (product: Product, file: File) => void; }> = ({ product, uploading, onUploadImage }) => (
    <label
        title={uploading ? 'Subiendo imagen...' : 'Subir imagen'}
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-control bg-muted/40 text-fg-subtle transition-colors focus-within:ring-2 focus-within:ring-primary/40 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-current ${uploading ? 'cursor-wait' : 'cursor-pointer hover:border-primary hover:bg-primary/5 hover:text-primary'}`}
    >
        {uploading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <UploadIcon />}
        <input
            type="file"
            className="sr-only"
            accept="image/png, image/jpeg, image/gif, image/webp"
            disabled={uploading}
            aria-label={`Subir imagen de ${product.name}`}
            onChange={e => {
                const file = e.target.files?.[0];
                // Reset so picking the same file again after a failed upload still fires onChange
                e.target.value = '';
                if (file) onUploadImage(product, file);
            }}
        />
    </label>
);

// Rows from before supabase/products-active.sql have no `active` value and count as active
const isActive = (product: Product) => product.active !== false;

const ProductRow: React.FC<{ product: Product; uploading: boolean; onEdit: (product: Product) => void; onDelete: (id: number) => void; onToggleOutOfStock: (product: Product) => void; onToggleActive: (product: Product) => void; onUploadImage: (product: Product, file: File) => void; }> = ({ product, uploading, onEdit, onDelete, onToggleOutOfStock, onToggleActive, onUploadImage }) => (
    <tr className="group border-b border-line last:border-0 transition-colors hover:bg-muted/50">
        <td className="py-3 pl-5 pr-3">
            <div className={`flex items-center gap-3 transition-opacity ${isActive(product) ? '' : 'opacity-50'}`}>
                {product.image_url ? (
                    <img src={product.image_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg border border-line object-cover" />
                ) : (
                    <ImagePlaceholderButton product={product} uploading={uploading} onUploadImage={onUploadImage} />
                )}
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                        {product.name}
                        {!isActive(product) && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-fg-muted">Oculto</span>}
                    </p>
                    {product.category && <p className="truncate text-xs text-fg-subtle">{product.category}</p>}
                </div>
            </div>
        </td>
        <td className="px-3 py-3 text-sm text-fg tabular-nums whitespace-nowrap">
            {product.price > 0
                ? <>{formatPrice(product.price)}{product.unit === 'kg' && <span className="text-fg-subtle">/kg</span>}</>
                : <span className="text-fg-subtle" title="Sin precio">—</span>}
        </td>
        <td className="px-3 py-3 text-sm text-fg-muted tabular-nums">
            {product.track_stock ? product.stock : <span className="text-fg-subtle" title="Sin control de stock">—</span>}
        </td>
        <td className="px-3 py-3">
            <Switch checked={product.out_of_stock} onChange={() => onToggleOutOfStock(product)} label={`Marcar ${product.name} sin stock`} />
        </td>
        <td className="px-3 py-3">
            <Switch checked={isActive(product)} onChange={() => onToggleActive(product)} label={`${isActive(product) ? 'Desactivar' : 'Activar'} ${product.name}`} />
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
    const [qrOpen, setQrOpen] = useState(false);
    const [uploadingIds, setUploadingIds] = useState<Set<number>>(new Set());
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

    const updateFlag = async (product: Product, field: 'out_of_stock' | 'active', value: boolean) => {
        const setFlag = (next: boolean) =>
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, [field]: next } : p));

        // Update the row immediately and roll back if Supabase rejects the change
        setFlag(value);
        const saved = await supabaseService.updateProduct(product.id, { [field]: value });
        if (!saved) {
            setFlag(!value);
            alert('No se pudo actualizar el producto. Inténtalo de nuevo.');
        }
    };

    const handleToggleOutOfStock = (product: Product) => updateFlag(product, 'out_of_stock', !product.out_of_stock);

    const handleToggleActive = (product: Product) => updateFlag(product, 'active', !isActive(product));

    const handleUploadImage = async (product: Product, file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('El archivo debe ser una imagen (PNG, JPG, GIF o WEBP).');
            return;
        }
        setUploadingIds(prev => new Set(prev).add(product.id));
        try {
            const image_url = await supabaseService.uploadImage(file);
            const saved = await supabaseService.updateProduct(product.id, { image_url });
            if (!saved) {
                throw new Error('No se pudo guardar la imagen del producto. Inténtalo de nuevo.');
            }
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, image_url } : p));
        } catch (error) {
            console.error('Error uploading product image:', error);
            alert(error instanceof Error ? error.message : 'No se pudo subir la imagen. Inténtalo de nuevo.');
        } finally {
            setUploadingIds(prev => {
                const next = new Set(prev);
                next.delete(product.id);
                return next;
            });
        }
    };

    const stats = useMemo(() => {
        // Only products with stock control count towards inventory figures
        const stocked = products.filter(p => p.track_stock);
        return {
            totalProducts: products.length,
            inactive: products.filter(p => !isActive(p)).length,
            unavailable: products.filter(p => p.out_of_stock).length,
            totalStock: stocked.reduce((sum, p) => sum + p.stock, 0),
            totalValue: stocked.reduce((sum, p) => sum + (p.price * p.stock), 0),
            stockedCount: stocked.length,
        };
    }, [products]);

    const categoryData = useMemo(() => {
        const counts: { [key: string]: number } = {};
        products.forEach(p => {
            const category = p.category || 'Sin categoría';
            counts[category] = (counts[category] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [products]);

    const visibleProducts = useMemo(() => {
        const term = search.trim().toLowerCase();
        return products.filter(p =>
            (!categoryFilter || p.category === categoryFilter) &&
            (!term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)));
    }, [products, search, categoryFilter]);

    const stockHint = stats.stockedCount === 0 ? 'Ningún producto maneja stock' : `${stats.stockedCount} con control de stock`;

    return (
        <>
            <PageHeader
                title="Productos"
                description="Administra la carta de tu negocio."
                actions={
                    <>
                        <button onClick={() => setQrOpen(true)} className={buttonClass('secondary')}>
                            <QrCodeIcon />
                            Ver QR
                        </button>
                        <button onClick={() => handleOpenProductModal()} className={buttonClass('primary')}>
                            <PlusIcon />
                            Añadir producto
                        </button>
                    </>
                }
            />

            <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Productos" value={loading ? '—' : stats.totalProducts.toString()} hint={stats.inactive > 0 ? `${stats.inactive} ${stats.inactive === 1 ? 'desactivado' : 'desactivados'}` : undefined} />
                <StatCard label="No disponibles" value={loading ? '—' : stats.unavailable.toString()} hint="Marcados sin stock" />
                <StatCard label="Artículos en stock" value={loading ? '—' : stats.totalStock.toLocaleString('es-CL')} hint={stockHint} />
                <StatCard label="Valor del inventario" value={loading ? '—' : formatPrice(stats.totalValue)} hint={stockHint} />
            </div>

            <div className="space-y-6">
                <section className={`${cardClass} min-w-0 overflow-hidden`}>
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
                                    <th className="px-3 py-2.5 font-medium">Activo</th>
                                    <th className="py-2.5 pl-3 pr-5"><span className="sr-only">Acciones</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <SkeletonRows />
                                ) : visibleProducts.length > 0 ? (
                                    visibleProducts.map(p => <ProductRow key={p.id} product={p} uploading={uploadingIds.has(p.id)} onEdit={() => handleOpenProductModal(p)} onDelete={handleDeleteProduct} onToggleOutOfStock={handleToggleOutOfStock} onToggleActive={handleToggleActive} onUploadImage={handleUploadImage} />)
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="px-5 py-16 text-center">
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

            {isProductModalOpen && <ProductModal product={editingProduct} categories={categories} onClose={handleCloseProductModal} onSave={handleSaveProduct} />}
            {qrOpen && <StoreQRModal onClose={() => setQrOpen(false)} />}
        </>
    );
};

export default Dashboard;

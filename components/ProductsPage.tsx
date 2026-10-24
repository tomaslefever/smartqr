import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Category, Product } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import ProductModal, { ProductDraft } from './ProductModal.tsx';
import Switch from './Switch.tsx';
import { PageHeader } from './AppShell.tsx';
import { EditIcon, DeleteIcon, PlusIcon, SearchIcon, PackageIcon, UploadIcon, GripIcon } from './Icons.tsx';
import { buttonClass, cardClass, iconButtonClass, inputClass } from './ui.ts';

export const formatPrice = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;

// Rows from before supabase/products-active.sql have no `active` value and count as active
export const isActive = (product: Product) => product.active !== false;

// Quick filters, also reachable from the home page through ?estado=
export const STATUS_FILTERS: Record<string, { label: string; matches: (p: Product) => boolean }> = {
    'sin-foto': { label: 'Sin foto', matches: p => !p.image_url },
    'sin-precio': { label: 'Sin precio', matches: p => !(p.price > 0) },
    'sin-categoria': { label: 'Sin categoría', matches: p => !p.category },
    'ocultos': { label: 'Desactivados', matches: p => !isActive(p) },
    'no-disponibles': { label: 'No disponibles', matches: p => p.out_of_stock },
};

const NO_CATEGORY = 'none';

// Drags that carry files (from the computer), as opposed to dragging text or rows
const isFileDrag = (e: React.DragEvent | DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

// The empty thumbnail uploads a picture without going through the edit modal: click it to pick a
// file, or drop an image on it
const ImagePlaceholderButton: React.FC<{ product: Product; uploading: boolean; onUploadImage: (product: Product, file: File) => void; }> = ({ product, uploading, onUploadImage }) => {
    const [isOver, setIsOver] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        if (!isFileDrag(e) || uploading) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setIsOver(true);
    };

    const handleDrop = (e: React.DragEvent) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setIsOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !uploading) onUploadImage(product, file);
    };

    return (
        <label
            title={uploading ? 'Subiendo imagen...' : 'Subir imagen (haz clic o arrastra una imagen aquí)'}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={() => setIsOver(false)}
            onDrop={handleDrop}
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-dashed transition-colors focus-within:ring-2 focus-within:ring-primary/40 [&_svg]:h-5 [&_svg]:w-5 [&_svg]:text-current ${
                isOver
                    ? 'scale-110 border-primary bg-primary/10 text-primary ring-2 ring-primary/30'
                    : `border-control bg-muted/40 text-fg-subtle ${uploading ? 'cursor-wait' : 'cursor-pointer hover:border-primary hover:bg-primary/5 hover:text-primary'}`
            }`}
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
};

const Badge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted whitespace-nowrap">{children}</span>
);

const ProductRow: React.FC<{
    product: Product;
    uploading: boolean;
    onEdit: (product: Product) => void;
    onDelete: (product: Product) => void;
    onToggleActive: (product: Product) => void;
    onUploadImage: (product: Product, file: File) => void;
}> = ({ product, uploading, onEdit, onDelete, onToggleActive, onUploadImage }) => {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: product.id });

    return (
        <tr
            ref={setNodeRef}
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={`border-b border-line last:border-0 transition-colors ${isDragging ? 'relative z-10 bg-surface shadow-pop' : 'hover:bg-muted/50'}`}
        >
            <td className="w-8 py-3 pl-3 pr-0">
                <button
                    ref={setActivatorNodeRef}
                    {...attributes}
                    {...listeners}
                    type="button"
                    className={`${iconButtonClass} h-7 w-6 touch-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    title="Arrastra para reordenar"
                    aria-label={`Reordenar ${product.name}`}
                >
                    <GripIcon />
                </button>
            </td>
            <td className="py-3 pl-2 pr-3">
                <div className={`flex items-center gap-3 transition-opacity ${isActive(product) ? '' : 'opacity-50'}`}>
                    {product.image_url ? (
                        <img src={product.image_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-lg border border-line object-cover" />
                    ) : (
                        <ImagePlaceholderButton product={product} uploading={uploading} onUploadImage={onUploadImage} />
                    )}
                    <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                            <button type="button" onClick={() => onEdit(product)} className="truncate rounded text-left text-sm font-medium text-fg hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" title="Editar">
                                {product.name}
                            </button>
                            {!isActive(product) && <Badge>Desactivado</Badge>}
                            {product.out_of_stock && <Badge>No disponible</Badge>}
                        </div>
                        {product.category && <p className="truncate text-xs text-fg-subtle">{product.category}</p>}
                    </div>
                </div>
            </td>
            <td className="px-3 py-3 text-sm text-fg tabular-nums whitespace-nowrap">
                {product.price > 0
                    ? <>{formatPrice(product.price)}{product.unit === 'kg' && <span className="text-fg-subtle">/kg</span>}</>
                    : <span className="text-fg-subtle" title="Sin precio">—</span>}
            </td>
            <td className="px-3 py-3">
                <Switch checked={isActive(product)} onChange={() => onToggleActive(product)} label={`${isActive(product) ? 'Desactivar' : 'Activar'} ${product.name}`} />
            </td>
            <td className="py-3 pl-3 pr-5">
                <div className="flex justify-end gap-1">
                    <button onClick={() => onEdit(product)} className={iconButtonClass} title="Editar" aria-label={`Editar ${product.name}`}>
                        <EditIcon />
                    </button>
                    <button onClick={() => onDelete(product)} className={`${iconButtonClass} hover:!text-danger hover:!bg-danger/10`} title="Eliminar" aria-label={`Eliminar ${product.name}`}>
                        <DeleteIcon />
                    </button>
                </div>
            </td>
        </tr>
    );
};

const SkeletonRows: React.FC = () => (
    <>
        {Array.from({ length: 6 }, (_, i) => (
            <tr key={i} className="border-b border-line last:border-0">
                <td className="w-8 py-3 pl-3 pr-0" />
                <td className="py-3 pl-2 pr-3">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                        <div className="space-y-2"><div className="h-3 w-32 animate-pulse rounded bg-muted" /><div className="h-2.5 w-20 animate-pulse rounded bg-muted" /></div>
                    </div>
                </td>
                <td className="px-3 py-3"><div className="h-3 w-14 animate-pulse rounded bg-muted" /></td>
                <td className="px-3 py-3"><div className="h-5 w-9 animate-pulse rounded-full bg-muted" /></td>
                <td className="py-3 pl-3 pr-5" />
            </tr>
        ))}
    </>
);

const ProductsPage: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [search, setSearch] = useState('');
    const [uploadingIds, setUploadingIds] = useState<Set<number>>(new Set());
    const [searchParams, setSearchParams] = useSearchParams();

    // Category and status filters live in the URL, so the home page can link to them
    const categoryFilter = searchParams.get('categoria') ?? '';
    const statusFilter = searchParams.get('estado') ?? '';
    const setParam = (key: string, value: string) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(key, value); else next.delete(key);
        setSearchParams(next, { replace: true });
    };

    const fetchData = useCallback(async () => {
        try {
            const [productsData, categoriesData] = await Promise.all([
                supabaseService.getProducts(),
                supabaseService.getCategoryList(),
            ]);
            setProducts(productsData);
            setCategories(categoriesData);
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // A file dropped outside a thumbnail would make the browser open it and leave the panel
    useEffect(() => {
        const ignoreFileDrop = (e: DragEvent) => {
            if (isFileDrag(e)) e.preventDefault();
        };
        window.addEventListener('dragover', ignoreFileDrop);
        window.addEventListener('drop', ignoreFileDrop);
        return () => {
            window.removeEventListener('dragover', ignoreFileDrop);
            window.removeEventListener('drop', ignoreFileDrop);
        };
    }, []);

    const handleOpenProductModal = (product: Product | null = null) => {
        setEditingProduct(product);
        setIsProductModalOpen(true);
    };

    // ?nuevo=1 (from the home page shortcuts) opens the form for a new product
    useEffect(() => {
        if (searchParams.get('nuevo')) {
            handleOpenProductModal();
            setParam('nuevo', '');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const handleCloseProductModal = () => {
        setIsProductModalOpen(false);
        setEditingProduct(null);
    };

    const handleSaveProduct = async (draft: ProductDraft, imageFile: File | null, newCategoryName: string | null) => {
        let { category_id, category } = draft;

        // A category typed in the form is created first (or reused if it already exists)
        if (newCategoryName) {
            const existing = categories.find(c => c.name.toLowerCase() === newCategoryName.toLowerCase());
            const created = existing ?? await supabaseService.createCategory(newCategoryName);
            if (!created) throw new Error('No se pudo crear la categoría. Inténtalo de nuevo.');
            if (!existing) setCategories(prev => [...prev, created]);
            category_id = created.id;
            category = created.name;
        }

        const image_url = imageFile ? await supabaseService.uploadImage(imageFile) : draft.image_url;
        const { id, ...fields } = { ...draft, category_id, category, image_url };

        const saved = id !== undefined
            ? await supabaseService.updateProduct(id, fields)
            : await supabaseService.addProduct(fields);

        if (!saved) {
            throw new Error('No se pudo guardar el producto. Inténtalo de nuevo.');
        }
        await fetchData();
        handleCloseProductModal();
    };

    const deleteProduct = async (product: Product) => {
        if (!(await supabaseService.deleteProduct(product.id))) {
            throw new Error('No se pudo eliminar el producto. Inténtalo de nuevo.');
        }
        setProducts(prev => prev.filter(p => p.id !== product.id));
    };

    const handleDeleteFromList = async (product: Product) => {
        if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
        try {
            await deleteProduct(product);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'No se pudo eliminar el producto.');
        }
    };

    const handleDeleteFromModal = async (product: Product) => {
        await deleteProduct(product);
        handleCloseProductModal();
    };

    const handleToggleActive = async (product: Product) => {
        const value = !isActive(product);
        const setActive = (next: boolean) =>
            setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, active: next } : p)));

        // Update the row immediately and roll back if Supabase rejects the change
        setActive(value);
        if (!(await supabaseService.updateProduct(product.id, { active: value }))) {
            setActive(!value);
            alert('No se pudo actualizar el producto. Inténtalo de nuevo.');
        }
    };

    const handleUploadImage = async (product: Product, file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('El archivo debe ser una imagen (PNG, JPG, GIF o WEBP).');
            return;
        }
        setUploadingIds(prev => new Set(prev).add(product.id));
        try {
            const image_url = await supabaseService.uploadImage(file);
            if (!(await supabaseService.updateProduct(product.id, { image_url }))) {
                throw new Error('No se pudo guardar la imagen del producto. Inténtalo de nuevo.');
            }
            setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, image_url } : p)));
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

    const visibleProducts = useMemo(() => {
        const term = search.trim().toLowerCase();
        const status = STATUS_FILTERS[statusFilter];
        return products.filter(p =>
            (!categoryFilter || (categoryFilter === NO_CATEGORY ? !p.category_id : String(p.category_id) === categoryFilter)) &&
            (!status || status.matches(p)) &&
            (!term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term)));
    }, [products, search, categoryFilter, statusFilter]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const productName = (id: string | number) => products.find(p => p.id === id)?.name ?? 'Producto';
    const dndAccessibility = {
        screenReaderInstructions: { draggable: 'Para reordenar, presiona espacio, muévelo con las flechas y presiona espacio de nuevo para soltarlo. Escape cancela.' },
        announcements: {
            onDragStart: ({ active }: { active: { id: string | number } }) => `Moviendo ${productName(active.id)}.`,
            onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => over ? `${productName(active.id)} sobre ${productName(over.id)}.` : undefined,
            onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => over ? `${productName(active.id)} quedó en la posición de ${productName(over.id)}.` : undefined,
            onDragCancel: ({ active }: { active: { id: string | number } }) => `Se canceló mover ${productName(active.id)}.`,
        },
    };

    const handleDragEnd = async ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        const visibleIds = visibleProducts.map(p => p.id);
        const reorderedVisible = arrayMove(visibleProducts, visibleIds.indexOf(Number(active.id)), visibleIds.indexOf(Number(over.id)));

        // With a filter, the visible products keep the slots they occupy in the full list, in their
        // new order, so the rest of the menu does not move
        const visibleSet = new Set(visibleIds);
        let next = 0;
        const newOrder = products.map(p => (visibleSet.has(p.id) ? reorderedVisible[next++] : p));

        const previous = products;
        setProducts(newOrder);
        if (!(await supabaseService.reorderProducts(newOrder.map(p => p.id)))) {
            setProducts(previous);
            alert('No se pudo guardar el nuevo orden. Inténtalo de nuevo.');
        }
    };

    const filtered = visibleProducts.length !== products.length;

    return (
        <>
            <PageHeader
                title="Productos"
                description="Todo lo que aparece en tu carta."
                actions={
                    <button onClick={() => handleOpenProductModal()} className={buttonClass('primary')}>
                        <PlusIcon />
                        Añadir producto
                    </button>
                }
            />

            <section className={`${cardClass} min-w-0 overflow-hidden`}>
                <div className="flex flex-col gap-3 border-b border-line p-4 md:flex-row md:items-center">
                    <div className="relative flex-1">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-fg-subtle"><SearchIcon /></span>
                        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar productos..." aria-label="Buscar productos" className={`${inputClass} pl-9`} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:flex">
                        <select value={categoryFilter} onChange={e => setParam('categoria', e.target.value)} aria-label="Filtrar por categoría" className={`${inputClass} md:w-48`}>
                            <option value="">Todas las categorías</option>
                            {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            <option value={NO_CATEGORY}>Sin categoría</option>
                        </select>
                        <select value={statusFilter} onChange={e => setParam('estado', e.target.value)} aria-label="Filtrar por estado" className={`${inputClass} md:w-44`}>
                            <option value="">Todos los estados</option>
                            {Object.entries(STATUS_FILTERS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
                        </select>
                    </div>
                </div>
                {/* relative: keeps absolutely positioned children (e.g. sr-only labels) inside the scroller */}
                <div className="relative overflow-x-auto">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} accessibility={dndAccessibility}>
                        <SortableContext items={visibleProducts.map(p => p.id)} strategy={verticalListSortingStrategy}>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-line text-xs font-medium text-fg-subtle">
                                        <th className="w-8 py-2.5 pl-3 pr-0"><span className="sr-only">Orden</span></th>
                                        <th className="py-2.5 pl-2 pr-3 font-medium">Producto</th>
                                        <th className="px-3 py-2.5 font-medium">Precio</th>
                                        <th className="px-3 py-2.5 font-medium">Activo</th>
                                        <th className="py-2.5 pl-3 pr-5"><span className="sr-only">Acciones</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <SkeletonRows />
                                    ) : visibleProducts.length > 0 ? (
                                        visibleProducts.map(p => (
                                            <ProductRow key={p.id} product={p} uploading={uploadingIds.has(p.id)} onEdit={handleOpenProductModal} onDelete={handleDeleteFromList} onToggleActive={handleToggleActive} onUploadImage={handleUploadImage} />
                                        ))
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
                                                        <p className="mt-1 text-sm text-fg-muted">Ningún producto coincide con los filtros.</p>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </SortableContext>
                    </DndContext>
                </div>
                {!loading && products.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-xs text-fg-subtle">
                        <p>
                            {filtered ? `${visibleProducts.length} de ${products.length} productos` : `${products.length} productos`}
                            {filtered && <> · <button type="button" onClick={() => { setSearch(''); setSearchParams({}, { replace: true }); }} className="text-primary hover:underline">Quitar filtros</button></>}
                        </p>
                        <p className="flex items-center gap-1">Arrastra <span className="[&_svg]:h-3.5 [&_svg]:w-3.5"><GripIcon /></span> para cambiar el orden en tu carta.</p>
                    </div>
                )}
            </section>

            {isProductModalOpen && (
                <ProductModal
                    product={editingProduct}
                    categories={categories}
                    onClose={handleCloseProductModal}
                    onSave={handleSaveProduct}
                    onDelete={handleDeleteFromModal}
                />
            )}
        </>
    );
};

export default ProductsPage;

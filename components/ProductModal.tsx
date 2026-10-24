import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Category, Product } from '../types.ts';
import { DeleteIcon, UploadIcon } from './Icons.tsx';
import Modal, { modalBodyClass, modalFooterClass } from './Modal.tsx';
import { buttonClass, errorBoxClass, hintClass, inputClass, labelClass, textareaClass } from './ui.ts';
import Switch from './Switch.tsx';

// What the form produces: a product without the fields the database assigns
export type ProductDraft = Omit<Product, 'id' | 'created_at'> & { id?: number };

interface ProductModalProps {
    product: Product | null;
    categories: Category[];
    onClose: () => void;
    // newCategoryName is set when the user typed a category that does not exist yet
    onSave: (draft: ProductDraft, imageFile: File | null, newCategoryName: string | null) => Promise<void>;
    onDelete?: (product: Product) => Promise<void>;
}

const NEW_CATEGORY = '__new__';
const ACCEPTED_IMAGES = 'image/png, image/jpeg, image/gif, image/webp';

interface FormState {
    name: string;
    description: string;
    price: string;
    unit: 'unit' | 'kg';
    categoryValue: string; // category id, '' for none, or NEW_CATEGORY
    newCategory: string;
    active: boolean;
    outOfStock: boolean;
    trackStock: boolean;
    stock: string;
    imageUrl: string;
}

const initialState = (product: Product | null): FormState => ({
    name: product?.name ?? '',
    description: product?.description ?? '',
    // 0 means "no price", shown as an empty field
    price: product?.price ? product.price.toString() : '',
    unit: product?.unit || 'unit',
    categoryValue: product?.category_id ? String(product.category_id) : '',
    newCategory: '',
    active: product ? product.active !== false : true,
    outOfStock: product?.out_of_stock ?? false,
    trackStock: product?.track_stock ?? false,
    stock: product ? String(product.stock ?? 0) : '',
    imageUrl: product?.image_url ?? '',
});

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <section className="space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">{title}</h3>
        {children}
    </section>
);

const ToggleRow: React.FC<{ id: string; label: string; hint: string; checked: boolean; onChange: (value: boolean) => void }> = ({ id, label, hint, checked, onChange }) => (
    <div className="flex items-start justify-between gap-4">
        <div>
            <label htmlFor={id} className={labelClass}>{label}</label>
            <p className={hintClass}>{hint}</p>
        </div>
        <Switch id={id} checked={checked} onChange={onChange} />
    </div>
);

const ProductModal: React.FC<ProductModalProps> = ({ product, categories, onClose, onSave, onDelete }) => {
    const initial = useMemo(() => initialState(product), [product]);
    const [form, setForm] = useState<FormState>(initial);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>(initial.imageUrl);
    const [isDragging, setIsDragging] = useState(false);
    const [showInventory, setShowInventory] = useState(initial.trackStock);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    // Release the object URL of a picked image when it is replaced or the modal closes
    useEffect(() => () => { if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview); }, [imagePreview]);

    const isDirty = imageFile !== null || JSON.stringify(form) !== JSON.stringify(initial);
    const busy = saving || deleting;

    const update = (changes: Partial<FormState>) => {
        setForm(prev => ({ ...prev, ...changes }));
        setError(null);
    };

    const requestClose = () => {
        if (busy) return;
        if (isDirty && !window.confirm('Tienes cambios sin guardar. ¿Cerrar de todos modos?')) return;
        onClose();
    };

    const pickImage = (file: File | undefined) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setError('El archivo debe ser una imagen (PNG, JPG, GIF o WEBP).');
            return;
        }
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        setError(null);
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview('');
        update({ imageUrl: '' });
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        e?.preventDefault();
        const name = form.name.trim();
        if (!name) {
            setError('El nombre es obligatorio.');
            return;
        }
        const newCategoryName = form.categoryValue === NEW_CATEGORY ? form.newCategory.trim() || null : null;
        const category = categories.find(c => String(c.id) === form.categoryValue);
        const price = parseFloat(form.price);
        const stock = parseInt(form.stock, 10);

        // Only the name is required: an empty category, description or price is saved as none / '' / 0
        const draft: ProductDraft = {
            ...(product && { id: product.id }),
            name,
            description: form.description.trim(),
            price: Number.isFinite(price) && price > 0 ? price : 0,
            unit: form.unit,
            category_id: category?.id ?? null,
            category: category?.name ?? '',
            active: form.active,
            out_of_stock: form.outOfStock,
            track_stock: form.trackStock,
            // Without stock control the previous value is kept, so turning it back on restores it
            stock: form.trackStock ? (Number.isFinite(stock) && stock > 0 ? stock : 0) : (product?.stock ?? 0),
            image_url: form.imageUrl,
        };

        setSaving(true);
        setError(null);
        try {
            await onSave(draft, imageFile, newCategoryName);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!product || !onDelete) return;
        if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return;
        setDeleting(true);
        try {
            await onDelete(product);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo eliminar el producto.');
            setDeleting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            if (!busy) handleSubmit();
        }
    };

    const handleDrag = (e: React.DragEvent, action: 'over' | 'leave' | 'drop') => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(action === 'over');
        if (action === 'drop') pickImage(e.dataTransfer.files?.[0]);
    };

    return (
        <Modal title={product ? 'Editar producto' : 'Nuevo producto'} onClose={requestClose} size="max-w-3xl">
            <form ref={formRef} onSubmit={handleSubmit} onKeyDown={handleKeyDown} onDrop={e => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
                <div className={`${modalBodyClass} grid grid-cols-1 gap-8 md:grid-cols-[14rem_1fr]`}>
                    {/* On mobile the details come first and the image column goes below */}
                    <div className="order-2 space-y-8 md:order-1">
                        <Section title="Imagen">
                            <div
                                onDragOver={e => handleDrag(e, 'over')}
                                onDragLeave={e => handleDrag(e, 'leave')}
                                onDrop={e => handleDrag(e, 'drop')}
                                className={`relative mx-auto aspect-square w-full max-w-[12rem] overflow-hidden rounded-xl border transition-colors md:max-w-none ${isDragging ? 'border-primary bg-primary/5' : imagePreview ? 'border-line' : 'border-dashed border-control bg-muted/40'}`}
                            >
                                {imagePreview ? (
                                    <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                                ) : (
                                    <label htmlFor="product-image" className="flex h-full cursor-pointer flex-col items-center justify-center gap-2 px-4 text-center">
                                        <span className="[&_svg]:h-8 [&_svg]:w-8 [&_svg]:text-fg-subtle"><UploadIcon /></span>
                                        <span className="text-sm font-medium text-primary">Subir imagen</span>
                                        <span className="text-xs text-fg-subtle">o arrastra un archivo<br />PNG, JPG, GIF o WEBP · 10 MB</span>
                                    </label>
                                )}
                                <input id="product-image" type="file" className="sr-only" accept={ACCEPTED_IMAGES} onChange={e => { pickImage(e.target.files?.[0]); e.target.value = ''; }} />
                            </div>
                            {imagePreview ? (
                                <div className="flex gap-2">
                                    <label htmlFor="product-image" className={`${buttonClass('secondary', 'sm')} flex-1 cursor-pointer`}>Cambiar</label>
                                    <button type="button" onClick={removeImage} className={`${buttonClass('ghost', 'sm')} flex-1`}>Quitar</button>
                                </div>
                            ) : (
                                <p className={hintClass}>Opcional. Sin imagen, la tarjeta en tu carta muestra solo el texto.</p>
                            )}
                        </Section>

                        <Section title="Visibilidad">
                            <ToggleRow id="active" label="Activo" hint="Si lo desactivas, no aparece en tu carta." checked={form.active} onChange={active => update({ active })} />
                            <ToggleRow id="out-of-stock" label="No disponible" hint='Aparece en tu carta marcado como "No disponible".' checked={form.outOfStock} onChange={outOfStock => update({ outOfStock })} />
                        </Section>
                    </div>

                    <div className="order-1 space-y-8 md:order-2">
                        <Section title="Información">
                            <div>
                                <label htmlFor="name" className={labelClass}>Nombre</label>
                                <input id="name" autoFocus={!product} value={form.name} onChange={e => update({ name: e.target.value })} required maxLength={120} className={`${inputClass} mt-1.5`} />
                            </div>
                            <div>
                                <label htmlFor="description" className={labelClass}>Descripción <span className="font-normal text-fg-subtle">(opcional)</span></label>
                                <textarea id="description" rows={4} value={form.description} onChange={e => update({ description: e.target.value })} placeholder="Ingredientes, tamaño, recomendaciones..." className={`${textareaClass} mt-1.5`} />
                            </div>
                        </Section>

                        <Section title="Precio y categoría">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label htmlFor="price" className={labelClass}>Precio <span className="font-normal text-fg-subtle">(opcional)</span></label>
                                    <div className="relative mt-1.5">
                                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-subtle">$</span>
                                        <input id="price" type="number" inputMode="numeric" min="0" step="1" value={form.price} onChange={e => update({ price: e.target.value })} placeholder="Sin precio" className={`${inputClass} pl-7 tabular-nums`} />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="unit" className={labelClass}>Unidad</label>
                                    <select id="unit" value={form.unit} onChange={e => update({ unit: e.target.value as 'unit' | 'kg' })} className={`${inputClass} mt-1.5`}>
                                        <option value="unit">Unidad</option>
                                        <option value="kg">Kg</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="category" className={labelClass}>Categoría <span className="font-normal text-fg-subtle">(opcional)</span></label>
                                <select id="category" value={form.categoryValue} onChange={e => update({ categoryValue: e.target.value })} className={`${inputClass} mt-1.5`}>
                                    <option value="">Sin categoría</option>
                                    {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                                    <option value={NEW_CATEGORY}>+ Nueva categoría…</option>
                                </select>
                                {form.categoryValue === NEW_CATEGORY && (
                                    <input
                                        autoFocus
                                        value={form.newCategory}
                                        onChange={e => update({ newCategory: e.target.value })}
                                        maxLength={60}
                                        placeholder="Nombre de la nueva categoría"
                                        aria-label="Nombre de la nueva categoría"
                                        className={`${inputClass} mt-2`}
                                    />
                                )}
                            </div>
                        </Section>

                        <section>
                            <button type="button" onClick={() => setShowInventory(!showInventory)} aria-expanded={showInventory} className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-fg-subtle hover:text-fg">
                                Inventario
                                <span aria-hidden="true">{showInventory ? '−' : '+'}</span>
                            </button>
                            {showInventory && (
                                <div className="mt-4 space-y-3">
                                    <ToggleRow id="track-stock" label="Manejar stock" hint="El stock solo se ve en tu panel, nunca en la carta." checked={form.trackStock} onChange={trackStock => update({ trackStock })} />
                                    {form.trackStock && (
                                        <input id="stock" type="number" inputMode="numeric" min="0" aria-label="Stock" value={form.stock} onChange={e => update({ stock: e.target.value })} placeholder="Cantidad disponible" className={`${inputClass} tabular-nums`} />
                                    )}
                                </div>
                            )}
                        </section>

                        {error && <p className={errorBoxClass}>{error}</p>}
                    </div>
                </div>

                <div className={`${modalFooterClass} items-center`}>
                    {product && onDelete && (
                        <button type="button" onClick={handleDelete} disabled={busy} className={`${buttonClass('ghost')} mr-auto !text-danger hover:!bg-danger/10`}>
                            <DeleteIcon />
                            {deleting ? 'Eliminando...' : 'Eliminar'}
                        </button>
                    )}
                    <span className="hidden text-xs text-fg-subtle sm:inline">Ctrl + Enter para guardar</span>
                    <button type="button" onClick={requestClose} disabled={busy} className={buttonClass('secondary')}>Cancelar</button>
                    <button type="submit" disabled={busy} className={buttonClass('primary')}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </Modal>
    );
};

export default ProductModal;

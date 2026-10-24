import React, { useState, useEffect } from 'react';
import { Product } from '../types.ts';
import { UploadIcon } from './Icons.tsx';
import Modal, { modalBodyClass, modalFooterClass } from './Modal.tsx';
import { buttonClass, errorBoxClass, hintClass, inputClass, labelClass, textareaClass } from './ui.ts';
import Switch from './Switch.tsx';

interface ProductModalProps {
    product: Product | null;
    categories: string[];
    onClose: () => void;
    onSave: (product: Product | Omit<Product, 'id' | 'created_at'>, imageFile: File | null) => Promise<void>;
}

const ProductModal: React.FC<ProductModalProps> = ({ product, categories, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        price: '',
        category: '',
        stock: '',
        unit: 'unit' as 'unit' | 'kg',
    });
    const [trackStock, setTrackStock] = useState(false);
    const [outOfStock, setOutOfStock] = useState(false);
    const [active, setActive] = useState(true);
    const [newCategory, setNewCategory] = useState('');
    const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (product) {
            setFormData({
                name: product.name,
                description: product.description,
                price: product.price.toString(),
                category: product.category,
                stock: product.stock.toString(),
                unit: product.unit || 'unit',
            });
            setTrackStock(product.track_stock);
            setOutOfStock(product.out_of_stock);
            setActive(product.active !== false);
            if (product.category && !categories.includes(product.category)) {
                 setIsAddingNewCategory(true);
                 setNewCategory(product.category);
            } else {
                 setIsAddingNewCategory(false);
                 setNewCategory('');
            }
            setImagePreview(product.image_url);
        } else {
            setFormData(prev => ({ ...prev, category: categories[0] || '', unit: 'unit' }));
        }
    }, [product, categories]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };
    
    const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === '--new--') {
            setIsAddingNewCategory(true);
            setFormData(prev => ({ ...prev, category: '' }));
        } else {
            setIsAddingNewCategory(false);
            setNewCategory('');
            setFormData(prev => ({ ...prev, category: value }));
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const finalCategory = (isAddingNewCategory ? newCategory.trim() : formData.category);

        if (!finalCategory) {
            setError('Selecciona o añade una categoría.');
            return;
        }
        
        const productData = {
            name: formData.name,
            description: formData.description,
            price: parseFloat(formData.price),
            category: finalCategory,
            // Without stock control the previous value is kept, so turning it back on restores it
            stock: trackStock ? parseInt(formData.stock, 10) : (product?.stock ?? 0),
            track_stock: trackStock,
            out_of_stock: outOfStock,
            active,
            unit: formData.unit,
            image_url: product?.image_url ?? '',
        };
        
        setSaving(true);
        setError(null);
        try {
            if (product) {
                await onSave({ ...productData, id: product.id, created_at: product.created_at }, imageFile);
            } else {
                await onSave(productData, imageFile);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
            setSaving(false);
        }
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, action: 'over' | 'leave' | 'drop') => {
        e.preventDefault();
        e.stopPropagation();
        if (action === 'over') setIsDragging(true);
        if (action === 'leave') setIsDragging(false);
        if (action === 'drop') {
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                const file = e.dataTransfer.files[0];
                if (file.type.startsWith('image/')) {
                    setImageFile(file);
                    setImagePreview(URL.createObjectURL(file));
                }
            }
        }
    };

    return (
        <Modal title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose} size="max-w-2xl">
            <form onSubmit={handleSubmit} onDrop={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
                <div className={`${modalBodyClass} grid grid-cols-1 gap-6 md:grid-cols-[13rem_1fr]`}>
                    <div className="space-y-2">
                        <span className={labelClass}>Imagen</span>
                        <div
                            onDragOver={(e) => handleDragEvents(e, 'over')}
                            onDragLeave={(e) => handleDragEvents(e, 'leave')}
                            onDrop={(e) => handleDragEvents(e, 'drop')}
                            className={`relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border border-dashed text-center transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-control bg-muted/40'}`}
                        >
                            {imagePreview ? (
                                <img src={imagePreview} alt="" className="absolute inset-0 h-full w-full object-cover" />
                            ) : (
                                <span className="text-fg-subtle [&_svg]:h-8 [&_svg]:w-8 [&_svg]:text-fg-subtle"><UploadIcon /></span>
                            )}
                            <label htmlFor="file-upload" className={`relative cursor-pointer rounded-md px-2 py-1 text-sm font-medium ${imagePreview ? 'bg-surface/90 text-fg shadow-soft' : 'text-primary'}`}>
                                {imagePreview ? 'Cambiar imagen' : 'Subir imagen'}
                                <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleImageChange} accept="image/png, image/jpeg, image/gif, image/webp"/>
                            </label>
                            {!imagePreview && <p className="relative px-4 text-xs text-fg-subtle">o arrastra un archivo<br />PNG, JPG, GIF o WEBP · 10 MB</p>}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label htmlFor="name" className={labelClass}>Nombre</label>
                            <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} required className={`${inputClass} mt-1.5`}/>
                        </div>
                        <div>
                            <label htmlFor="category-select" className={labelClass}>Categoría</label>
                            <select
                                id="category-select"
                                value={isAddingNewCategory ? '--new--' : formData.category}
                                onChange={handleCategoryChange}
                                className={`${inputClass} mt-1.5`}
                            >
                                <option value="" disabled>Selecciona una categoría</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                                <option value="--new--">Nueva categoría…</option>
                            </select>
                            {isAddingNewCategory && (
                                <input
                                    type="text"
                                    name="newCategory"
                                    id="newCategory"
                                    aria-label="Nombre de la nueva categoría"
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    placeholder="Nombre de la nueva categoría"
                                    required
                                    className={`${inputClass} mt-2`}
                                />
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label htmlFor="price" className={labelClass}>Precio</label>
                                <div className="relative mt-1.5">
                                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-subtle">$</span>
                                    <input type="number" name="price" id="price" value={formData.price} onChange={handleChange} required step="1" min="0" className={`${inputClass} pl-7 tabular-nums`}/>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="unit" className={labelClass}>Unidad</label>
                                <select name="unit" id="unit" value={formData.unit} onChange={handleChange} className={`${inputClass} mt-1.5`}>
                                    <option value="unit">Unidad</option>
                                    <option value="kg">Kg</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label htmlFor="description" className={labelClass}>Descripción</label>
                        <textarea id="description" name="description" rows={3} value={formData.description} onChange={handleChange} required className={`${textareaClass} mt-1.5`}></textarea>
                    </div>

                    <div className="divide-y divide-line rounded-xl border border-line md:col-span-2">
                        <div className="flex items-center justify-between gap-4 p-4">
                            <div>
                                <label htmlFor="active" className={labelClass}>Activo</label>
                                <p className={hintClass}>Si lo desactivas, deja de aparecer en la tienda.</p>
                            </div>
                            <Switch id="active" checked={active} onChange={setActive} />
                        </div>
                        <div className="p-4">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <label htmlFor="track-stock" className={labelClass}>Manejar stock</label>
                                    <p className={hintClass}>El stock solo se ve en tu panel, nunca en la tienda.</p>
                                </div>
                                <Switch id="track-stock" checked={trackStock} onChange={setTrackStock} />
                            </div>
                            {trackStock && (
                                <input type="number" name="stock" id="stock" aria-label="Stock" value={formData.stock} onChange={handleChange} required min="0" placeholder="Cantidad disponible" className={`${inputClass} mt-3 tabular-nums`}/>
                            )}
                        </div>
                        <div className="flex items-center justify-between gap-4 p-4">
                            <div>
                                <label htmlFor="out-of-stock" className={labelClass}>Sin stock</label>
                                <p className={hintClass}>La tienda lo muestra como "No disponible".</p>
                            </div>
                            <Switch id="out-of-stock" checked={outOfStock} onChange={setOutOfStock} />
                        </div>
                    </div>

                    {error && <p className={`${errorBoxClass} md:col-span-2`}>{error}</p>}
                </div>
                <div className={modalFooterClass}>
                    <button type="button" onClick={onClose} className={buttonClass('secondary')}>
                        Cancelar
                    </button>
                    <button type="submit" disabled={saving} className={buttonClass('primary')}>
                        {saving ? 'Guardando...' : 'Guardar producto'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default ProductModal;
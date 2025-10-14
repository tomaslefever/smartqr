import React, { useState, useEffect } from 'react';
import { Product } from '../types.ts';
import { CloseIcon, UploadIcon } from './Icons.tsx';

interface ProductModalProps {
    product: Product | null;
    categories: string[];
    onClose: () => void;
    onSave: (product: Product | Omit<Product, 'id' | 'created_at'>, imageFile: File | null) => void;
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
    const [newCategory, setNewCategory] = useState('');
    const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const finalCategory = (isAddingNewCategory ? newCategory.trim() : formData.category);

        if (!finalCategory) {
            alert('Por favor, selecciona o añade una categoría.');
            return;
        }
        
        const productData = {
            name: formData.name,
            description: formData.description,
            price: parseFloat(formData.price),
            category: finalCategory,
            stock: parseInt(formData.stock, 10),
            unit: formData.unit,
            image_url: product?.image_url ?? '',
        };
        
        if (product) {
            onSave({ ...productData, id: product.id, created_at: product.created_at }, imageFile);
        } else {
            onSave(productData, imageFile);
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
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4" onDrop={(e) => e.preventDefault()}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-full overflow-y-auto">
                <div className="p-6 border-b flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-brand-text">{product ? 'Editar Producto' : 'Añadir Nuevo Producto'}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 p-1 rounded-full hover:bg-gray-100 transition-colors">
                       <CloseIcon />
                    </button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column: Image */}
                        <div className="space-y-2">
                           <label className="block text-sm font-medium text-gray-700">Imagen del Producto</label>
                           <div 
                                onDragOver={(e) => handleDragEvents(e, 'over')}
                                onDragLeave={(e) => handleDragEvents(e, 'leave')}
                                onDrop={(e) => handleDragEvents(e, 'drop')}
                                className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md transition-colors ${isDragging ? 'border-brand-primary bg-brand-primary/10' : 'bg-white'}`}
                            >
                               <div className="space-y-1 text-center">
                                   {imagePreview ? (
                                       <img src={imagePreview} alt="Product Preview" className="mx-auto h-32 w-32 object-cover rounded-md"/>
                                   ) : (
                                      <UploadIcon />
                                   )}
                                   <div className="flex text-sm text-gray-600 justify-center">
                                       <label htmlFor="file-upload" className="relative cursor-pointer bg-transparent rounded-md font-medium text-brand-primary hover:text-brand-primary/80 focus-within:outline-none">
                                           <span>Sube un archivo</span>
                                           <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleImageChange} accept="image/png, image/jpeg, image/gif"/>
                                       </label>
                                       <p className="pl-1">o arrastra y suelta</p>
                                   </div>
                                   <p className="text-xs text-gray-500">PNG, JPG, GIF hasta 10MB</p>
                               </div>
                           </div>
                        </div>

                        {/* Right Column: Details */}
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre del Producto</label>
                                <input type="text" name="name" id="name" value={formData.name} onChange={handleChange} required className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"/>
                            </div>
                             <div>
                                <label htmlFor="category-select" className="block text-sm font-medium text-gray-700">Categoría</label>
                                <select 
                                    id="category-select" 
                                    value={isAddingNewCategory ? '--new--' : formData.category} 
                                    onChange={handleCategoryChange} 
                                    className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"
                                >
                                    <option value="" disabled>Selecciona una categoría</option>
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="--new--">Añadir Nueva Categoría...</option>
                                </select>
                                {isAddingNewCategory && (
                                    <input 
                                        type="text" 
                                        name="newCategory" 
                                        id="newCategory" 
                                        value={newCategory} 
                                        onChange={(e) => setNewCategory(e.target.value)} 
                                        placeholder="Nombre de la nueva categoría"
                                        required 
                                        className="mt-2 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"
                                    />
                                )}
                            </div>
                             <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label htmlFor="price" className="block text-sm font-medium text-gray-700">Precio</label>
                                    <input type="number" name="price" id="price" value={formData.price} onChange={handleChange} required step="0.01" min="0" className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"/>
                                </div>
                                <div>
                                    <label htmlFor="unit" className="block text-sm font-medium text-gray-700">Unidad</label>
                                    <select name="unit" id="unit" value={formData.unit} onChange={handleChange} className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm">
                                        <option value="unit">Unidad</option>
                                        <option value="kg">Kg</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="stock" className="block text-sm font-medium text-gray-700">Stock</label>
                                <input type="number" name="stock" id="stock" value={formData.stock} onChange={handleChange} required min="0" className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"/>
                            </div>
                        </div>
                        
                        {/* Full Width Description */}
                        <div className="md:col-span-2">
                           <label htmlFor="description" className="block text-sm font-medium text-gray-700">Descripción</label>
                           <textarea id="description" name="description" rows={3} value={formData.description} onChange={handleChange} required className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"></textarea>
                        </div>

                    </div>
                    <div className="p-6 bg-gray-50 flex justify-end space-x-4">
                        <button type="button" onClick={onClose} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary/50 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" className="bg-brand-primary text-white py-2 px-4 rounded-md shadow-sm text-sm font-medium hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-primary transition-colors">
                            Guardar Producto
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProductModal;
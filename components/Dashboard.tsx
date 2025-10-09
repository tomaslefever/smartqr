import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import ProductModal from './ProductModal.tsx';
import QRCode from './QRCode.tsx';
import { EditIcon, DeleteIcon, PlusIcon, PackageIcon, DollarSignIcon, BarChartIcon, ExternalLinkIcon } from './Icons.tsx';

// Fix: Import chart components from 'recharts' instead of accessing them from the window object.
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-white p-6 rounded-lg shadow-md flex items-center space-x-4">
        <div className="bg-brand-primary/10 text-brand-primary p-3 rounded-full">{icon}</div>
        <div>
            <p className="text-sm text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-brand-text">{value}</p>
        </div>
    </div>
);

const ProductListItem: React.FC<{ product: Product; onEdit: (product: Product) => void; onDelete: (id: number) => void; }> = ({ product, onEdit, onDelete }) => (
    <tr className="border-b border-gray-200 hover:bg-gray-50">
        <td className="p-4 flex items-center">
            <img src={product.imageUrl} alt={product.name} className="w-12 h-12 rounded-md object-cover mr-4"/>
            <div>
                <p className="font-semibold text-brand-text">{product.name}</p>
                <p className="text-sm text-gray-500">{product.category}</p>
            </div>
        </td>
        <td className="p-4 text-gray-600">${product.price.toFixed(2)}</td>
        <td className="p-4 text-gray-600">{product.stock}</td>
        <td className="p-4 text-gray-600">{new Date(product.createdAt).toLocaleDateString()}</td>
        <td className="p-4">
            <div className="flex space-x-2">
                <button onClick={() => onEdit(product)} className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-100 transition-colors">
                    <EditIcon />
                </button>
                <button onClick={() => onDelete(product.id)} className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-100 transition-colors">
                    <DeleteIcon />
                </button>
            </div>
        </td>
    </tr>
);

const Dashboard: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const data = await supabaseService.getProducts();
            setProducts(data);
        } catch (error) {
            console.error("Failed to fetch products:", error);
            // Here you could add user-facing error handling
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    const handleOpenModal = (product: Product | null = null) => {
        setEditingProduct(product);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingProduct(null);
    };

    const handleSaveProduct = async (product: Product | Omit<Product, 'id' | 'createdAt'>, imageFile: File | null) => {
        let imageUrl = 'imageUrl' in product ? product.imageUrl : '';

        if (imageFile) {
            imageUrl = await supabaseService.uploadImage(imageFile);
        }
        
        const productData = { ...product, imageUrl };

        if ('id' in productData) {
            await supabaseService.updateProduct(productData.id, productData);
        } else {
            await supabaseService.addProduct(productData as Omit<Product, 'id' | 'createdAt'>);
        }
        fetchProducts();
        handleCloseModal();
    };
    
    const handleDeleteProduct = async (id: number) => {
        if (window.confirm('¿Estás seguro de que quieres eliminar este producto?')) {
            await supabaseService.deleteProduct(id);
            fetchProducts();
        }
    };

    const stats = useMemo(() => {
        const totalProducts = products.length;
        const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
        const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
        return {
            totalProducts,
            totalStock,
            totalValue
        };
    }, [products]);
    
    const categoryData = useMemo(() => {
        const counts: { [key: string]: number } = {};
        products.forEach(p => {
            counts[p.category] = (counts[p.category] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [products]);

    const storeUrl = `${window.location.origin}${window.location.pathname}#/store`;

    return (
        <div className="min-h-screen bg-brand-light">
            <header className="bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-brand-primary">Panel del Mercado</h1>
                    <div className="flex items-center space-x-4">
                        <Link to="/store" target="_blank" rel="noopener noreferrer" className="bg-white text-brand-primary border border-brand-primary px-4 py-2 rounded-lg shadow-sm hover:bg-brand-primary/5 transition-colors flex items-center space-x-2">
                            <ExternalLinkIcon />
                            <span>Ver Tienda</span>
                        </Link>
                        <button onClick={() => handleOpenModal()} className="bg-brand-primary text-white px-4 py-2 rounded-lg shadow-md hover:bg-brand-primary/90 transition-colors flex items-center space-x-2">
                            <PlusIcon />
                            <span>Añadir Producto</span>
                        </button>
                    </div>
                </div>
            </header>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard title="Productos Totales" value={stats.totalProducts.toString()} icon={<PackageIcon />} />
                    <StatCard title="Artículos en Stock" value={stats.totalStock.toString()} icon={<BarChartIcon />} />
                    <StatCard title="Valor Total del Inventario" value={`$${stats.totalValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<DollarSignIcon />} />
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                    <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-xl font-semibold text-brand-text mb-4">Inventario de Productos</h2>
                         <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200">
                                        <th className="p-4 font-semibold text-gray-600">Producto</th>
                                        <th className="p-4 font-semibold text-gray-600">Precio</th>
                                        <th className="p-4 font-semibold text-gray-600">Stock</th>
                                        <th className="p-4 font-semibold text-gray-600">Agregado el</th>
                                        <th className="p-4 font-semibold text-gray-600">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={5} className="text-center p-8 text-gray-500">Cargando productos...</td></tr>
                                    ) : (
                                        products.map(p => <ProductListItem key={p.id} product={p} onEdit={() => handleOpenModal(p)} onDelete={handleDeleteProduct} />)
                                    )}
                                </tbody>
                            </table>
                         </div>
                    </div>
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-lg shadow-md">
                           <h2 className="text-xl font-semibold text-brand-text mb-4">Código QR de la Tienda</h2>
                            <div className="flex flex-col items-center">
                                <QRCode url={storeUrl} />
                                <p className="text-center mt-4 text-sm text-gray-600">Escanea este código para ver la tienda pública.</p>
                                <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="mt-2 text-brand-primary hover:underline text-xs break-all">
                                    {storeUrl}
                                </a>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-md">
                            <h2 className="text-xl font-semibold text-brand-text mb-4">Productos por Categoría</h2>
                            <div style={{ width: '100%', height: 300 }}>
                                <ResponsiveContainer>
                                    <BarChart data={categoryData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" />
                                        <YAxis />
                                        <Tooltip />
                                        <Bar dataKey="value" fill="#4A7C59" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>

                {isModalOpen && <ProductModal product={editingProduct} onClose={handleCloseModal} onSave={handleSaveProduct} />}
            </main>
        </div>
    );
};

export default Dashboard;
import React, { useState, useEffect, useMemo } from 'react';
import { Product } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { SearchIcon } from './Icons.tsx';

const ProductCard: React.FC<{ product: Product }> = ({ product }) => (
    <div className="bg-white rounded-xl shadow-lg overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 group">
        <div className="overflow-hidden">
             <img src={product.imageUrl} alt={product.name} className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
        <div className="p-6">
            <p className="text-sm text-brand-primary font-semibold">{product.category}</p>
            <h3 className="text-xl font-bold text-brand-text mt-1 truncate">{product.name}</h3>
            <p className="text-gray-600 mt-2 text-sm h-10 overflow-hidden">{product.description}</p>
            <div className="mt-4 flex justify-between items-center">
                <p className="text-2xl font-bold text-brand-primary">${product.price.toFixed(2)}</p>
                <p className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{product.stock} en stock</p>
            </div>
        </div>
    </div>
);


const Store: React.FC = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            try {
                const data = await supabaseService.getProducts();
                setProducts(data);
            } catch (error) {
                console.error("Failed to fetch products for store:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchProducts();
    }, []);

    const categories = useMemo(() => {
        const allCategories = products.map(p => p.category);
        return ['Todos', ...Array.from(new Set(allCategories))];
    }, [products]);

    const filteredProducts = useMemo(() => {
        return products
            .filter(p => selectedCategory === 'Todos' || p.category === selectedCategory)
            .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [products, searchTerm, selectedCategory]);

    return (
        <div className="min-h-screen bg-brand-light">
            <header className="bg-white shadow-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
                    <h1 className="text-4xl font-bold text-brand-primary">Bienvenido a Nuestro Mercado Local</h1>
                    <p className="mt-2 text-lg text-brand-text opacity-90">Fresco, local y hecho con amor.</p>
                </div>
            </header>
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                 {/* Search and Filter Controls */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-8 sticky top-[110px] z-10 flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative flex-grow w-full sm:w-auto">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Buscar productos..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary transition"
                        />
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2 overflow-x-auto pb-2">
                        {categories.map(category => (
                            <button
                                key={category}
                                onClick={() => setSelectedCategory(category)}
                                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
                                    selectedCategory === category
                                        ? 'bg-brand-primary text-white shadow'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="text-center text-gray-600 text-xl py-12">Cargando productos frescos...</div>
                ) : filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                        {filteredProducts.map(product => (
                            <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                ) : (
                     <div className="text-center text-gray-500 py-12">
                        <h2 className="text-2xl font-semibold">No se encontraron productos</h2>
                        <p className="mt-2">Intenta cambiar los filtros o el término de búsqueda.</p>
                    </div>
                )}
                 
            </main>
            <footer className="text-center py-8 text-gray-500 bg-brand-light">
                <p>&copy; {new Date().getFullYear()} Mercado Local. Todos los derechos reservados.</p>
            </footer>
        </div>
    );
};

export default Store;
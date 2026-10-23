import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Product, Profile } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { SearchIcon, PhoneIcon, MailIcon, LocationMarkerIcon } from './Icons.tsx';
import ProductDetailModal from './ProductDetailModal.tsx';

const ProductCard: React.FC<{ product: Product; onClick: () => void; }> = ({ product, onClick }) => (
    <button onClick={onClick} className={`bg-white rounded-xl shadow-lg overflow-hidden transform hover:-translate-y-1 transition-transform duration-300 group text-left w-full ${product.out_of_stock ? 'opacity-60' : ''}`}>
        <div className="overflow-hidden">
             <img src={product.image_url} alt={product.name} className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300" />
        </div>
        <div className="p-6">
            <p className="text-sm text-brand-primary font-semibold">{product.category}</p>
            <h3 className="text-xl font-bold text-brand-text mt-1 truncate">{product.name}</h3>
            <p className="text-gray-600 mt-2 text-sm h-10 overflow-hidden">{product.description}</p>
            <div className="mt-4 flex justify-between items-center">
                <p className="text-2xl font-bold text-brand-primary">${product.price.toLocaleString('es-CL')}{product.unit === 'kg' ? <span className="text-base font-normal text-gray-600">/kg</span> : ''}</p>
                {product.out_of_stock && <p className="text-sm font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">No disponible</p>}
            </div>
        </div>
    </button>
);


const Store: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const [products, setProducts] = useState<Product[]>([]);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const isClickScrolling = useRef(false);
    const categoryBarRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (!userId) {
                 setLoading(false);
                 return;
            };
            setLoading(true);
            try {
                const [productsData, profileData] = await Promise.all([
                    supabaseService.getProductsByUserId(userId),
                    supabaseService.getPublicProfileByUserId(userId)
                ]);
                setProducts(productsData);
                setProfile(profileData);
            } catch (error) {
                console.error("Failed to fetch store data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [userId]);
    
    // Scroll spy effect
    useEffect(() => {
        const handleScroll = () => {
            if (isClickScrolling.current) return;

            const offset = 120; // sticky header height + a little extra
            let activeCategory = 'Todos';
            
            // Find which section is in view
            const categoriesInView = Object.keys(sectionRefs.current).reverse();
            for (const category of categoriesInView) {
                const section = sectionRefs.current[category];
                if (section && section.getBoundingClientRect().top <= offset) {
                    activeCategory = category;
                    break;
                }
            }
            
            if (window.scrollY < 200) {
                 activeCategory = 'Todos';
            }

            setSelectedCategory(activeCategory);
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [products]); // Re-run if products change, as sections might change
    
    // Effect to scroll category bar to show active category
    useEffect(() => {
        const activeButton = categoryBarRef.current?.querySelector(`[data-category="${selectedCategory}"]`);
        if (activeButton) {
            activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [selectedCategory]);

    const categories = useMemo(() => {
        const allCategories = products.map(p => p.category);
        return ['Todos', ...Array.from(new Set(allCategories))];
    }, [products]);

    const productsByCategory = useMemo(() => {
        const grouped: { [key: string]: Product[] } = {};
        const categoriesWithProducts = categories.filter(c => c !== 'Todos');

        categoriesWithProducts.forEach(category => {
            const filtered = products
                .filter(p => p.category === category)
                .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
            
            if (filtered.length > 0) {
                grouped[category] = filtered;
            }
        });
        return grouped;
    }, [products, searchTerm, categories]);
    
    const handleCategoryClick = (category: string) => {
        isClickScrolling.current = true;
        setSelectedCategory(category);
        
        if (category === 'Todos') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            const section = sectionRefs.current[category];
            if (section) {
                const y = section.getBoundingClientRect().top + window.pageYOffset - 110; // offset for sticky header
                window.scrollTo({top: y, behavior: 'smooth'});
            }
        }
        
        // Let scroll listener work again after scroll animation
        setTimeout(() => {
            isClickScrolling.current = false;
        }, 1000); 
    };

    const displayCategories = Object.keys(productsByCategory);

    return (
        <div className="min-h-screen bg-brand-light flex flex-col">
            <header className="bg-white shadow-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
                    <h1 className="text-4xl font-bold text-brand-primary">{profile?.business_name || 'Bienvenido a la Tienda'}</h1>
                    <p className="mt-2 text-lg text-brand-text opacity-90">Productos de calidad, a tu alcance.</p>
                </div>
            </header>
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-grow w-full">
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
                    <div ref={categoryBarRef} className="no-scrollbar flex-shrink-0 flex items-center gap-2 overflow-x-auto pb-2 w-full sm:w-auto">
                        {categories.map(category => (
                            <button
                                key={category}
                                data-category={category}
                                onClick={() => handleCategoryClick(category)}
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
                ) : !userId || products.length === 0 && searchTerm === '' ? (
                     <div className="text-center text-gray-500 py-12">
                        <h2 className="text-2xl font-semibold">Tienda no encontrada o vacía</h2>
                        <p className="mt-2">Esta tienda puede no existir o aún no tener productos.</p>
                    </div>
                ) : displayCategories.length > 0 ? (
                    <div className="space-y-12">
                        {displayCategories.map(category => (
                            <section 
                                key={category} 
                                // Fix: The ref callback must not return a value. Switched to a block body to ensure a void return type.
                                ref={el => { sectionRefs.current[category] = el; }}
                            >
                                <h2 className="text-3xl font-bold text-brand-text mb-6 border-b-2 border-brand-primary/20 pb-2">{category}</h2>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                                    {productsByCategory[category].map(product => (
                                        <ProductCard key={product.id} product={product} onClick={() => setSelectedProduct(product)} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                ) : (
                     <div className="text-center text-gray-500 py-12">
                        <h2 className="text-2xl font-semibold">No se encontraron productos</h2>
                        <p className="mt-2">Intenta cambiar los filtros o el término de búsqueda.</p>
                    </div>
                )}
                 
            </main>
            <footer className="bg-white border-t mt-12">
                <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-brand-text">
                    {profile && (profile.business_name || profile.address || profile.phone || profile.email || profile.opening_hours) ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                            <div className="flex flex-col items-center md:items-start">
                                <h3 className="text-xl font-bold text-brand-primary">{profile.business_name || 'Nuestra Tienda'}</h3>
                                {profile.address && 
                                    <div className="mt-4 flex items-center text-gray-600">
                                        <LocationMarkerIcon />
                                        <p className="ml-2">{profile.address}</p>
                                    </div>
                                }
                            </div>
                            <div className="flex flex-col items-center md:items-start">
                                <h3 className="text-xl font-bold text-brand-primary">Contacto</h3>
                                {profile.phone && 
                                    <div className="mt-4 flex items-center text-gray-600">
                                        <PhoneIcon />
                                        <p className="ml-2">{profile.phone}</p>
                                    </div>
                                }
                                {profile.email && 
                                    <div className="mt-2 flex items-center text-gray-600">
                                        <MailIcon />
                                        <p className="ml-2">{profile.email}</p>
                                    </div>
                                }
                            </div>
                            <div className="flex flex-col items-center md:items-start">
                                <h3 className="text-xl font-bold text-brand-primary">Horarios</h3>
                                {profile.opening_hours ? (
                                    <pre className="mt-4 text-gray-600 font-sans whitespace-pre-wrap text-center md:text-left">{profile.opening_hours}</pre>
                                ) : <p className="mt-4 text-gray-600">Consulte nuestros horarios.</p>}
                            </div>
                        </div>
                    ) : null}
                    <div className="mt-12 border-t border-gray-200 pt-8 text-center text-gray-500">
                       <p>&copy; {new Date().getFullYear()} SmartQR. Todos los derechos reservados.</p>
                    </div>
                </div>
            </footer>

            {selectedProduct && (
                <ProductDetailModal 
                    product={selectedProduct} 
                    onClose={() => setSelectedProduct(null)} 
                />
            )}
        </div>
    );
};

export default Store;
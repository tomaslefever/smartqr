import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Product, Profile, Theme } from '../types.ts';
import * as supabaseService from '../services/supabaseService.ts';
import { SearchIcon, PhoneIcon, MailIcon, LocationMarkerIcon } from './Icons.tsx';
import ProductDetailModal from './ProductDetailModal.tsx';
import { normalizeThemeStyle, themeStyleVars } from './storeTheme.ts';

// Horizontal card: name, description and price on the left and a square image on the right.
// Only the name is always there: description, price (when above 0) and image show only if the product
// has them, and without an image (or if it fails to load) the text uses the full width.
export const ProductCard: React.FC<{ product: Product; onClick: () => void; }> = ({ product, onClick }) => {
    const [imageFailed, setImageFailed] = useState(false);
    const showImage = Boolean(product.image_url) && !imageFailed;

    return (
    <button onClick={onClick} className={`group flex w-full items-stretch gap-4 overflow-hidden rounded-xl bg-[color:var(--store-card)] p-4 text-left shadow-md transition duration-300 hover:-translate-y-0.5 hover:shadow-lg ${product.out_of_stock ? 'opacity-60' : ''}`}>
        <div className="flex min-w-0 flex-1 flex-col">
            <h3 className="text-base font-bold leading-snug text-[color:var(--store-text)] line-clamp-2 sm:text-lg">{product.name}</h3>
            {product.description && <p className="mt-1 text-sm text-[color:var(--store-muted)] line-clamp-2">{product.description}</p>}
            {(product.price > 0 || product.out_of_stock) && (
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                    {product.price > 0 && <p className="text-lg font-bold text-[color:var(--store-accent)]">${product.price.toLocaleString('es-CL')}{product.unit === 'kg' ? <span className="text-sm font-normal text-[color:var(--store-muted)]">/kg</span> : ''}</p>}
                    {product.out_of_stock && <p className="text-xs font-medium text-[color:var(--store-muted)] bg-[color:var(--store-subtle)] px-2 py-0.5 rounded-full">No disponible</p>}
                </div>
            )}
        </div>
        {showImage && (
            <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-28">
                <img src={product.image_url} alt={product.name} onError={() => setImageFailed(true)} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            </div>
        )}
    </button>
    );
};


const Store: React.FC = () => {
    const { userId } = useParams<{ userId: string }>();
    const [products, setProducts] = useState<Product[]>([]);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [theme, setTheme] = useState<Theme | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('Todos');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
    const isClickScrolling = useRef(false);
    const categoryBarRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLElement>(null);
    const stickyBarRef = useRef<HTMLDivElement>(null);
    // The header is only sticky from the sm breakpoint up; the search bar sticks right below it
    const [stickyBarTop, setStickyBarTop] = useState(0);

    const stickyHeaderHeight = () => {
        const header = headerRef.current;
        return header && getComputedStyle(header).position === 'sticky' ? header.offsetHeight : 0;
    };
    // Space covered at the top of the viewport by the sticky header and search bar
    const stickyOffset = () => stickyHeaderHeight() + (stickyBarRef.current?.offsetHeight ?? 0);

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
                // Fetched separately (not embedded) so the store still loads if the themes table is missing
                const themeData = profileData?.theme_id ? await supabaseService.getTheme(profileData.theme_id) : null;
                // Rows from before supabase/products-active.sql have no `active` value and count as active
                setProducts(productsData.filter(p => p.active !== false));
                setProfile(profileData);
                setTheme(themeData);
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

            const offset = stickyOffset() + 16;
            let activeCategory = 'Todos';
            
            // Find which section is in view
            const categoriesInView = Object.keys(sectionRefs.current).reverse();
            for (const category of categoriesInView) {
                const section = sectionRefs.current[category];
                if (section && section.getBoundingClientRect().top <= offset) {
                    // The uncategorized group has no chip of its own
                    activeCategory = category || 'Todos';
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
    
    // Keep the search bar right below the header, whose height depends on the screen and business name
    useEffect(() => {
        const measure = () => setStickyBarTop(stickyHeaderHeight());
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, [loading, profile]);

    // Effect to scroll category bar to show active category
    useEffect(() => {
        const activeButton = categoryBarRef.current?.querySelector(`[data-category="${selectedCategory}"]`);
        if (activeButton) {
            activeButton.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    }, [selectedCategory]);

    // Category is optional: products without one have no chip and are listed first, without a title
    const categories = useMemo(() => {
        const allCategories = products.map(p => p.category).filter(Boolean);
        return ['Todos', ...Array.from(new Set(allCategories))];
    }, [products]);

    const productsByCategory = useMemo(() => {
        const grouped: { [key: string]: Product[] } = {};
        const categoriesWithProducts = ['', ...categories.filter(c => c !== 'Todos')];

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
                const y = section.getBoundingClientRect().top + window.pageYOffset - stickyOffset() - 8;
                window.scrollTo({top: y, behavior: 'smooth'});
            }
        }
        
        // Let scroll listener work again after scroll animation
        setTimeout(() => {
            isClickScrolling.current = false;
        }, 1000); 
    };

    const displayCategories = Object.keys(productsByCategory);
    const themeStyle = useMemo(() => normalizeThemeStyle(theme), [theme]);

    // Avoid flashing the default style before the business's theme is known
    if (loading) {
        return <div className="min-h-screen flex items-center justify-center text-gray-500">Cargando...</div>;
    }

    return (
        <div className="min-h-screen flex flex-col text-[color:var(--store-text)]" style={themeStyleVars(themeStyle)}>
            <header ref={headerRef} className="bg-[color:var(--store-card)] shadow-md sm:sticky sm:top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
                    <h1 className="text-3xl font-bold text-[color:var(--store-accent)] sm:text-4xl">{profile?.business_name || 'Bienvenido a la Tienda'}</h1>
                    <p className="mt-2 text-lg text-[color:var(--store-muted)]">Productos de calidad, a tu alcance.</p>
                </div>
            </header>
            
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 sm:pt-8 flex-grow w-full">
                {/* Edge to edge on mobile, where it is the only sticky element */}
                <div ref={stickyBarRef} style={{ top: stickyBarTop }} className="sticky z-10 -mx-4 mb-6 flex flex-col items-center gap-3 bg-[color:var(--store-card)] px-4 py-3 shadow-md sm:mx-0 sm:mb-8 sm:flex-row sm:gap-4 sm:rounded-lg sm:p-4 sm:shadow-sm">
                    <div className="relative flex-grow w-full sm:w-auto">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                            <SearchIcon />
                        </span>
                        <input
                            type="text"
                            placeholder="Buscar productos..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-transparent text-[color:var(--store-text)] placeholder:text-[color:var(--store-muted)] border border-[color:var(--store-border)] rounded-full focus:outline-none focus:ring-2 focus:ring-[color:var(--store-accent-soft)] focus:border-[color:var(--store-accent)] transition"
                        />
                    </div>
                    <div ref={categoryBarRef} className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] flex-shrink-0 items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:px-0 sm:pb-2">
                        {categories.map(category => (
                            <button
                                key={category}
                                data-category={category}
                                onClick={() => handleCategoryClick(category)}
                                className={`px-4 py-2 text-sm font-medium rounded-full transition-colors whitespace-nowrap ${
                                    selectedCategory === category
                                        ? 'bg-[color:var(--store-accent)] text-[color:var(--store-on-accent)] shadow'
                                        : 'bg-[color:var(--store-subtle)] text-[color:var(--store-text)] hover:bg-[color:var(--store-border)]'
                                }`}
                            >
                                {category}
                            </button>
                        ))}
                    </div>
                </div>

                {!userId || products.length === 0 && searchTerm === '' ? (
                     <div className="text-center text-[color:var(--store-muted)] py-12">
                        <h2 className="text-2xl font-semibold">Tienda no encontrada o vacía</h2>
                        <p className="mt-2">Esta tienda puede no existir o aún no tener productos.</p>
                    </div>
                ) : displayCategories.length > 0 ? (
                    <div className="space-y-10">
                        {displayCategories.map(category => (
                            <section 
                                key={category} 
                                // Fix: The ref callback must not return a value. Switched to a block body to ensure a void return type.
                                ref={el => { sectionRefs.current[category] = el; }}
                            >
                                {category && <h2 className="text-2xl font-bold text-[color:var(--store-text)] mb-4 border-b-2 border-[color:var(--store-accent-soft)] pb-2">{category}</h2>}
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                    {productsByCategory[category].map(product => (
                                        <ProductCard key={product.id} product={product} onClick={() => setSelectedProduct(product)} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                ) : (
                     <div className="text-center text-[color:var(--store-muted)] py-12">
                        <h2 className="text-2xl font-semibold">No se encontraron productos</h2>
                        <p className="mt-2">Intenta cambiar los filtros o el término de búsqueda.</p>
                    </div>
                )}
                 
            </main>
            <footer className="bg-[color:var(--store-card)] border-t border-[color:var(--store-border)] mt-12">
                <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 text-[color:var(--store-text)]">
                    {profile && (profile.business_name || profile.address || profile.phone || profile.email || profile.opening_hours) ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
                            <div className="flex flex-col items-center md:items-start">
                                <h3 className="text-xl font-bold text-[color:var(--store-accent)]">{profile.business_name || 'Nuestra Tienda'}</h3>
                                {profile.address && 
                                    <div className="mt-4 flex items-center text-[color:var(--store-muted)]">
                                        <LocationMarkerIcon />
                                        <p className="ml-2">{profile.address}</p>
                                    </div>
                                }
                            </div>
                            <div className="flex flex-col items-center md:items-start">
                                <h3 className="text-xl font-bold text-[color:var(--store-accent)]">Contacto</h3>
                                {profile.phone && 
                                    <div className="mt-4 flex items-center text-[color:var(--store-muted)]">
                                        <PhoneIcon />
                                        <p className="ml-2">{profile.phone}</p>
                                    </div>
                                }
                                {profile.email && 
                                    <div className="mt-2 flex items-center text-[color:var(--store-muted)]">
                                        <MailIcon />
                                        <p className="ml-2">{profile.email}</p>
                                    </div>
                                }
                            </div>
                            <div className="flex flex-col items-center md:items-start">
                                <h3 className="text-xl font-bold text-[color:var(--store-accent)]">Horarios</h3>
                                {profile.opening_hours ? (
                                    <pre className="mt-4 text-[color:var(--store-muted)] font-sans whitespace-pre-wrap text-center md:text-left">{profile.opening_hours}</pre>
                                ) : <p className="mt-4 text-[color:var(--store-muted)]">Consulte nuestros horarios.</p>}
                            </div>
                        </div>
                    ) : null}
                    <div className="mt-12 border-t border-[color:var(--store-border)] pt-8 text-center text-[color:var(--store-muted)]">
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
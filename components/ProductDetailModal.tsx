import React, { useEffect, useState } from 'react';
import { Product } from '../types.ts';
import { CloseIcon } from './Icons.tsx';
import BlurText from './reactbits/BlurText.tsx';
import { formatQuantity } from './storeOrder.ts';

interface ProductDetailModalProps {
    product: Product;
    onClose: () => void;
    // Present only when the store takes orders: adds (1) or removes (-1) one step of the product
    onChangeQuantity?: (delta: number) => void;
    orderQuantity?: number;
}

const stepButtonClass =
    'flex h-10 w-10 items-center justify-center rounded-full bg-[color:var(--store-subtle)] text-xl font-semibold leading-none text-[color:var(--store-text)] ' +
    'transition-colors hover:bg-[color:var(--store-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--store-accent)]';

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose, onChangeQuantity, orderQuantity = 0 }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);
    // Without an image the dialog shows only the details, in a narrower box
    const showImage = Boolean(product.image_url) && !imageFailed;

    useEffect(() => {
        // Trigger the animation shortly after mounting
        const timer = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(timer);
    }, []);

    const handleClose = () => {
        setIsVisible(false);
        // Allow animation to finish before calling parent's onClose
        setTimeout(onClose, 300); 
    };

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4 transition-opacity duration-300"
            style={{ opacity: isVisible ? 1 : 0 }}
            onClick={handleClose}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-title"
        >
            <div 
                className={`bg-[color:var(--store-card)] rounded-xl shadow-2xl w-full ${showImage ? 'max-w-4xl' : 'max-w-xl'} max-h-[90vh] flex flex-col md:flex-row overflow-hidden transition-all duration-300 ease-out`}
                style={{ transform: isVisible ? 'scale(1)' : 'scale(0.95)', opacity: isVisible ? 1 : 0 }}
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing the modal
            >
                {showImage && (
                    <div className="w-full md:w-1/2 h-64 md:h-auto">
                        <img src={product.image_url} alt={product.name} onError={() => setImageFailed(true)} className="w-full h-full object-cover" />
                    </div>
                )}

                <div className={`w-full ${showImage ? 'md:w-1/2' : ''} p-8 flex flex-col relative overflow-y-auto`}>
                    <button 
                        onClick={handleClose} 
                        className="absolute top-4 right-4 text-[color:var(--store-muted)] hover:text-[color:var(--store-text)] p-2 rounded-full hover:bg-[color:var(--store-subtle)] transition-colors"
                        aria-label="Cerrar modal"
                    >
                       <CloseIcon />
                    </button>
                    
                    {product.category && <p className="text-sm text-[color:var(--store-accent)] font-semibold mb-2">{product.category}</p>}
                    <h2 id="product-title" className="text-3xl lg:text-4xl font-bold text-[color:var(--store-text)] mb-4 pr-10">
                        <BlurText text={product.name} delay={70} distance={16} trigger="load" />
                    </h2>
                    
                    {product.description && <p className="text-[color:var(--store-muted)] mb-6 flex-grow whitespace-pre-line">{product.description}</p>}

                    {(product.price > 0 || product.out_of_stock) && (
                        <div className="mt-auto flex justify-between items-center gap-4 pt-4 border-t border-[color:var(--store-border)]">
                            {product.price > 0 && <p className="text-3xl font-bold text-[color:var(--store-accent)]">${product.price.toLocaleString('es-CL')}{product.unit === 'kg' ? <span className="text-xl font-normal text-[color:var(--store-muted)]">/kg</span> : ''}</p>}
                            {product.out_of_stock && <p className="text-md font-medium text-[color:var(--store-muted)] bg-[color:var(--store-subtle)] px-3 py-1 rounded-full">No disponible</p>}
                        </div>
                    )}

                    {onChangeQuantity && !product.out_of_stock && (
                        <div className="mt-6">
                            {orderQuantity > 0 ? (
                                <div className="flex items-center justify-between gap-4 rounded-full bg-[color:var(--store-accent-soft)] p-1.5 pl-5">
                                    <span className="text-sm font-semibold text-[color:var(--store-text)]">En tu pedido</span>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => onChangeQuantity(-1)} className={stepButtonClass} aria-label="Quitar uno">−</button>
                                        <span className="min-w-[3.5rem] text-center font-bold tabular-nums text-[color:var(--store-text)]" aria-live="polite">{formatQuantity(product, orderQuantity)}</span>
                                        <button type="button" onClick={() => onChangeQuantity(1)} className={stepButtonClass} aria-label="Agregar uno">+</button>
                                    </div>
                                </div>
                            ) : (
                                <button type="button" onClick={() => onChangeQuantity(1)} className="w-full rounded-full bg-[color:var(--store-accent)] px-5 py-3 font-semibold text-[color:var(--store-on-accent)] shadow transition-transform hover:-translate-y-0.5">
                                    Agregar al pedido
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProductDetailModal;
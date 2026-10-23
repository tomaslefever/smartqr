import React, { useEffect, useState } from 'react';
import { Product } from '../types.ts';
import { CloseIcon } from './Icons.tsx';

interface ProductDetailModalProps {
    product: Product;
    onClose: () => void;
}

const ProductDetailModal: React.FC<ProductDetailModalProps> = ({ product, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);

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
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden transition-all duration-300 ease-out"
                style={{ transform: isVisible ? 'scale(1)' : 'scale(0.95)', opacity: isVisible ? 1 : 0 }}
                onClick={(e) => e.stopPropagation()} // Prevent clicks inside from closing the modal
            >
                {/* Image Section */}
                <div className="w-full md:w-1/2 h-64 md:h-auto">
                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                </div>
                
                {/* Details Section */}
                <div className="w-full md:w-1/2 p-8 flex flex-col relative overflow-y-auto">
                    <button 
                        onClick={handleClose} 
                        className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-colors"
                        aria-label="Cerrar modal"
                    >
                       <CloseIcon />
                    </button>
                    
                    <p className="text-sm text-brand-primary font-semibold mb-2">{product.category}</p>
                    <h2 id="product-title" className="text-3xl lg:text-4xl font-bold text-brand-text mb-4">{product.name}</h2>
                    
                    <p className="text-gray-600 mb-6 flex-grow">{product.description}</p>
                    
                    <div className="mt-auto flex justify-between items-center pt-4 border-t">
                        <p className="text-3xl font-bold text-brand-primary">${product.price.toLocaleString('es-CL')}{product.unit === 'kg' ? <span className="text-xl font-normal text-gray-600">/kg</span> : ''}</p>
                        {product.out_of_stock && <p className="text-md font-medium text-gray-600 bg-gray-100 px-3 py-1 rounded-full">No disponible</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductDetailModal;
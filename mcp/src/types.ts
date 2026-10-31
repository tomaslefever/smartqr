// Same rows the SmartQR app reads and writes (see ../../types.ts)

export interface Category {
    id: number;
    name: string;
    position: number | null;
}

export interface Product {
    id: number;
    name: string;
    description: string;
    price: number;
    unit: 'unit' | 'kg';
    // Name of the product's category ('' when it has none); kept in sync with category_id
    category: string;
    category_id: number | null;
    image_url: string;
    // When false the product stays in the panel but is hidden from the public store
    active: boolean;
    // The store shows the product as "No disponible"
    out_of_stock: boolean;
    track_stock: boolean;
    stock: number;
    position: number | null;
}

export interface Menu {
    categories: Category[];
    products: Product[];
}

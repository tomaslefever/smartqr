
export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string;
  stock: number;
  // When false the product has no stock control and `stock` is ignored
  track_stock: boolean;
  // Quick manual flag: the store shows the product as "No disponible"
  out_of_stock: boolean;
  created_at: string;
  unit: 'unit' | 'kg';
}

export interface StoreTheme {
  backgroundType: 'color' | 'image';
  backgroundColor: string;
  // Public URL of an image in the product-images bucket, tiled as a pattern; '' when none
  backgroundImageUrl: string;
  // Width in px of each pattern tile
  backgroundImageSize: number;
  cardColor: string;
  textColor: string;
  // Store title, categories, prices and the selected category chip
  accentColor: string;
}

export interface Profile {
  id: string; // Corresponds to user_id
  business_name: string | null;
  phone: string | null;
  address: string | null;
  opening_hours: string | null;
  email: string | null;
  store_theme?: Partial<StoreTheme> | null;
}


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
  // Manual order within the business's menu (1 = first); null until supabase/products-position.sql runs
  position?: number | null;
  // When false the product stays in the panel but is hidden from the public store
  active: boolean;
  created_at: string;
  unit: 'unit' | 'kg';
}

export interface Theme {
  id: string;
  // null for predefined themes available to every business
  owner_id: string | null;
  name: string;
  background_type: 'color' | 'image';
  background_color: string;
  // Public URL of an image in the product-images bucket, tiled as a pattern
  background_image_url: string | null;
  // Width in px of each pattern tile
  background_image_size: number;
  card_color: string;
  text_color: string;
  // Store title, categories, prices and the selected category chip
  accent_color: string;
}

// The visual part of a theme, what the editor changes and the store renders
export type ThemeStyle = Omit<Theme, 'id' | 'owner_id' | 'name'>;

export interface Profile {
  id: string; // Corresponds to user_id
  business_name: string | null;
  phone: string | null;
  address: string | null;
  opening_hours: string | null;
  email: string | null;
  // Theme used by the public store; null means the default style
  theme_id?: string | null;
}

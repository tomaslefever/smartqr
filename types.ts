
export interface Category {
  id: number;
  user_id: string;
  name: string;
  // Order in the menu (1 = first)
  position: number | null;
  // When false neither the category nor its products appear in the public store; missing before
  // supabase/categories-active.sql, which counts as shown
  active?: boolean;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
  // Name of the product's category ('' when it has none). Read from the categories table when it
  // exists (supabase/categories.sql); the products.category text column is only kept in sync for
  // compatibility.
  category: string;
  category_id?: number | null;
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
  // How the public store lists products; missing before supabase/store-layout.sql, which counts as 'list'
  store_layout?: StoreLayout;
  // WhatsApp orders from the public store; all missing before supabase/whatsapp-orders.sql
  orders_enabled?: boolean;
  // Number that receives the orders: country code and digits only, e.g. 56912345678
  orders_whatsapp?: string | null;
  // Whether the business delivers; otherwise orders are for pickup (or for the table)
  orders_delivery?: boolean;
  // Loyalty program (stamp card); all missing before supabase/loyalty.sql. Turning it on needs a
  // WhatsApp connection (a database trigger checks it).
  loyalty_enabled?: boolean;
  // Stamps needed for the reward
  loyalty_goal?: number;
  loyalty_reward?: string | null;
  // Connected WhatsApp number (digits) where customers write "sellos"; set by the database
  loyalty_whatsapp?: string | null;
}

// The business's WhatsApp Business (Cloud API) number, as the panel sees it: the access token stays on
// the server (supabase/whatsapp-cloud.sql)
export interface WhatsAppConnection {
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string | null;
  verified_name: string | null;
  // Whether the app is subscribed to the WABA, so messages reach the webhook
  webhooks_subscribed: boolean;
  // Warnings from the last save (subscription or number registration that failed)
  setup_error: string | null;
  connected_at?: string;
  updated_at?: string;
}

// A customer of the loyalty program, identified by their WhatsApp number
export interface LoyaltyCustomer {
  id: number;
  // Country code and digits, e.g. 56912345678
  phone: string;
  name: string | null;
  // Stamps towards the next reward
  stamps: number;
  total_stamps: number;
  rewards_redeemed: number;
  // 'whatsapp': joined by writing to the business; 'panel': added by the business
  source: 'panel' | 'whatsapp';
  // Last message from the customer; free-form replies are only allowed within 24 hours of it
  last_message_at: string | null;
  created_at: string;
}

// 'list': one column of horizontal cards, image on the right. 'grid': two columns on phones (more on
// wider screens) of vertical cards, image on top.
export type StoreLayout = 'list' | 'grid';

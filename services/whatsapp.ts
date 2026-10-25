// WhatsApp setup assistant: one number for everyone, read like the Supabase values (see supabaseClient.ts)
const configured = window.__SMARTQR_CONFIG__?.whatsappNumber || import.meta.env.VITE_WHATSAPP_NUMBER || '';

// wa.me wants the number with country code and digits only
export const whatsappNumber = configured.replace(/\D/g, '');

// Link that opens a chat with the assistant with the message already typed; null when no number is set
export const whatsappLink = (message: string) =>
    whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}` : null;

// WhatsApp numbers arrive in many shapes ("+56 9 1234 5678", "56912345678", "56912345678@s.whatsapp.net");
// they are stored as + and the digits, with the country code (E.164), as whatsapp_links expects
export const normalizePhone = (raw: string) => {
    const digits = raw.split('@')[0]!.replace(/\D/g, '').replace(/^00/, '');
    if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) {
        throw new Error(`"${raw}" no es un número de WhatsApp válido: debe incluir el código de país, por ejemplo +56912345678.`);
    }
    return `+${digits}`;
};

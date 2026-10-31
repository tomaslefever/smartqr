// Text matching that ignores case and accents and accepts plurals: "salmón" finds "Salmon" and
// "camarón" finds "Camarones". Matches are whole words, so "salmón" does not find "salmonete".

export const normalize = (text: string) =>
    text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const ACCENTED: Record<string, string> = {
    a: '[aáàäâ]', e: '[eéèëê]', i: '[iíìïî]', o: '[oóòöô]', u: '[uúùüû]', n: '[nñ]', c: '[cç]',
};

const escape = (char: string) => char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Regex that finds the term in the original text (with accents), so it can be shown or edited
export const termRegex = (term: string) => {
    const body = [...normalize(term.trim())].map(char => ACCENTED[char] ?? escape(char)).join('');
    // Plurals: salmón → salmones, papa → papas
    return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?:es|s)?(?![\\p{L}\\p{N}])`, 'giu');
};

export const containsTerm = (text: string, term: string) => termRegex(term).test(text);

// A short piece of text around the first match, for showing why something matched
export const snippet = (text: string, term: string, radius = 50) => {
    const match = termRegex(term).exec(text);
    if (!match) return '';
    const start = Math.max(0, match.index - radius);
    const end = Math.min(text.length, match.index + match[0].length + radius);
    return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
};

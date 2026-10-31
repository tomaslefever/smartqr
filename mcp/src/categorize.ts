// Suggests the category of a new product from the menu itself: words it shares with each category's
// name and with the products already in it. Rare words weigh more ("pizza" says more than "queso",
// which is everywhere). Optionally Jev (TypeSafe AI) picks among the categories too.
import type { JevCategoryPick } from './jev.js';
import { normalize } from './text.js';
import type { Menu } from './types.js';

export interface CategorySuggestion {
    id: number;
    categoria: string;
    puntaje: number;
    // Words of the new product found in the category, or Jev's confidence
    motivo: string;
}

export interface CategoryAdvice {
    sugerencias: CategorySuggestion[];
    // When true no category stands out and the person should be asked without a default
    preguntar_sin_sugerencia: boolean;
    jev?: { categoria: string | null; confianza: number } | { error: string };
}

const STOPWORDS = new Set([
    'de', 'del', 'la', 'el', 'lo', 'le', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u', 'con', 'sin', 'en', 'al',
    'a', 'para', 'por', 'su', 'sus', 'mi', 'tu', 'si', 'no', 'ya', 'mas', 'muy', 'que', 'se', 'es', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
    'incluye', 'unidad', 'unidades', 'opcion', 'opciones', 'eleccion', 'cortes', 'porcion', 'tipo',
]);

// Words of a text, without accents, stopwords or plural endings
export const words = (text: string) => normalize(text)
    .split(/[^\p{L}\p{N}]+/u)
    // Two-letter words count too ("té"); the ones that say nothing are in STOPWORDS
    .filter(word => word.length >= 2 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
    // Plural endings, unless the word is too short to have one ("tés" → "té", but "gas" stays)
    .map(word => (word.length > 4 ? word.replace(/(es|s)$/u, '') : word.length > 3 ? word.replace(/s$/u, '') : word));

// A category's name says the most, its products' names next, their descriptions the least
const WEIGHTS = { nombre_categoria: 3, nombre_producto: 2, descripcion: 1 };
// Weight of a word that is only in the new product's description, wherever it matches
const DESCRIPTION_WEIGHT = 0.5;

export const suggestCategories = (menu: Menu, item: { nombre: string; descripcion?: string }, limit = 3): CategorySuggestion[] => {
    const itemWords = [...new Set([...words(item.nombre), ...words(item.descripcion ?? '')])];
    const nameWords = new Set(words(item.nombre));
    // In Spanish the first word names the dish: "Reineta a lo pobre" is a fish, "Jugo de mango" a juice
    const head = words(item.nombre)[0];
    if (!itemWords.length || !menu.categories.length) return [];

    const profiles = menu.categories.map(category => {
        const products = menu.products.filter(p => p.category_id === category.id);
        return {
            category,
            categoryName: new Set(words(category.name)),
            productNames: new Set(products.flatMap(p => words(p.name))),
            descriptions: new Set(products.flatMap(p => words(p.description))),
        };
    });
    // How many categories use each word: a word in every category tells nothing
    const spread = (word: string) => profiles.filter(p => p.categoryName.has(word) || p.productNames.has(word) || p.descriptions.has(word)).length;

    return profiles
        .map(profile => {
            const found: string[] = [];
            let score = 0;
            for (const word of itemWords) {
                const weight = profile.categoryName.has(word) ? WEIGHTS.nombre_categoria
                    : profile.productNames.has(word) ? WEIGHTS.nombre_producto
                    : profile.descriptions.has(word) ? WEIGHTS.descripcion
                    : 0;
                if (!weight) continue;
                // The new product's name says what kind of dish it is ("Pizza hawaiana" is a pizza); its
                // description lists ingredients that many categories share, so it only nudges
                score += (word === head ? weight * 4 : nameWords.has(word) ? weight * 2 : DESCRIPTION_WEIGHT) / spread(word);
                found.push(word);
            }
            return { id: profile.category.id, categoria: profile.category.name, puntaje: Math.round(score * 100) / 100, motivo: found.length ? `palabras en común: ${found.join(', ')}` : '' };
        })
        .filter(s => s.puntaje > 0)
        .sort((a, b) => b.puntaje - a.puntaje)
        .slice(0, limit);
};

// Below this score the match is a stray word ("con", a shared ingredient), not a real hint
const MIN_SCORE = 1;

// The top suggestion stands out when it is a real match and clearly ahead of the next one
const standsOut = (suggestions: CategorySuggestion[]) =>
    suggestions.length > 0 && suggestions[0]!.puntaje >= MIN_SCORE
    && (suggestions.length === 1 || suggestions[0]!.puntaje >= 1.5 * suggestions[1]!.puntaje);

const JEV_TRUST = 0.6;

// Rules first; Jev, when configured and confident, puts its pick first. Never assigns anything:
// the caller asks the person, offering the suggestions.
export const adviseCategory = async (menu: Menu, item: { nombre: string; descripcion?: string }, jevPick?: JevCategoryPick | null): Promise<CategoryAdvice> => {
    const sugerencias = suggestCategories(menu, item);
    if (!jevPick || !menu.categories.length) return { sugerencias, preguntar_sin_sugerencia: !standsOut(sugerencias) };
    try {
        const answer = await jevPick(item, menu);
        const picked = answer.categoryId === null ? null : menu.categories.find(c => c.id === answer.categoryId) ?? null;
        const jev = { categoria: picked?.name ?? null, confianza: answer.confidence };
        if (answer.confidence < JEV_TRUST) return { sugerencias, preguntar_sin_sugerencia: !standsOut(sugerencias), jev };
        if (!picked) return { sugerencias, preguntar_sin_sugerencia: true, jev };
        const rest = sugerencias.filter(s => s.id !== picked.id);
        const fromRules = sugerencias.find(s => s.id === picked.id);
        return {
            sugerencias: [{ id: picked.id, categoria: picked.name, puntaje: fromRules?.puntaje ?? 0, motivo: `Jev, ${Math.round(answer.confidence * 100)} % de confianza${fromRules?.motivo ? `; ${fromRules.motivo}` : ''}` }, ...rest].slice(0, 3),
            preguntar_sin_sugerencia: false,
            jev,
        };
    } catch (error) {
        return { sugerencias, preguntar_sin_sugerencia: !standsOut(sugerencias), jev: { error: error instanceof Error ? error.message : String(error) } };
    }
};

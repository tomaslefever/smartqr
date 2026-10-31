// Decision evaluator: given a term ("salmón"), decides for each product that mentions it whether to
// take it off the menu, edit it, or ask. It runs locally on the menu's text, with no model call, so it
// answers in milliseconds and always the same way for the same menu.
//
// How a product is judged, from each place the term appears in its name or description:
// - Option: the term is one choice among others ("pollo, salmón o camarón", "salmón o atún"). The
//   product still works without it, so the proposal keeps it and removes that choice from the text.
// - Part of the dish: the term is in the name ("Salmón a la plancha") or among its ingredients
//   ("salmón, camarón y pulpo", "salmón + queso crema"). The proposal takes the product down.
// - Part of a group: the product is a platter, promotion or dish for sharing ("Tabla", "30 piezas",
//   "para 2 personas") and the term is a fixed part of it. Taking down the whole group is a business
//   decision, so the evaluator asks instead of deciding.
import { normalize, snippet, termRegex } from './text.js';
import type { Menu, Product } from './types.js';

export type Recommendation = 'desactivar' | 'editar' | 'preguntar';
export type TakeDown = 'ocultar' | 'no_disponible';

export interface Operation {
    tipo: 'ocultar' | 'mostrar' | 'marcar_no_disponible' | 'marcar_disponible' | 'editar';
    id: number;
    nombre?: string;
    descripcion?: string;
}

export interface Decision {
    id: number;
    producto: string;
    categoria: string;
    recomendacion: Recommendation;
    confianza: 'alta' | 'media';
    motivo: string;
    evidencia: string[];
    // What applying the recommendation does; for "preguntar", the options to choose from
    operaciones: Operation[];
    opciones?: { opcion: string; operaciones: Operation[] }[];
}

export interface Evaluation {
    termino: string;
    accion: TakeDown;
    resumen: { desactivar: number; editar: number; preguntar: number; ya_ocultos: number };
    decisiones: Decision[];
    ya_ocultos: { id: number; producto: string }[];
    // Operations of every "desactivar" and "editar" decision, ready for aplicar_cambios
    operaciones_recomendadas: Operation[];
}

// Separators between list items; "o", "u" and "/" offer a choice, "y" and "+" add ingredients
const SEPARATOR = /^(\s*,\s*|\s+[ou]\s+|\s*\/\s*|\s+y\s+|\s*\+\s*)/iu;
const SEPARATOR_BEFORE = /(\s*,\s*|\s+[ou]\s+|\s*\/\s*|\s+y\s+|\s*\+\s*)$/iu;
// A list item: one to three words, none of them the separators "o", "u" or "y"
const ITEM = /^[\p{L}\p{N}]+(?:\s+(?![ouy](?![\p{L}\p{N}]))[\p{L}\p{N}]+){0,2}/iu;
const ITEM_BEFORE = /(?:(?![ouy]\s)[\p{L}\p{N}]+\s+){0,2}[\p{L}\p{N}]+$/iu;

type SeparatorKind = 'coma' | 'opcion' | 'suma' | null;
const kindOf = (separator: string): SeparatorKind => {
    const s = separator.trim().toLowerCase();
    if (s === ',') return 'coma';
    if (s === 'o' || s === 'u' || s === '/') return 'opcion';
    return 'suma';
};

// Follows a list from the term outwards, over short items joined by commas, and returns how it ends:
// "o" means the term is a choice, "y" or "+" means it is one of several ingredients.
const listEnd = (text: string, from: number, direction: 1 | -1): SeparatorKind => {
    let rest = direction === 1 ? text.slice(from) : text.slice(0, from);
    for (let steps = 0; steps < 12; steps++) {
        const separator = direction === 1 ? SEPARATOR.exec(rest) : SEPARATOR_BEFORE.exec(rest);
        if (!separator) return null;
        const kind = kindOf(separator[1] ?? '');
        if (kind !== 'coma') return kind;
        rest = direction === 1 ? rest.slice(separator[0].length) : rest.slice(0, rest.length - separator[0].length);
        const item = direction === 1 ? ITEM.exec(rest) : ITEM_BEFORE.exec(rest);
        if (!item) return null;
        rest = direction === 1 ? rest.slice(item[0].length) : rest.slice(0, rest.length - item[0].length);
    }
    return null;
};

// What kind of list the term at [start, end) belongs to. A Spanish list is defined by its last
// connector ("locos y pesto, jaiba, salmón, carne o mechada" is a choice), so the list after the
// term decides; the one before only counts when the term closes the list ("pulpo o salmón").
const listKind = (text: string, start: number, end: number) => listEnd(text, end, 1) ?? listEnd(text, start, -1);

type Role = 'opcion' | 'ingrediente' | 'nombre';

// Role of each appearance of the term in a text
const rolesIn = (text: string, term: string, isName: boolean): Role[] => {
    const roles: Role[] = [];
    for (const match of text.matchAll(termRegex(term))) {
        const start = match.index;
        if (listKind(text, start, start + match[0].length) === 'opcion') roles.push('opcion');
        else roles.push(isName ? 'nombre' : 'ingrediente');
    }
    return roles;
};

// Removes the term from each list of choices it is in: "pollo, salmón o camarón" → "pollo o camarón",
// "salmón o atún" → "atún", "camarón, pulpo o salmón" → "camarón o pulpo". Returns null if some
// appearance is not a choice and so cannot be removed this way.
export const removeOption = (text: string, term: string): string | null => {
    let result = text;
    for (let guard = 0; guard < 20; guard++) {
        const match = termRegex(term).exec(result);
        if (!match) return result;
        const start = match.index;
        const end = start + match[0].length;
        const before = result.slice(0, start);
        const after = result.slice(end);
        const prev = SEPARATOR_BEFORE.exec(before);
        const next = SEPARATOR.exec(after);
        const prevKind = prev ? kindOf(prev[1] ?? '') : null;
        const nextKind = next ? kindOf(next[1] ?? '') : null;
        if (prevKind === 'suma' || nextKind === 'suma' || listKind(result, start, end) !== 'opcion') return null;
        if (prev && prevKind === 'coma') {
            // "atún, salmón o pulpo" → "atún o pulpo"
            result = before.slice(0, before.length - prev[0].length) + after;
        } else if (next && (nextKind === 'coma' || nextKind === 'opcion')) {
            // "salmón o atún" → "atún", "salmón, pollo o camarón" → "pollo o camarón"
            result = before + after.slice(next[0].length);
            // Keep the capital letter if the term started a sentence or the text
            if (/(^|[.:;(]\s*)$/u.test(before)) {
                const rest = result.slice(before.length);
                result = before + rest.charAt(0).toUpperCase() + rest.slice(1);
            }
        } else if (prev && prevKind === 'opcion') {
            // "camarón, pulpo o salmón" → "camarón, pulpo" → "camarón o pulpo"
            const head = before.slice(0, before.length - prev[0].length);
            const lastComma = /,\s*([\p{L}\p{N}]+(?:\s+[\p{L}\p{N}]+){0,2})$/u.exec(head);
            result = (lastComma ? `${head.slice(0, lastComma.index)}${prev[0]}${lastComma[1]}` : head) + after;
        } else {
            return null;
        }
    }
    return null;
};

const GROUP = /\b(tabla|tablas|promo|promocion|promociones|piezas|combo|combos|para compartir|para \d+ personas)\b/u;
const isGroup = (product: Product) => GROUP.test(normalize(`${product.name} ${product.category} ${product.description}`));

const takeDownOperation = (id: number, accion: TakeDown): Operation =>
    ({ tipo: accion === 'ocultar' ? 'ocultar' : 'marcar_no_disponible', id });

export const evaluate = (menu: Menu, term: string, accion: TakeDown = 'ocultar'): Evaluation => {
    const decisiones: Decision[] = [];
    const ya_ocultos: Evaluation['ya_ocultos'] = [];
    const takeDownLabel = accion === 'ocultar' ? 'ocultarlo de la tienda' : 'marcarlo como "No disponible"';

    for (const product of menu.products) {
        const nameRoles = rolesIn(product.name, term, true);
        const descriptionRoles = rolesIn(product.description, term, false);
        if (!nameRoles.length && !descriptionRoles.length) continue;
        if (!product.active || (accion === 'no_disponible' && product.out_of_stock)) {
            ya_ocultos.push({ id: product.id, producto: product.name });
            continue;
        }

        const evidencia = [
            ...(nameRoles.length ? [`nombre: ${product.name}`] : []),
            ...(descriptionRoles.length ? [`descripción: ${snippet(product.description, term)}`] : []),
        ];
        const base = { id: product.id, producto: product.name, categoria: product.category, evidencia };
        const roles = [...nameRoles, ...descriptionRoles];
        const takeDown = [takeDownOperation(product.id, accion)];

        if (roles.every(role => role === 'opcion')) {
            const nombre = nameRoles.length ? removeOption(product.name, term) : product.name;
            const descripcion = descriptionRoles.length ? removeOption(product.description, term) : product.description;
            if (nombre !== null && descripcion !== null) {
                const edit: Operation = { tipo: 'editar', id: product.id };
                if (nombre !== product.name) edit.nombre = nombre;
                if (descripcion !== product.description) edit.descripcion = descripcion;
                decisiones.push({
                    ...base, recomendacion: 'editar', confianza: 'alta',
                    motivo: `"${term}" es solo una de las opciones; el producto sigue disponible sin ella, así que conviene quitar esa opción del texto.`,
                    operaciones: [edit],
                });
                continue;
            }
        }

        const optionEdit = (() => {
            const descripcion = removeOption(product.description, term);
            return descripcion !== null && descripcion !== product.description && !nameRoles.length
                ? [{ tipo: 'editar' as const, id: product.id, descripcion }]
                : null;
        })();

        // The name offers the term as a choice ("César camarón o pollo") but the description uses it as
        // an ingredient ("camarón grillado"): the dish exists without it, but the text needs a person
        if (nameRoles.length && nameRoles.every(role => role === 'opcion')) {
            const nombre = removeOption(product.name, term);
            decisiones.push({
                ...base, recomendacion: 'preguntar', confianza: 'media',
                motivo: `El nombre ofrece "${term}" como una opción, pero la descripción lo usa como ingrediente; el plato existe sin "${term}", pero su texto hay que revisarlo.`,
                operaciones: [],
                opciones: [
                    { opcion: `Desactivar: ${takeDownLabel}`, operaciones: takeDown },
                    ...(nombre ? [{ opcion: `Mantener, quitar "${term}" del nombre y revisar la descripción a mano`, operaciones: [{ tipo: 'editar' as const, id: product.id, nombre }] }] : []),
                    { opcion: 'Mantener sin cambios (el local avisa al pedir)', operaciones: [] },
                ],
            });
            continue;
        }

        if (isGroup(product)) {
            decisiones.push({
                ...base, recomendacion: 'preguntar', confianza: 'media',
                motivo: `Es una tabla, promoción o plato para compartir que incluye "${term}" como parte fija. Bajar todo el grupo o mantenerlo es una decisión del negocio.`,
                operaciones: [],
                opciones: [
                    { opcion: `Desactivar: ${takeDownLabel}`, operaciones: takeDown },
                    ...(optionEdit ? [{ opcion: `Mantener y quitar "${term}" de la descripción`, operaciones: optionEdit }] : []),
                    { opcion: 'Mantener sin cambios (el local avisa al pedir)', operaciones: [] },
                ],
            });
            continue;
        }

        const inName = nameRoles.some(role => role === 'nombre');
        decisiones.push({
            ...base, recomendacion: 'desactivar', confianza: inName ? 'alta' : 'media',
            motivo: inName
                ? `"${term}" es el producto en sí.`
                : `Lleva "${term}" como ingrediente; sin él no se puede preparar como está descrito.`,
            operaciones: takeDown,
        });
    }

    const count = (recommendation: Recommendation) => decisiones.filter(d => d.recomendacion === recommendation).length;
    return {
        termino: term,
        accion,
        resumen: { desactivar: count('desactivar'), editar: count('editar'), preguntar: count('preguntar'), ya_ocultos: ya_ocultos.length },
        decisiones,
        ya_ocultos,
        operaciones_recomendadas: decisiones.filter(d => d.recomendacion !== 'preguntar').flatMap(d => d.operaciones),
    };
};

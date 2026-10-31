#!/usr/bin/env node
// MCP server to manage a business's menu in SmartQR: read and search it, evaluate what to take down
// when an ingredient runs out, and add, edit, hide, reprice, illustrate and reorder products.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { evaluate, evaluateWithJev, type Operation } from './evaluate.js';
import { jevFromEnv } from './jev.js';
import { configFromEnv, SmartQR } from './smartqr.js';
import { containsTerm, normalize, snippet } from './text.js';
import type { Product } from './types.js';

const INSTRUCTIONS = `Administra la carta de un negocio en SmartQR (la tienda pública que los clientes abren con el QR).
- Antes de cambiar algo, ubica los productos con buscar_productos o ver_carta: las herramientas que escriben usan el id del producto.
- Para "bajar", "sacar" o "desactivar todo lo que tiene X" usa evaluar_retiro: devuelve una propuesta (qué ocultar, qué editar y qué preguntar). Muéstrasela a la persona, pregunta por los casos "preguntar" y aplica solo lo que confirme con aplicar_cambios.
- Ocultar (activo = false) saca el producto de la tienda pero lo deja en el panel; "No disponible" lo deja visible marcado como agotado. Nada se borra.
- Los precios son en pesos chilenos, enteros, sin puntos.`;

const config = configFromEnv();
const smartqr = new SmartQR(config);
// Jev (TypeSafe AI) as a second opinion in evaluar_retiro, when TYPESAFE_API_KEY is set
const jev = jevFromEnv();
const server = new McpServer({ name: 'smartqr', version: '0.1.0' }, { instructions: INSTRUCTIONS });

const status = (p: Product) => (!p.active ? 'oculto' : p.out_of_stock ? 'no disponible' : 'activo');
const view = (p: Product) => ({
    id: p.id,
    nombre: p.name,
    ...(p.description ? { descripcion: p.description } : {}),
    precio: p.price,
    ...(p.unit === 'kg' ? { unidad: 'kg' } : {}),
    categoria: p.category || null,
    estado: status(p),
    imagen: p.image_url || null,
});

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const failure = (error: unknown) => ({
    isError: true,
    content: [{ type: 'text' as const, text: error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error) }],
});
const run = <A>(handler: (args: A) => Promise<unknown>) => async (args: A) => {
    try {
        return ok(await handler(args));
    } catch (error) {
        return failure(error);
    }
};

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const productId = z.number().int().positive().describe('Id del producto (de ver_carta o buscar_productos)');
const price = z.number().int().min(0).describe('Precio en pesos, entero (0 = sin precio)');

server.registerTool('ver_tienda', {
    title: 'Ver la tienda',
    description: 'Nombre del negocio, datos de contacto, enlace a la tienda pública y un resumen de la carta.',
    annotations: READ,
}, run(async () => {
    const [profile, menu] = await Promise.all([smartqr.profile(), smartqr.menu()]);
    return {
        ...profile,
        categorias: menu.categories.length,
        productos: menu.products.length,
        activos: menu.products.filter(p => p.active && !p.out_of_stock).length,
        ocultos: menu.products.filter(p => !p.active).length,
        no_disponibles: menu.products.filter(p => p.active && p.out_of_stock).length,
    };
}));

server.registerTool('ver_carta', {
    title: 'Ver la carta',
    description: 'La carta completa en el orden en que la muestra la tienda: categorías y sus productos con id, precio, descripción y estado (activo, oculto o no disponible).',
    inputSchema: {
        categoria: z.string().optional().describe('Solo esta categoría (nombre o id)'),
        incluir_ocultos: z.boolean().default(true).describe('Incluir los productos ocultos de la tienda'),
    },
    annotations: READ,
}, run(async ({ categoria, incluir_ocultos }) => {
    const menu = await smartqr.menu();
    const only = categoria === undefined ? null : await smartqr.findCategory(categoria);
    const products = menu.products.filter(p => incluir_ocultos || p.active);
    const sections = menu.categories
        .filter(c => !only || c.id === only.id)
        .map(c => ({ categoria: c.name, id: c.id, productos: products.filter(p => p.category_id === c.id).map(view) }));
    const loose = products.filter(p => p.category_id === null || !menu.categories.some(c => c.id === p.category_id));
    if (!only && loose.length) sections.unshift({ categoria: '(sin categoría)', id: 0, productos: loose.map(view) });
    return sections;
}));

server.registerTool('buscar_productos', {
    title: 'Buscar productos',
    description: 'Busca en el nombre, la descripción y la categoría, sin importar tildes ni mayúsculas y aceptando plurales ("salmón" encuentra "salmones"). Con varias palabras, devuelve los productos que tienen todas.',
    inputSchema: {
        texto: z.string().min(1).describe('Palabras a buscar, por ejemplo "salmón" o "pisco sour"'),
        incluir_ocultos: z.boolean().default(true),
    },
    annotations: READ,
}, run(async ({ texto, incluir_ocultos }) => {
    const words = normalize(texto).split(/\s+/).filter(Boolean);
    const { products } = await smartqr.menu();
    return products
        .filter(p => incluir_ocultos || p.active)
        .filter(p => words.every(w => containsTerm(`${p.name} ${p.description} ${p.category}`, w)))
        .map(p => ({ ...view(p), coincidencia: snippet(`${p.name}. ${p.description}`, words[0] ?? '') }));
}));

server.registerTool('evaluar_retiro', {
    title: 'Evaluar qué bajar de la carta',
    description: `Para "bajar todo lo que tiene X" (se acabó un ingrediente, un producto, etc.). Revisa cada producto que menciona el término y propone, sin cambiar nada:
- desactivar: X es el producto o un ingrediente del plato.
- editar: X es solo una opción ("pollo, salmón o camarón"); se mantiene el producto y se quita esa opción del texto.
- preguntar: X es parte fija de una tabla, promoción o plato para compartir, o las fuentes no coinciden; la persona decide, con las opciones listadas.
- mantener: el texto nombra X pero el producto no lo usa (solo con Jev).
Primero deciden reglas sobre el texto; si el servidor tiene Jev (TypeSafe AI) configurado, Jev revisa cada caso: cuando coincide sube la confianza, cuando las reglas dudaban y Jev está muy seguro lo resuelve, y cuando discrepan pregunta. Cada decisión indica su fuente.
Devuelve operaciones_recomendadas listas para aplicar_cambios. Muestra la propuesta y aplica solo lo confirmado.`,
    inputSchema: {
        termino: z.string().min(1).describe('Ingrediente o palabra, por ejemplo "salmón"'),
        accion: z.enum(['ocultar', 'no_disponible']).default('ocultar')
            .describe('ocultar: sacarlo de la tienda. no_disponible: dejarlo visible marcado como agotado (mejor si vuelve pronto).'),
        usar_jev: z.boolean().default(true).describe('Pedir la segunda opinión de Jev, si está configurado'),
    },
    annotations: { ...READ, openWorldHint: true },
}, run(async ({ termino, accion, usar_jev }) => {
    const menu = await smartqr.menu();
    if (jev && usar_jev) return evaluateWithJev(menu, termino, accion, jev);
    return { ...evaluate(menu, termino, accion), jev: jev ? 'No usado en esta evaluación.' : 'No configurado (falta TYPESAFE_API_KEY): decidieron solo las reglas.' };
}));

const operation = z.object({
    tipo: z.enum(['ocultar', 'mostrar', 'marcar_no_disponible', 'marcar_disponible', 'editar']),
    id: productId,
    nombre: z.string().min(1).optional().describe('Solo para editar'),
    descripcion: z.string().optional().describe('Solo para editar'),
});

server.registerTool('aplicar_cambios', {
    title: 'Aplicar cambios',
    description: 'Aplica una lista de operaciones sobre productos (por ejemplo, las de evaluar_retiro que la persona confirmó): ocultar, mostrar, marcar_no_disponible, marcar_disponible o editar (nombre y/o descripción). Úsala solo después de que la persona confirme.',
    inputSchema: { operaciones: z.array(operation).min(1) },
    annotations: WRITE,
}, run(async ({ operaciones }) => {
    const results = [];
    for (const op of operaciones as Operation[]) {
        try {
            const fields: Record<string, unknown> =
                op.tipo === 'ocultar' ? { active: false }
                : op.tipo === 'mostrar' ? { active: true }
                : op.tipo === 'marcar_no_disponible' ? { out_of_stock: true }
                : op.tipo === 'marcar_disponible' ? { out_of_stock: false }
                : { ...(op.nombre !== undefined ? { name: op.nombre.trim() } : {}), ...(op.descripcion !== undefined ? { description: op.descripcion.trim() } : {}) };
            if (!Object.keys(fields).length) throw new Error('editar necesita nombre o descripcion');
            const product = await smartqr.update(op.id, fields);
            results.push({ ok: true, tipo: op.tipo, ...view(product) });
        } catch (error) {
            results.push({ ok: false, tipo: op.tipo, id: op.id, error: error instanceof Error ? error.message : String(error) });
        }
    }
    return { aplicadas: results.filter(r => r.ok).length, fallidas: results.filter(r => !r.ok).length, resultados: results };
}));

server.registerTool('agregar_producto', {
    title: 'Agregar producto',
    description: 'Agrega un producto al final de su categoría.',
    inputSchema: {
        nombre: z.string().min(1),
        descripcion: z.string().optional(),
        precio: price.optional(),
        unidad: z.enum(['unit', 'kg']).optional().describe('unit = por unidad (por defecto), kg = precio por kilo'),
        categoria: z.string().optional().describe('Nombre o id de una categoría existente'),
        activo: z.boolean().optional().describe('false para crearlo oculto'),
    },
    annotations: { ...WRITE, idempotentHint: false },
}, run(async (input) => view(await smartqr.addProduct(input))));

server.registerTool('editar_producto', {
    title: 'Editar producto',
    description: 'Cambia el nombre, la descripción, el precio, la unidad o la categoría de un producto. Solo cambia los campos que envíes.',
    inputSchema: {
        id: productId,
        nombre: z.string().min(1).optional(),
        descripcion: z.string().optional(),
        precio: price.optional(),
        unidad: z.enum(['unit', 'kg']).optional(),
        categoria: z.string().nullable().optional().describe('Nombre o id de la categoría; null para dejarlo sin categoría'),
    },
    annotations: WRITE,
}, run(async ({ id, ...patch }) => {
    const before = await smartqr.product(id);
    const after = await smartqr.updateProduct(id, patch);
    return { antes: view(before), despues: view(after) };
}));

server.registerTool('cambiar_estado', {
    title: 'Ocultar, mostrar o marcar no disponible',
    description: 'Cambia el estado de uno o más productos. activo = false lo saca de la tienda (queda en el panel); no_disponible = true lo deja visible como agotado.',
    inputSchema: {
        ids: z.array(productId).min(1),
        activo: z.boolean().optional(),
        no_disponible: z.boolean().optional(),
    },
    annotations: WRITE,
}, run(async ({ ids, activo, no_disponible }) => {
    if (activo === undefined && no_disponible === undefined) throw new Error('Indica activo y/o no_disponible.');
    const fields = { ...(activo !== undefined ? { active: activo } : {}), ...(no_disponible !== undefined ? { out_of_stock: no_disponible } : {}) };
    const results = [];
    for (const id of ids) results.push(view(await smartqr.update(id, fields)));
    return results;
}));

server.registerTool('cambiar_precios', {
    title: 'Cambiar precios',
    description: 'Cambia precios uno a uno (cambios) o en bloque por porcentaje (porcentaje sobre ids o una categoría, redondeado). Con simular = true muestra el resultado sin guardar: úsalo para mostrar la propuesta antes de aplicar un cambio en bloque.',
    inputSchema: {
        cambios: z.array(z.object({ id: productId, precio: price })).optional(),
        porcentaje: z.number().min(-90).max(500).optional().describe('Por ejemplo 10 sube 10 %, -5 baja 5 %'),
        ids: z.array(productId).optional().describe('Productos a los que aplicar el porcentaje'),
        categoria: z.string().optional().describe('Categoría a la que aplicar el porcentaje'),
        redondeo: z.number().int().positive().default(100).describe('Redondea el resultado del porcentaje a este múltiplo'),
        simular: z.boolean().default(false),
    },
    annotations: WRITE,
}, run(async ({ cambios, porcentaje, ids, categoria, redondeo, simular }) => {
    const { products } = await smartqr.menu();
    const changes = new Map<number, number>((cambios ?? []).map(c => [c.id, c.precio]));
    if (porcentaje !== undefined) {
        if (!ids?.length && categoria === undefined) throw new Error('El porcentaje necesita ids o categoria.');
        const category = categoria === undefined ? null : await smartqr.findCategory(categoria);
        const targets = products.filter(p => ids?.includes(p.id) || (category && p.category_id === category.id));
        for (const p of targets) if (p.price > 0) changes.set(p.id, Math.round((p.price * (1 + porcentaje / 100)) / redondeo) * redondeo);
    }
    if (!changes.size) throw new Error('No hay precios que cambiar.');
    const results = [];
    for (const [id, newPrice] of changes) {
        const current = products.find(p => p.id === id);
        if (!current) { results.push({ id, error: 'No existe en esta carta' }); continue; }
        if (!simular) await smartqr.update(id, { price: newPrice });
        results.push({ id, nombre: current.name, antes: current.price, despues: newPrice });
    }
    return { simulado: simular, cambios: results };
}));

server.registerTool('agregar_imagen', {
    title: 'Agregar imagen a un producto',
    description: 'Pone una imagen a un producto desde una URL (http/https) o un archivo local. Acepta JPG, PNG, WebP y GIF de hasta 10 MB; reemplaza la imagen actual.',
    inputSchema: { id: productId, origen: z.string().min(1).describe('URL de la imagen o ruta de un archivo local') },
    annotations: { ...WRITE, openWorldHint: true },
}, run(async ({ id, origen }) => view(await smartqr.setImage(id, origen))));

server.registerTool('quitar_imagen', {
    title: 'Quitar imagen',
    description: 'Deja un producto sin imagen.',
    inputSchema: { id: productId },
    annotations: WRITE,
}, run(async ({ id }) => view(await smartqr.update(id, { image_url: '' }))));

server.registerTool('crear_categoria', {
    title: 'Crear categoría',
    description: 'Crea una categoría al final de la carta.',
    inputSchema: { nombre: z.string().min(1) },
    annotations: { ...WRITE, idempotentHint: false },
}, run(async ({ nombre }) => smartqr.createCategory(nombre)));

server.registerTool('renombrar_categoria', {
    title: 'Renombrar categoría',
    description: 'Cambia el nombre de una categoría.',
    inputSchema: { categoria: z.string().describe('Nombre o id actual'), nombre: z.string().min(1).describe('Nombre nuevo') },
    annotations: WRITE,
}, run(async ({ categoria, nombre }) => smartqr.renameCategory(categoria, nombre)));

server.registerTool('ordenar_categorias', {
    title: 'Ordenar categorías',
    description: 'Pone las categorías indicadas primero, en ese orden; las demás quedan después en su orden actual. Para ordenar toda la carta, envía todas.',
    inputSchema: { orden: z.array(z.string()).min(1).describe('Nombres o ids de categorías') },
    annotations: WRITE,
}, run(async ({ orden }) => smartqr.reorderCategories(orden)));

server.registerTool('ordenar_productos', {
    title: 'Ordenar productos de una categoría',
    description: 'Pone los productos indicados primero dentro de su categoría, en ese orden; los demás de la categoría quedan después en su orden actual.',
    inputSchema: { categoria: z.string(), orden: z.array(productId).min(1) },
    annotations: WRITE,
}, run(async ({ categoria, orden }) => smartqr.reorderProducts(categoria, orden)));

await server.connect(new StdioServerTransport());

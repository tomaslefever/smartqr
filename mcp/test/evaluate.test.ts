import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateWithJev, removeOption } from '../src/evaluate.js';
import type { JevAnswer, JevChoice } from '../src/jev.js';
import { containsTerm } from '../src/text.js';
import type { Menu, Product } from '../src/types.js';

let nextId = 1;
const product = (name: string, description: string, category: string, extra: Partial<Product> = {}): Product => ({
    id: nextId++, name, description, price: 1000, unit: 'unit', category, category_id: null, image_url: '',
    active: true, out_of_stock: false, track_stock: false, stock: 0, position: nextId, ...extra,
});

// Real products from the Jonás / IshiKuro menu
const OPC = 'pollo, salmón, camarón, kanikama o vegetariano';
const menu: Menu = {
    categories: [],
    products: [
        product('Salmón a la plancha o frito', 'Incluye 1 acompañamiento: arroz, puré de papas, ensalada surtida, papas fritas o papas mayo.', 'Pescados'),
        product('Empanada de queso y salmón', '', 'Empanadas'),
        product('Ceviche mixto', 'Salmón, camarón y pulpo, marinados en leche de tigre y especias, terminado con cebolla morada, cebollín y cilantro.', 'IshiKuro · Appetizers y especiales'),
        product('Soneto I', '10 cortes. Salmón + queso crema + ciboulette, envuelto en salmón y apanado en panko o envoltura a elección.', 'IshiKuro · Sonetos'),
        product('Tártaros', 'Tártaro de salmón o atún levemente picante y cítrico, presentado sobre unas deliciosas láminas crujientes de nori tempurizado.', 'IshiKuro · Appetizers y especiales'),
        product('Ball crabs 4 unidades', 'Pollo, salmón, camarón, vegetariano o jaiba.', 'IshiKuro · Appetizers y especiales'),
        product('Sashimi 8 unidades', 'Opciones de atún, salmón o pulpo.', 'IshiKuro · Appetizers y especiales'),
        product('Sushi burger camarón o salmón', 'Base de queso crema, palta, arroz y proteína, frito en panko.', 'IshiKuro · Sushi burger'),
        product('Camarón, pulpo o salmón adicional', '', 'IshiKuro · Agregados para rolls'),
        product('30 piezas mixtas o hot', `Base: queso crema y ciboulette. 1 frito en panko o tempura (${OPC}); 1 nori o envuelto en palta (${OPC}); 1 sésamo o ciboulette (kanikama o vegetariano).`, 'IshiKuro · Promociones'),
        product('100 piezas mixtas o hot', `Base: queso crema y ciboulette. 2 fritos en panko o tempura (${OPC}); 1 envuelto en salmón (pollo, camarón o vegetariano); 2 nori (pollo, kanikama o vegetariano).`, 'IshiKuro · Promociones'),
        product('Ravioles', 'De locos y pesto, jaiba, salmón, carne o mechada. Incluye 1 salsa.', 'Trattoria y pastas'),
        product('Empanada de queso y mechada', '', 'Empanadas'),
        product('Poema XVI', '10 cortes. Salmón + queso crema, envuelto en camarón.', 'IshiKuro · Poemas', { active: false }),
    ],
};

const byName = (evaluation: ReturnType<typeof evaluate>, name: string) => {
    const decision = evaluation.decisiones.find(d => d.producto === name);
    assert.ok(decision, `no hay decisión para ${name}`);
    return decision;
};

test('matches ignore accents and case, accept plurals and only whole words', () => {
    assert.ok(containsTerm('Salmon ahumado', 'salmón'));
    assert.ok(containsTerm('Chupe de camarones', 'camarón'));
    assert.ok(!containsTerm('Salmonete frito', 'salmón'));
});

test('a product whose name is the term is taken down', () => {
    const evaluation = evaluate(menu, 'salmón');
    for (const name of ['Salmón a la plancha o frito', 'Empanada de queso y salmón']) {
        const d = byName(evaluation, name);
        assert.equal(d.recomendacion, 'desactivar');
        assert.equal(d.confianza, 'alta');
        assert.deepEqual(d.operaciones, [{ tipo: 'ocultar', id: d.id }]);
    }
});

test('a dish with the term among its ingredients is taken down', () => {
    const evaluation = evaluate(menu, 'salmón');
    assert.equal(byName(evaluation, 'Ceviche mixto').recomendacion, 'desactivar');
    assert.equal(byName(evaluation, 'Soneto I').recomendacion, 'desactivar');
});

test('when the term is one option, the product stays and the option is removed', () => {
    const evaluation = evaluate(menu, 'salmón');
    const expected: Record<string, { nombre?: string; descripcion?: string }> = {
        'Tártaros': { descripcion: 'Tártaro de atún levemente picante y cítrico, presentado sobre unas deliciosas láminas crujientes de nori tempurizado.' },
        'Ball crabs 4 unidades': { descripcion: 'Pollo, camarón, vegetariano o jaiba.' },
        'Sashimi 8 unidades': { descripcion: 'Opciones de atún o pulpo.' },
        // The "y" inside "locos y pesto" belongs to one item; the list ends in "o", so it is a choice
        'Ravioles': { descripcion: 'De locos y pesto, jaiba, carne o mechada. Incluye 1 salsa.' },
        'Sushi burger camarón o salmón': { nombre: 'Sushi burger camarón' },
        'Camarón, pulpo o salmón adicional': { nombre: 'Camarón o pulpo adicional' },
        '30 piezas mixtas o hot': { descripcion: 'Base: queso crema y ciboulette. 1 frito en panko o tempura (pollo, camarón, kanikama o vegetariano); 1 nori o envuelto en palta (pollo, camarón, kanikama o vegetariano); 1 sésamo o ciboulette (kanikama o vegetariano).' },
    };
    for (const [name, change] of Object.entries(expected)) {
        const d = byName(evaluation, name);
        assert.equal(d.recomendacion, 'editar', name);
        assert.deepEqual(d.operaciones, [{ tipo: 'editar', id: d.id, ...change }], name);
    }
});

test('a group with the term as a fixed part asks, offering to remove the choices', () => {
    const d = byName(evaluate(menu, 'salmón'), '100 piezas mixtas o hot');
    assert.equal(d.recomendacion, 'preguntar');
    assert.deepEqual(d.operaciones, []);
    assert.equal(d.opciones?.[0]?.operaciones[0]?.tipo, 'ocultar');
    assert.equal(d.opciones?.at(-1)?.operaciones.length, 0);
});

test('a choice in the name with the term as ingredient in the description asks', () => {
    const salad = product('César camarón o pollo', 'Lechuga costina, crutones al ajo y orégano, camarón grillado, parmesano y clásico dressing.', 'Ensaladas');
    const d = byName(evaluate({ categories: [], products: [salad] }, 'camarón'), 'César camarón o pollo');
    assert.equal(d.recomendacion, 'preguntar');
    assert.deepEqual(d.opciones?.[1]?.operaciones, [{ tipo: 'editar', id: salad.id, nombre: 'César pollo' }]);
});

test('hidden products are listed apart, unrelated ones are left out, the summary adds up', () => {
    const evaluation = evaluate(menu, 'salmón');
    assert.deepEqual(evaluation.ya_ocultos.map(p => p.producto), ['Poema XVI']);
    assert.ok(!evaluation.decisiones.some(d => d.producto === 'Empanada de queso y mechada'));
    assert.deepEqual(evaluation.resumen, { desactivar: 4, editar: 7, preguntar: 1, mantener: 0, ya_ocultos: 1 });
    assert.equal(evaluation.operaciones_recomendadas.length, 11);
});

test('the "no disponible" action marks instead of hiding', () => {
    const d = byName(evaluate(menu, 'salmón', 'no_disponible'), 'Ceviche mixto');
    assert.deepEqual(d.operaciones, [{ tipo: 'marcar_no_disponible', id: d.id }]);
});

test('removeOption leaves texts without a choice alone', () => {
    assert.equal(removeOption('Salmón, camarón y pulpo', 'salmón'), null);
    assert.equal(removeOption('Pollo o vegetariano', 'salmón'), 'Pollo o vegetariano');
});

// Jev stand-in: answers per product name, so each path of the combination can be tested offline
const fakeJev = (answers: Record<string, [JevChoice, number] | Error>) => async (p: Product): Promise<JevAnswer> => {
    const answer = answers[p.name];
    if (answer instanceof Error) throw answer;
    const [choice, confidence] = answer ?? ['take_down', 0.3];
    return { choice, confidence, probabilities: { [choice]: confidence } };
};

test('with Jev: agreement raises confidence, low confidence leaves the rules in charge', async () => {
    const evaluation = await evaluateWithJev(menu, 'salmón', 'ocultar', fakeJev({
        'Ceviche mixto': ['take_down', 0.95],
        'Ball crabs 4 unidades': ['take_down', 0.3],
    }));
    const ceviche = byName(evaluation, 'Ceviche mixto');
    assert.equal(ceviche.recomendacion, 'desactivar');
    assert.equal(ceviche.confianza, 'alta');
    assert.equal(ceviche.fuente, 'reglas+jev');
    const crabs = byName(evaluation, 'Ball crabs 4 unidades');
    assert.equal(crabs.recomendacion, 'editar');
    assert.equal(crabs.fuente, 'reglas');
});

test('with Jev: a very sure Jev settles what the rules left open, if it can be carried out', async () => {
    const settled = byName(await evaluateWithJev(menu, 'salmón', 'ocultar', fakeJev({ '100 piezas mixtas o hot': ['take_down', 0.95] })), '100 piezas mixtas o hot');
    assert.equal(settled.recomendacion, 'desactivar');
    assert.equal(settled.fuente, 'jev');
    assert.deepEqual(settled.operaciones, [{ tipo: 'ocultar', id: settled.id }]);

    // Removing the option needs a rewritten text, which the rules could not produce here: still asks
    const open = byName(await evaluateWithJev(menu, 'salmón', 'ocultar', fakeJev({ '100 piezas mixtas o hot': ['remove_option', 0.95] })), '100 piezas mixtas o hot');
    assert.equal(open.recomendacion, 'preguntar');

    // Not sure enough to settle a take-down
    const unsure = byName(await evaluateWithJev(menu, 'salmón', 'ocultar', fakeJev({ '100 piezas mixtas o hot': ['take_down', 0.85] })), '100 piezas mixtas o hot');
    assert.equal(unsure.recomendacion, 'preguntar');
});

test('with Jev: a disagreement goes to a person with both proposals', async () => {
    const d = byName(await evaluateWithJev(menu, 'salmón', 'ocultar', fakeJev({ 'Soneto I': ['unaffected', 0.7] })), 'Soneto I');
    assert.equal(d.recomendacion, 'preguntar');
    assert.deepEqual(d.opciones?.map(o => o.operaciones), [[{ tipo: 'ocultar', id: d.id }], []]);
});

test('with Jev: if Jev fails, the product keeps the rules decision and the failure is reported', async () => {
    const evaluation = await evaluateWithJev(menu, 'salmón', 'ocultar', fakeJev({ 'Ceviche mixto': new Error('HTTP 529') }));
    const d = byName(evaluation, 'Ceviche mixto');
    assert.equal(d.recomendacion, 'desactivar');
    assert.deepEqual(d.jev, { error: 'HTTP 529' });
    assert.match(evaluation.jev ?? '', /falló en 1 de/);
});

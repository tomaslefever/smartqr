import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adviseCategory, suggestCategories, words } from '../src/categorize.js';
import type { Menu, Product } from '../src/types.js';

// An excerpt of the Jonás / IshiKuro menu: categories and some of their real products
const SECTIONS: [string, [string, string][]][] = [
    ['Cafetería', [['Espresso', ''], ['Cortado simple', 'Café + leche batida.'], ['Té especial', ''], ['Té con leche', ''], ['Chocolate caliente', 'Chocolate + leche.']]],
    ['Sándwiches especiales', [['Chacarero', 'Churrasco, tomate, poroto verde, ají y mayonesa.'], ['Jonás burger', 'Burger al BBQ, tocino, cebolla caramelizada y huevo frito.']]],
    ['Empanadas', [['Empanada de queso y camarón', ''], ['Empanada de pino de carne', '']]],
    ['Sopas y chupes', [['Paila marina', ''], ['Chupe de jaiba', '']]],
    ['Pescados', [['Reineta a la plancha o frita', 'Incluye 1 acompañamiento.'], ['Congrio sellado o frito', '']]],
    ['Carnes', [['Lomo vetado', 'Incluye 1 acompañamiento.'], ['Plateada a la cacerola', '']]],
    ['Acompañamientos especiales', [['A lo pobre', 'Cebolla estofada, huevo frito y papas fritas.'], ['Papas fritas grandes', '']]],
    ['Pizzas', [['Pizza napolitana o pepperoni', 'Tomate, queso, jamón, orégano y aceitunas.'], ['Pizza veggie', 'Tomate, queso, cebolla caramelizada, choclo, champiñón y tomate.']]],
    ['Postres', [['Tiramisú', ''], ['Brownie con helado', 'Brownie de chocolate caliente y helado de vainilla.']]],
    ['Cervezas', [['Torobayo', ''], ['Kunstmann sin alcohol', '']]],
    ['Aperitivos y cócteles', [['Pisco sour', ''], ['Mojito cubano', ''], ['Piña colada', '']]],
];

let productId = 0;
const menu: Menu = { categories: [], products: [] };
SECTIONS.forEach(([name, items], i) => {
    const category = { id: i + 1, name, position: i + 1 };
    menu.categories.push(category);
    for (const [productName, description] of items) {
        menu.products.push({
            id: ++productId, name: productName, description, price: 1000, unit: 'unit', category: name, category_id: category.id,
            image_url: '', active: true, out_of_stock: false, track_stock: false, stock: 0, position: productId,
        } satisfies Product);
    }
});

const first = (nombre: string, descripcion = '') => suggestCategories(menu, { nombre, descripcion })[0]?.categoria;

test('words drop accents, plurals and empty words, but keep short ones like "té"', () => {
    assert.deepEqual(words('Té verde de las Papas Fritas'), ['te', 'verde', 'papa', 'frita']);
});

test('new products are matched to the category of similar products', () => {
    assert.equal(first('Pizza hawaiana', 'Tomate, queso, jamón y piña.'), 'Pizzas');
    assert.equal(first('Té verde'), 'Cafetería');
    assert.equal(first('Empanada de pino de jaiba'), 'Empanadas');
    assert.equal(first('Cerveza Cristal'), 'Cervezas');
    assert.equal(first('Mojito de maracuyá'), 'Aperitivos y cócteles');
    assert.equal(first('Café cortado con leche de avena'), 'Cafetería');
    // The first word names the dish: these are a meat and a fish, not the "a lo pobre" side
    assert.equal(first('Lomo a lo pobre', 'Con papas fritas, huevo frito y cebolla.'), 'Carnes');
    assert.equal(first('Reineta a lo pobre', 'Con papas fritas y huevo.'), 'Pescados');
});

test('a clear match is suggested; a close call or no match means asking', async () => {
    const pizza = await adviseCategory(menu, { nombre: 'Pizza hawaiana', descripcion: 'Tomate, queso, jamón y piña.' });
    assert.equal(pizza.preguntar_sin_sugerencia, false);
    // Two categories with the same kind of product: too close to call
    const cakes: Menu = {
        categories: [{ id: 1, name: 'Postres', position: 1 }, { id: 2, name: 'Pastelería', position: 2 }],
        products: [
            { ...menu.products[0]!, id: 1, name: 'Torta de chocolate', description: '', category_id: 1 },
            { ...menu.products[0]!, id: 2, name: 'Torta de nuez', description: '', category_id: 2 },
        ],
    };
    const cake = await adviseCategory(cakes, { nombre: 'Torta de frambuesa' });
    assert.equal(cake.preguntar_sin_sugerencia, true);
    assert.deepEqual(cake.sugerencias.map(s => s.categoria).sort(), ['Pastelería', 'Postres']);
    // Only a stray shared word in common: not a real hint
    const quinoa = await adviseCategory(menu, { nombre: 'Hamburguesa de quinoa', descripcion: 'Pan brioche, quinoa, palta y tomate.' });
    assert.equal(quinoa.preguntar_sin_sugerencia, true);
    const gift = await adviseCategory(menu, { nombre: 'Gift card', descripcion: 'Tarjeta de regalo' });
    assert.deepEqual(gift.sugerencias, []);
    assert.equal(gift.preguntar_sin_sugerencia, true);
});

test('with Jev: a confident pick goes first, an unsure one leaves the rules, "none" means asking', async () => {
    const carnes = menu.categories.find(c => c.name === 'Carnes')!.id;
    const sure = await adviseCategory(menu, { nombre: 'Plateada al jugo' }, async () => ({ categoryId: carnes, confidence: 0.92 }));
    assert.equal(sure.sugerencias[0]?.categoria, 'Carnes');
    assert.equal(sure.preguntar_sin_sugerencia, false);
    assert.match(sure.sugerencias[0]!.motivo, /Jev, 92 %/);

    const unsure = await adviseCategory(menu, { nombre: 'Pizza hawaiana' }, async () => ({ categoryId: carnes, confidence: 0.3 }));
    assert.equal(unsure.sugerencias[0]?.categoria, 'Pizzas');

    const none = await adviseCategory(menu, { nombre: 'Gift card' }, async () => ({ categoryId: null, confidence: 0.95 }));
    assert.equal(none.preguntar_sin_sugerencia, true);

    const failing = await adviseCategory(menu, { nombre: 'Pizza hawaiana' }, async () => { throw new Error('HTTP 529'); });
    assert.equal(failing.sugerencias[0]?.categoria, 'Pizzas');
    assert.deepEqual(failing.jev, { error: 'HTTP 529' });
});

// Jev (TypeSafe AI's decision model) as the second opinion of the take-down evaluator. For each product
// the rules flagged it answers one typed question: what should happen to this product if the
// ingredient runs out. It returns a choice with a probability per option and a confidence.
// API: https://docs.typesafe.ai/introduction/quickstart.md
import type { Menu, Product } from './types.js';

// Option names sent to Jev; combine() in evaluate.ts maps them to the evaluator's recommendations
export const JEV_OPTIONS = {
    take_down: 'The item cannot be served as described without this ingredient: it is the item itself or one of its required ingredients.',
    remove_option: 'The ingredient is only one of several alternatives the customer chooses from (for example "chicken, salmon or shrimp"); the item can still be sold by dropping that alternative.',
    ask_owner: 'The item is a platter, promotion, combo or dish for sharing that includes the ingredient as one fixed part among many; withdrawing it is a business decision.',
    unaffected: 'The text mentions the word, but the item does not actually use this ingredient.',
} as const;

export type JevChoice = keyof typeof JEV_OPTIONS;

export interface JevAnswer {
    choice: JevChoice;
    confidence: number;
    probabilities: Record<string, number>;
}

export type JevDecide = (product: Product, term: string) => Promise<JevAnswer>;

interface ChoiceAnswer { choice?: string; confidence?: number; probabilities?: Record<string, number> }

// Sends one choice question to Jev's System One endpoint and returns its answer
const askChoice = (env: NodeJS.ProcessEnv) => {
    const apiKey = env.TYPESAFE_API_KEY;
    if (!apiKey) return null;
    const url = `${(env.TYPESAFE_URL || 'https://api.typesafe.ai').replace(/\/+$/, '')}/v1/systemone`;
    const model = env.TYPESAFE_MODEL || 'jev-latest';
    return async (state: unknown, instructions: string, criteria: Record<string, string>): Promise<ChoiceAnswer> => {
        const response = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(8000),
            body: JSON.stringify({ model, state, questions: { decision: { type: 'choice', instructions, criteria } } }),
        });
        if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(`Jev respondió HTTP ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
        }
        const body = await response.json() as { answers?: { decision?: ChoiceAnswer } };
        const answer = body.answers?.decision;
        if (!answer?.choice || !(answer.choice in criteria)) throw new Error('Jev no devolvió una opción válida.');
        return answer;
    };
};

export const jevFromEnv = (env = process.env): JevDecide | null => {
    const ask = askChoice(env);
    if (!ask) return null;
    return async (product, term) => {
        const answer = await ask(
            {
                restaurant_menu_item: { name: product.name, description: product.description, menu_section: product.category },
                ingredient_that_ran_out: term,
                language: 'Spanish (Chile)',
            },
            `The restaurant ran out of "${term}". What should happen to this menu item?`,
            JEV_OPTIONS,
        );
        return { choice: answer.choice as JevChoice, confidence: answer.confidence ?? 0, probabilities: answer.probabilities ?? {} };
    };
};

// Picks the category of a new product among the menu's categories, or none of them
export type JevCategoryPick = (item: { nombre: string; descripcion?: string }, menu: Menu) => Promise<{ categoryId: number | null; confidence: number }>;

const NONE = 'none_of_these';

export const jevCategoryFromEnv = (env = process.env): JevCategoryPick | null => {
    const ask = askChoice(env);
    if (!ask) return null;
    return async (item, menu) => {
        // Each category is described by a few of its products, so Jev knows what goes in it
        const criteria: Record<string, string> = Object.fromEntries(menu.categories.map(c => {
            const examples = menu.products.filter(p => p.category_id === c.id).slice(0, 6).map(p => p.name).join(', ');
            return [`c${c.id}`, `${c.name}${examples ? ` (for example: ${examples})` : ''}`];
        }));
        criteria[NONE] = 'None of these menu sections fits the item.';
        const answer = await ask(
            { new_menu_item: { name: item.nombre, description: item.descripcion ?? '' }, language: 'Spanish (Chile)' },
            'In which section of this restaurant menu does the new item belong?',
            criteria,
        );
        return { categoryId: answer.choice === NONE ? null : Number(answer.choice!.slice(1)), confidence: answer.confidence ?? 0 };
    };
};

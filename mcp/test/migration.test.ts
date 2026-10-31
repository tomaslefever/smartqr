// Runs supabase/whatsapp-agent.sql on an embedded Postgres with stand-ins for Supabase's auth schema
// and roles, and checks the linking flow and who may do what.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../../../supabase/whatsapp-agent.sql', import.meta.url), 'utf8');

test('supabase/whatsapp-agent.sql: codes, links, permissions and reordering for an account', async () => {
    const db = new PGlite();
    // Minimal Supabase: auth.users, auth.uid() from the JWT claim, the three API roles, and the app tables
    await db.exec(`
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create table public.profiles (id uuid primary key references auth.users, business_name text);
      create table public.products (id bigint primary key, user_id uuid references auth.users, position int);
      create table public.categories (id bigint primary key, user_id uuid references auth.users, position int);
    `);
    // Supabase grants table privileges to the API roles; RLS decides the rows
    const grants = `grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;`;

    await db.exec(migration);
    await db.exec(migration); // can be run again
    await db.exec(grants);

    const A = '11111111-1111-4111-8111-111111111111';
    const B = '22222222-2222-4222-8222-222222222222';
    await db.exec(`
      insert into auth.users values ('${A}'), ('${B}');
      insert into public.profiles values ('${A}', 'Jonás Café & Cocina'), ('${B}', 'Dónde Mohamed');
      insert into public.products values (1, '${A}', 1), (2, '${A}', 2), (3, '${B}', 1);
      insert into public.categories values (1, '${A}', 1), (2, '${A}', 2), (3, '${B}', 1);
    `);

    // Runs a query as an API role, optionally signed in as a user, and resets afterwards
    const as = async (role: string, user: string | null, sql: string, params: unknown[] = []): Promise<any[]> => {
        await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false);`);
        try {
            return (await db.query(sql, params)).rows;
        } finally {
            await db.exec('reset role;');
        }
    };
    const fails = (promise: Promise<unknown>, pattern: RegExp, label: string) => assert.rejects(promise, pattern, label);
    const ok = (_label: string) => {};

    // 1. The owner generates a code in the panel
    const [{ code, expires_at }] = await as('authenticated', A, 'select * from public.create_whatsapp_link_code()');
    assert.match(code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const minutes = (new Date(expires_at).getTime() - Date.now()) / 60000;
    assert.ok(minutes > 9 && minutes <= 10);
    const stored = await db.query('select code_hash from public.whatsapp_link_codes');
    assert.equal(stored.rows.length, 1);
    assert.notEqual((stored.rows[0] as { code_hash: string }).code_hash, code.replace('-', ''));
    ok(`create_whatsapp_link_code: "${code}", vence en 10 minutos, guardado solo como hash`);

    await fails(as('anon', null, 'select * from public.create_whatsapp_link_code()'), /permission denied/, 'un visitante sin sesión no puede generar códigos');
    await fails(as('authenticated', A, `select * from public.link_whatsapp($1, '+56911111111')`, [code]), /permission denied/, 'el navegador no puede canjear códigos, aunque tenga sesión');

    // 2. The agent (service role) redeems it, typed loosely by the user
    const typed = code.toLowerCase().replace('-', ' ');
    const [linked] = await as('service_role', null, `select * from public.link_whatsapp($1, '+56911111111')`, [typed]);
    assert.deepEqual(linked, { user_id: A, business_name: 'Jonás Café & Cocina' });
    ok(`link_whatsapp: "${typed}" (minúsculas y con espacio) vincula +56911111111 con Jonás`);

    await fails(as('service_role', null, `select * from public.link_whatsapp($1, '+56922222222')`, [code]), /Código inválido o vencido/, 'el código sirve una sola vez');
    await fails(as('service_role', null, `select * from public.link_whatsapp('ABCD-EFGH', '+56922222222')`), /Código inválido o vencido/, 'un código inventado falla');
    await fails(as('service_role', null, `select * from public.link_whatsapp($1, '56933333333')`, [(await as('authenticated', A, 'select code from public.create_whatsapp_link_code()'))[0].code]), /whatsapp_links_phone_check/, 'un número sin formato internacional (+…) se rechaza');

    // 3. Expired codes
    const [{ code: old }] = await as('authenticated', B, 'select code from public.create_whatsapp_link_code()');
    await db.exec(`update public.whatsapp_link_codes set expires_at = now() - interval '1 second' where user_id = '${B}'`);
    await fails(as('service_role', null, `select * from public.link_whatsapp($1, '+56944444444')`, [old]), /Código inválido o vencido/, 'un código vencido falla');

    // 4. A new code replaces the previous one
    const [{ code: first }] = await as('authenticated', B, 'select code from public.create_whatsapp_link_code()');
    const [{ code: second }] = await as('authenticated', B, 'select code from public.create_whatsapp_link_code()');
    await fails(as('service_role', null, `select * from public.link_whatsapp($1, '+56955555555')`, [first]), /Código inválido o vencido/, 'generar otro código anula el anterior');
    await as('service_role', null, `select * from public.link_whatsapp($1, '+56955555555')`, [second]);

    // 5. Moving a number to another account
    const [{ code: moveCode }] = await as('authenticated', B, 'select code from public.create_whatsapp_link_code()');
    await as('service_role', null, `select * from public.link_whatsapp($1, '+56911111111')`, [moveCode]);
    const owners = await db.query(`select phone, user_id from public.whatsapp_links order by phone`);
    assert.deepEqual(owners.rows, [{ phone: '+56911111111', user_id: B }, { phone: '+56955555555', user_id: B }]);
    ok('un número que se vincula a otra cuenta pasa a esa cuenta (un número, una cuenta)');

    // 6. Row level security on the links
    assert.deepEqual(await as('authenticated', A, 'select phone from public.whatsapp_links'), []);
    assert.equal((await as('authenticated', B, 'select phone from public.whatsapp_links')).length, 2);
    assert.deepEqual(await as('anon', null, 'select phone from public.whatsapp_links'), []);
    await as('authenticated', A, `delete from public.whatsapp_links where phone = '+56955555555'`);
    assert.equal(((await db.query('select count(*)::int as n from public.whatsapp_links')).rows[0] as { n: number }).n, 2);
    await fails(as('authenticated', B, `insert into public.whatsapp_links values ('+56966666666', '${B}', now())`), /row-level security/, 'nadie puede crear vínculos directo en la tabla, ni siquiera el dueño');
    await as('authenticated', B, `delete from public.whatsapp_links where phone = '+56955555555'`);
    assert.equal(((await db.query('select count(*)::int as n from public.whatsapp_links')).rows[0] as { n: number }).n, 1);
    assert.deepEqual(await as('authenticated', A, 'select * from public.whatsapp_link_codes'), []);
    ok('cada cuenta ve solo sus números, solo el dueño puede quitarlos, y nadie lee los códigos');

    // 7. Reordering on behalf of an account
    await as('service_role', null, `select public.reorder_products_for_owner('${A}', array[2, 1, 3]::bigint[])`);
    assert.deepEqual((await db.query('select id, position from public.products order by id')).rows, [{ id: 1, position: 2 }, { id: 2, position: 1 }, { id: 3, position: 1 }]);
    await as('service_role', null, `select public.reorder_categories_for_owner('${A}', array[2, 1]::bigint[])`);
    assert.deepEqual((await db.query('select id, position from public.categories order by id')).rows, [{ id: 1, position: 2 }, { id: 2, position: 1 }, { id: 3, position: 1 }]);
    await fails(as('authenticated', A, `select public.reorder_products_for_owner('${B}', array[3]::bigint[])`), /permission denied/, 'una cuenta no puede reordenar en nombre de otra');
    ok('reorder_*_for_owner reordenan solo los productos y categorías de la cuenta indicada');
    await db.close();
});

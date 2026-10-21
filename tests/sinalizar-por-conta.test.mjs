// Prova da sinalização por conta (empresa) e da emissão só para a sala do painel.
// Rode: node --test tests/sinalizar-por-conta.test.mjs
// Os casos de banco exigem um Postgres DESCARTÁVEL (com SSL) em SINALIZAR_TEST_DATABASE_URL
// e criam/apagam as tabelas clientes/atendimentos nele. Sem a variável, são pulados.
// NUNCA aponte para o banco de produção.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const URL_TESTE = process.env.SINALIZAR_TEST_DATABASE_URL;
process.env.DATABASE_URL = URL_TESTE || 'postgresql://u:p@127.0.0.1:1/dummy';
process.env.JWT_ACCESS_SECRET = 'teste-nao-e-segredo-real';
process.env.ENCRYPTION_KEY = 'teste-nao-e-segredo-real';
process.env.SSO_SHARED_SECRET = 'segredo-de-servidor-de-teste';
process.env.N8N_SHARED_SECRET = 'segredo-n8n-de-teste';

const { setIo, emitAlertaAtendimento, SALA_DO_PAINEL } = await import('../src/sockets/realtime.js');

test('atendimento_sinalizado vai SÓ para a sala do painel, nunca para o namespace inteiro', () => {
    const chamadas = [];
    const ns = {
        emit: (...a) => chamadas.push(['namespace', ...a]),
        to: (sala) => ({ emit: (...a) => chamadas.push([sala, ...a]) }),
    };
    setIo({ of: (n) => (n === '/chat' ? ns : assert.fail('namespace errado')) });
    emitAlertaAtendimento({ atendimentoId: 'x' });
    assert.deepEqual(chamadas, [[SALA_DO_PAINEL, 'atendimento_sinalizado', { atendimentoId: 'x' }]]);
    setIo(null);
});

const { default: atendimentoRoutes } = await import('../src/routes/atendimento.routes.js');
const { errorHandler } = await import('../src/middlewares/error.middleware.js');
const app = express();
app.use(express.json());
app.use('/api/atendimentos', atendimentoRoutes);
app.use(errorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const chamar = (corpo) =>
    fetch(`${base}/api/atendimentos/sinalizar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-n8n-secret': 'segredo-n8n-de-teste' },
        body: JSON.stringify(corpo),
    });

test('conta_id vazio é rejeitado (400), sem tocar no banco', async () => {
    const r = await chamar({ id_face: 'a', motivo: 'm', conta_id: '' });
    assert.equal(r.status, 400);
});

const comBanco = { skip: URL_TESTE ? false : 'defina SINALIZAR_TEST_DATABASE_URL (Postgres descartável)' };
const { db } = await import('../src/db/client.js');
const { sql } = await import('drizzle-orm');

test.before(async () => {
    if (!URL_TESTE) return;
    await db.execute(sql`drop table if exists atendimentos, clientes cascade`);
    await db.execute(sql`create table clientes (id uuid primary key default gen_random_uuid(), id_face varchar not null unique,
        nome varchar, cep_padrao varchar, criado_em timestamptz default now(), resumo text, conta_id varchar, empresa varchar,
        tipo_cliente varchar, username varchar)`);
    await db.execute(sql`create table atendimentos (id uuid primary key default gen_random_uuid(),
        cliente_id uuid references clientes(id) on delete cascade, canal varchar default 'Facebook',
        status_funil varchar default 'Iniciou', nota_feedback smallint, categoria_feedback varchar, qualidade_ia numeric(3,1),
        insights_ia jsonb, criado_em timestamptz default now(), atualizado_em timestamptz default now(), conta_id varchar,
        origem varchar, categoria_comentario varchar, precisa_atencao_humana boolean not null default false,
        motivo_atencao varchar, atencao_sinalizada_em timestamptz)`);
    await db.execute(sql`insert into clientes (id, id_face, nome, conta_id) values
        ('00000000-0000-0000-0000-0000000000a1','5511aaa','Ana','conta-A'),
        ('00000000-0000-0000-0000-0000000000b1','5511bbb','Bia','conta-B')`);
    await db.execute(sql`insert into atendimentos (cliente_id) values
        ('00000000-0000-0000-0000-0000000000a1'),('00000000-0000-0000-0000-0000000000b1')`);
});
const marcados = async () =>
    (await db.execute(sql`select c.id_face from atendimentos a join clientes c on c.id=a.cliente_id
        where a.precisa_atencao_humana order by 1`)).rows.map((r) => r.id_face);
const limpar = () => db.execute(sql`update atendimentos set precisa_atencao_humana=false, motivo_atencao=null`);

test('com conta_id certa: marca e devolve o atendimento', comBanco, async () => {
    await limpar();
    const r = await chamar({ id_face: '5511aaa', motivo: 'quer humano', conta_id: 'conta-A' });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.data.clienteNome, 'Ana');
    assert.equal(j.data.precisaAtencaoHumana, true);
    assert.deepEqual(await marcados(), ['5511aaa']);
});

test('com conta_id de OUTRA empresa: 404 e nada é marcado', comBanco, async () => {
    await limpar();
    const r = await chamar({ id_face: '5511aaa', motivo: 'x', conta_id: 'conta-B' });
    assert.equal(r.status, 404);
    assert.deepEqual(await marcados(), []);
});

test('sem conta_id: comportamento antigo (marca em qualquer conta)', comBanco, async () => {
    await limpar();
    const r = await chamar({ id_face: '5511bbb', motivo: 'x' });
    assert.equal(r.status, 200);
    assert.deepEqual(await marcados(), ['5511bbb']);
});

test.after(async () => {
    server.close();
    if (URL_TESTE) await db.execute(sql`drop table if exists atendimentos, clientes cascade`);
    await db.$client.end();
});

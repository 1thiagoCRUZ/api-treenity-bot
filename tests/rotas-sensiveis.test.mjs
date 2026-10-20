// Prova (sem banco) de quem pode chamar o quê. Rode: node --test tests/rotas-sensiveis.test.mjs
// Os controllers tocam o banco; aqui o DATABASE_URL aponta para uma porta morta,
// então "passou do portão" = status diferente de 401/403 (o controller tenta o
// banco, falha e o errorHandler responde 500 — isso é suficiente para provar o portão).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import express from 'express';
import rateLimit from 'express-rate-limit';

process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:1/dummy';
process.env.JWT_ACCESS_SECRET = 'teste-nao-e-segredo-real';
process.env.ENCRYPTION_KEY = 'teste-nao-e-segredo-real';
process.env.SSO_SHARED_SECRET = 'segredo-de-servidor-de-teste';
process.env.N8N_SHARED_SECRET = 'segredo-n8n-de-teste';

const { signAccessToken } = await import('../src/utils/jwt.util.js');
const { default: atendimentoRoutes } = await import('../src/routes/atendimento.routes.js');
const { default: dashboardRoutes } = await import('../src/routes/dashboard.routes.js');
const { errorHandler } = await import('../src/middlewares/error.middleware.js');

const app = express();
app.use(express.json());
app.use('/api/atendimentos', atendimentoRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use(errorHandler);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const bearer = (u, claims) => ({ Authorization: `Bearer ${signAccessToken(u, claims)}` });
const comum = bearer({ id: '11111111-1111-1111-1111-111111111111', papel: 'funcionario' });
const adminPainel = bearer({ id: '22222222-2222-2222-2222-222222222222', papel: 'funcionario' }, { painelAdmin: true });
const SSO = { 'X-SSO-Secret': process.env.SSO_SHARED_SECRET };
const ID = '33333333-3333-3333-3333-333333333333';

async function chamar(metodo, caminho, headers = {}) {
    const res = await fetch(base + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: metodo === 'POST' ? JSON.stringify({ id_faces: ['5511999999999'] }) : undefined,
    });
    return res.status;
}
const barrado = (s) => s === 401 || s === 403;

const leituras = [
    ['GET', '/api/dashboard'],
    ['GET', '/api/dashboard/vendas'],
    ['GET', '/api/atendimentos'],
    ['GET', '/api/atendimentos/sinalizados'],
    ['GET', `/api/atendimentos/${ID}/mensagens`],
];
for (const [m, p] of leituras) {
    test(`leitura ${m} ${p}: sem token 401, usuario comum 403, admin do painel passa`, async () => {
        assert.equal(await chamar(m, p), 401);
        assert.equal(await chamar(m, p, comum), 403);
        assert.ok(!barrado(await chamar(m, p, adminPainel)), 'admin do painel deveria passar do portao');
    });
}

const mutacoes = [
    ['POST', '/api/atendimentos/encerrar-por-cliente'],
    ['POST', '/api/atendimentos/devolver-ao-bot'],
    ['POST', `/api/atendimentos/${ID}/encerrar`],
];
for (const [m, p] of mutacoes) {
    test(`mutacao ${m} ${p}: so segredo de servidor`, async () => {
        assert.ok(barrado(await chamar(m, p, comum)), 'Bearer de usuario comum nao pode');
        assert.ok(barrado(await chamar(m, p, adminPainel)), 'Bearer de admin do painel, sem segredo, nao pode');
        assert.ok(barrado(await chamar(m, p)), 'sem nada nao pode');
        assert.equal(await chamar(m, p, { 'X-SSO-Secret': 'errado' }), 401);
        assert.equal(await chamar(m, p, { 'X-N8N-Secret': process.env.N8N_SHARED_SECRET }), 401, 'segredo do n8n nao abre');
        assert.ok(!barrado(await chamar(m, p, SSO)), 'com X-SSO-Secret correto deveria passar do portao');
        // O painel manda segredo E Bearer (periodo de transicao): continua passando.
        assert.ok(!barrado(await chamar(m, p, { ...SSO, ...comum })), 'segredo + Bearer passa');
    });
}

test('/sinalizar continua sendo do n8n (X-N8N-Secret), nao do SSO', async () => {
    assert.equal(await chamar('POST', '/api/atendimentos/sinalizar', SSO), 401);
    assert.ok(!barrado(await chamar('POST', '/api/atendimentos/sinalizar', { 'X-N8N-Secret': process.env.N8N_SHARED_SECRET })));
});

test('app.js liga trust proxy = 1', () => {
    assert.match(readFileSync(new URL('../src/app.js', import.meta.url), 'utf8'), /app\.set\('trust proxy', 1\)/);
});

test('rate limit: com trust proxy 1 cada IP do X-Forwarded-For tem o seu balde; sem, um balde so', async () => {
    async function rodar(trust) {
        const a = express();
        if (trust) a.set('trust proxy', 1);
        a.use(rateLimit({ windowMs: 60000, limit: 2, standardHeaders: false, legacyHeaders: false, validate: false }));
        a.get('/x', (_req, res) => res.send('ok'));
        const s = a.listen(0);
        const url = `http://127.0.0.1:${s.address().port}/x`;
        const codigos = [];
        for (const ip of ['1.1.1.1', '2.2.2.2', '3.3.3.3', '4.4.4.4']) {
            codigos.push((await fetch(url, { headers: { 'X-Forwarded-For': ip } })).status);
        }
        s.close();
        return codigos;
    }
    // Sem trust proxy o IP visto e sempre o mesmo (aqui 127.0.0.1, em producao o do proxy do Render).
    assert.deepEqual(await rodar(false), [200, 200, 429, 429]);
    assert.deepEqual(await rodar(true), [200, 200, 200, 200]);
});

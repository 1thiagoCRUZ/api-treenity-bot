// Prova da regra de fatos da via "sem atendimento aberto" (função pura, sem banco).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:1/dummy';
process.env.JWT_ACCESS_SECRET = 'teste-nao-e-segredo-real';
process.env.ENCRYPTION_KEY = 'teste-nao-e-segredo-real';

const { selecionarVendaParaPagar: sel } = await import('../src/services/atendimento.service.js');
const desde = new Date('2026-10-20T10:00:00Z');
const v = (id, valor, criado) => ({ id, valorTotal: valor, criadoEm: new Date(criado) });

test('uma candidata, mesmo valor e posterior: escolhida', () => {
    assert.equal(sel([v('a', '150.00', '2026-10-20T11:00:00Z')], 150, desde).id, 'a');
});
test('valor diferente: não', () => {
    assert.equal(sel([v('a', '149.99', '2026-10-20T11:00:00Z')], 150, desde), null);
});
test('anterior ao desde: não', () => {
    assert.equal(sel([v('a', '150.00', '2026-10-20T09:00:00Z')], 150, desde), null);
});
test('duas candidatas: não', () => {
    assert.equal(sel([v('a', '150', '2026-10-20T11:00:00Z'), v('b', '150', '2026-10-20T12:00:00Z')], 150, desde), null);
});
test('sem desde: não', () => {
    assert.equal(sel([v('a', '150', '2026-10-20T11:00:00Z')], 150, undefined), null);
});
test('só a de mesmo valor e posterior conta entre várias Aguardando', () => {
    assert.equal(sel([v('a', '150', '2026-10-20T11:00:00Z'), v('b', '90', '2026-10-20T12:00:00Z')], 150, desde).id, 'a');
});
test('venda já Paga não chega à lista (aguardando vazio): sem candidata', () => {
    assert.equal(sel([], 150, desde), null);
});

// Prova (sem banco): decisão da venda ao fechar com atendimento aberto.
// Rode: node --test tests/decidir-venda-ao-fechar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:1/dummy';
process.env.JWT_ACCESS_SECRET = 'teste-nao-e-segredo-real';
process.env.ENCRYPTION_KEY = 'teste-nao-e-segredo-real';

const { decidirVendaAoFechar } = await import('../src/services/atendimento.service.js');

const desde = new Date('2026-10-20T10:00:00Z');
const venda = { valorTotal: 150, fechadaPor: 'Ana', desde };
const doCadu = { id: 'v-cadu', valorTotal: '150.00', criadoEm: new Date('2026-10-20T11:00:00Z') };

test('A Fechada com venda do CADU + B aberto sem venda: paga a do CADU, nao insere', () => {
    const d = decidirVendaAoFechar({ existente: undefined, aguardando: [doCadu], venda });
    assert.deepEqual(d, { acao: 'pagar_candidata', vendaId: 'v-cadu' });
});
test('sem candidata (valor diferente): insere venda nova', () => {
    const d = decidirVendaAoFechar({ existente: undefined, aguardando: [{ ...doCadu, valorTotal: '99.00' }], venda });
    assert.equal(d.acao, 'inserir');
});
test('duas candidatas: nao adivinha, insere', () => {
    const d = decidirVendaAoFechar({ existente: undefined, aguardando: [doCadu, { ...doCadu, id: 'v2' }], venda });
    assert.equal(d.acao, 'inserir');
});
test('sem aguardando: insere', () => {
    assert.equal(decidirVendaAoFechar({ existente: undefined, aguardando: [], venda }).acao, 'inserir');
});
test('existente Aguardando: atualiza valor e paga', () => {
    const d = decidirVendaAoFechar({ existente: { id: 'e1', statusVenda: 'Aguardando Pagamento' }, aguardando: [], venda });
    assert.deepEqual(d, { acao: 'atualizar', vendaId: 'e1' });
});
test('existente com status nulo conta como Aguardando', () => {
    assert.equal(decidirVendaAoFechar({ existente: { id: 'e1', statusVenda: null }, aguardando: [], venda }).acao, 'atualizar');
});
test('existente ja Paga: nao regrava nem insere', () => {
    const d = decidirVendaAoFechar({ existente: { id: 'e1', statusVenda: 'Paga' }, aguardando: [], venda });
    assert.deepEqual(d, { acao: 'nada', vendaId: 'e1' });
});
test('sem venda no desfecho: nada', () => {
    assert.deepEqual(decidirVendaAoFechar({ existente: undefined, aguardando: [doCadu], venda: null }), { acao: 'nada', vendaId: null });
});

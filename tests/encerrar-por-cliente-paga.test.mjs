// Prova (sem banco): o controller repassa o desfecho do pagamento ao fechar pelo Inbox.
// Rode: node --test tests/encerrar-por-cliente-paga.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:1/dummy';
process.env.JWT_ACCESS_SECRET = 'teste-nao-e-segredo-real';
process.env.ENCRYPTION_KEY = 'teste-nao-e-segredo-real';

const { atendimentoService } = await import('../src/services/atendimento.service.js');
const { atendimentoController } = await import('../src/controllers/atendimento.controller.js');

async function chamar(body, resultado) {
    let recebido;
    atendimentoService.encerrarPorCliente = async (ids, venda) => { recebido = { ids, venda }; return resultado; };
    const out = { status: 200 };
    const res = { status(c) { out.status = c; return this; }, json(v) { out.body = v; return this; } };
    await atendimentoController.encerrarPorCliente({ body }, res);
    return { out, recebido };
}

test('com venda: repassa valor e quem fechou, e devolve vendaId e pendentes', async () => {
    const { out, recebido } = await chamar(
        { id_faces: ['5511999999999'], venda: { valor_total: 150 }, fechada_por: 'Ana' },
        { atendimentoId: null, vendaId: 'v-1', aguardandoPendentes: 0 },
    );
    assert.deepEqual(recebido.venda, { valorTotal: 150, fechadaPor: 'Ana', desde: undefined });
    assert.equal(out.status, 200);
    assert.equal(out.body.data.vendaId, 'v-1');
});
test('ambiguo: 200 sem vendaId e com a contagem pendente', async () => {
    const { out } = await chamar(
        { id_faces: ['5511999999999'], venda: { valor_total: 150 } },
        { atendimentoId: null, vendaId: null, aguardandoPendentes: 2 },
    );
    assert.equal(out.body.data.aguardandoPendentes, 2);
});
test('nada a fechar: 404 como antes', async () => {
    const { out } = await chamar({ id_faces: ['5511999999999'] }, null);
    assert.equal(out.status, 404);
});

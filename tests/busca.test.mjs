// Prova (sem banco): parsing, escape e trecho da busca por texto das listas do painel.
// Rode: node --test tests/busca.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const { buscaSchema, normalizarBusca, escaparLike, padraoContem, digitosDoTelefone, extrairTrecho, condicaoCliente } =
    await import('../src/utils/busca.util.js');

test('normalizarBusca apara, junta espaços e trata vazio como sem busca', () => {
    assert.equal(normalizarBusca('  maria   silva '), 'maria silva');
    assert.equal(normalizarBusca('   '), undefined);
    assert.equal(normalizarBusca(undefined), undefined);
    assert.equal(normalizarBusca(42), undefined);
});

test('buscaSchema: trim e limite de 80 caracteres', () => {
    assert.equal(buscaSchema.parse('  oi  '), 'oi');
    assert.equal(buscaSchema.parse(undefined), undefined);
    assert.equal(buscaSchema.safeParse('a'.repeat(80)).success, true);
    assert.equal(buscaSchema.safeParse('a'.repeat(81)).success, false);
});

test('escaparLike neutraliza %, _ e \\', () => {
    assert.equal(escaparLike('50%_off'), '50\\%\\_off');
    assert.equal(escaparLike('a\\b'), 'a\\\\b');
    assert.equal(padraoContem('100%'), '%100\\%%');
});

test('digitosDoTelefone só vale para termo numérico com 3+ dígitos', () => {
    assert.equal(digitosDoTelefone('(11) 98888-7777'), '11988887777');
    assert.equal(digitosDoTelefone('+55 11 9'), '55119');
    assert.equal(digitosDoTelefone('12'), null);
    assert.equal(digitosDoTelefone('joão 123'), null);
});

test('extrairTrecho: pedaço de ~120 caracteres com o termo dentro', () => {
    const longo = `${'x'.repeat(300)} Quero o TÊNIS azul ${'y'.repeat(300)}`;
    const trecho = extrairTrecho(longo, 'tênis');
    assert.ok(trecho.toLowerCase().includes('tênis'));
    assert.ok(trecho.length <= 122);
    assert.ok(trecho.startsWith('…') && trecho.endsWith('…'));
    assert.equal(extrairTrecho('oi, tudo bem?', 'tudo'), 'oi, tudo bem?');
    assert.equal(extrairTrecho('oi', 'zzz'), null);
    assert.equal(extrairTrecho(null, 'oi'), null);
});

test('condicaoCliente monta a condição sem tocar o banco', () => {
    assert.ok(condicaoCliente('maria', { name: 'nome' }, { name: 'id_face' }));
});

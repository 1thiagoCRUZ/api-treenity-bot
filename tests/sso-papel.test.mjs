// Prova (sem banco): o token do SSO sai com papel 'funcionario' mesmo que a conta
// local achada pelo e-mail seja 'admin'. Rode: node --test tests/sso-papel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:1/dummy';
process.env.JWT_ACCESS_SECRET = 'teste-nao-e-segredo-real';
process.env.ENCRYPTION_KEY = 'teste-nao-e-segredo-real';

const { authService } = await import('../src/services/auth.service.js');
const { authController } = await import('../src/controllers/auth.controller.js');
const { signAccessToken } = await import('../src/utils/jwt.util.js');

// Conta local admin com o mesmo e-mail; emitirTokens assina de verdade (sem tocar o banco).
authService.encontrarOuCriarPorEmailSso = async () => ({ id: 'u-1', nome: 'Fulano', email: 'a@b.com', papel: 'admin' });
authService.emitirTokens = async (usuario, _ua, claims) => ({
    accessToken: signAccessToken(usuario, claims), refreshToken: 'r', refreshExpiraEm: new Date(),
});

async function sso(body) {
    let out;
    await authController.sso({ body, headers: {} }, { json: (v) => (out = v), status() { return this; } });
    return jwt.verify(out.data.accessToken, process.env.JWT_ACCESS_SECRET);
}

test('conta local admin via SSO sem painel_admin: papel funcionario, sem painelAdmin', async () => {
    const p = await sso({ email: 'a@b.com', nome: 'Fulano' });
    assert.equal(p.papel, 'funcionario');
    assert.equal(p.painelAdmin, undefined);
});
test('com painel_admin: papel funcionario + claim painelAdmin', async () => {
    const p = await sso({ email: 'a@b.com', nome: 'Fulano', painel_admin: true });
    assert.equal(p.papel, 'funcionario');
    assert.equal(p.painelAdmin, true);
});

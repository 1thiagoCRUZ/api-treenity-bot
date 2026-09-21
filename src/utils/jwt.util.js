import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env.js';

const ACCESS_SECRET = requireEnv('JWT_ACCESS_SECRET');
const ACCESS_TOKEN_TTL = '15m';

// `claims` são permissões extras e estreitas (ex: { painelAdmin: true }) que
// quem emite o token afirma — vêm ANTES de sub/papel de propósito, pra nunca
// conseguirem sobrescrever a identidade do usuário.
export function signAccessToken(usuario, claims = {}) {
    return jwt.sign({ ...claims, sub: usuario.id, papel: usuario.papel }, ACCESS_SECRET, {
        expiresIn: ACCESS_TOKEN_TTL,
    });
}

// Lança se o token for inválido ou tiver expirado — quem chama decide como tratar.
export function verifyAccessToken(token) {
    return jwt.verify(token, ACCESS_SECRET);
}

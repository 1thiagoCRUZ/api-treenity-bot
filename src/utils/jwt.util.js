import jwt from 'jsonwebtoken';
import { requireEnv } from '../config/env.js';

const ACCESS_SECRET = requireEnv('JWT_ACCESS_SECRET');
const ACCESS_TOKEN_TTL = '15m';

export function signAccessToken(usuario) {
    return jwt.sign({ sub: usuario.id, papel: usuario.papel }, ACCESS_SECRET, {
        expiresIn: ACCESS_TOKEN_TTL,
    });
}

// Lança se o token for inválido ou tiver expirado — quem chama decide como tratar.
export function verifyAccessToken(token) {
    return jwt.verify(token, ACCESS_SECRET);
}

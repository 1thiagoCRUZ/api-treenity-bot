import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { usuarios, refreshTokens } from '../db/schema.js';
import { signAccessToken } from '../utils/jwt.util.js';

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

export const authService = {
    // Criação de conta — hoje só é chamada por um admin já autenticado (ver auth.routes.js)
    async criarUsuario({ nome, email, senha, papel }) {
        const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
        const [usuario] = await db
            .insert(usuarios)
            .values({ nome, email: email.toLowerCase(), senhaHash, papel })
            .returning({
                id: usuarios.id,
                nome: usuarios.nome,
                email: usuarios.email,
                papel: usuarios.papel,
                criadoEm: usuarios.criadoEm,
            });
        return usuario;
    },

    async autenticar(email, senha) {
        const [usuario] = await db
            .select()
            .from(usuarios)
            .where(eq(usuarios.email, email.toLowerCase()))
            .limit(1);

        if (!usuario || !usuario.ativo) return null;

        const senhaConfere = await bcrypt.compare(senha, usuario.senhaHash);
        if (!senhaConfere) return null;

        return usuario;
    },

    // Emite um novo par access token (JWT, 15min) + refresh token (opaco, 7 dias,
    // guardado com hash no banco — permite revogar sessões sem depender do JWT).
    async emitirTokens(usuario, userAgent) {
        const accessToken = signAccessToken(usuario);
        const refreshTokenPlano = crypto.randomBytes(48).toString('hex');
        const expiraEm = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

        await db.insert(refreshTokens).values({
            usuarioId: usuario.id,
            tokenHash: hashToken(refreshTokenPlano),
            userAgent: userAgent || null,
            expiraEm,
        });

        return { accessToken, refreshToken: refreshTokenPlano, refreshExpiraEm: expiraEm };
    },

    // Rotação: cada refresh token só pode ser usado uma vez. Ao usar, revoga o
    // atual e emite um par novo — se um token revogado for reapresentado, é sinal
    // de possível roubo e a sessão é encerrada.
    async rotacionarRefreshToken(refreshTokenPlano, userAgent) {
        const tokenHash = hashToken(refreshTokenPlano);
        const [registro] = await db
            .select()
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenHash, tokenHash))
            .limit(1);

        if (!registro || registro.revogadoEm || registro.expiraEm < new Date()) {
            return null;
        }

        const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, registro.usuarioId)).limit(1);
        if (!usuario || !usuario.ativo) return null;

        await db.update(refreshTokens).set({ revogadoEm: new Date() }).where(eq(refreshTokens.id, registro.id));

        return this.emitirTokens(usuario, userAgent);
    },

    async revogarRefreshToken(refreshTokenPlano) {
        const tokenHash = hashToken(refreshTokenPlano);
        await db.update(refreshTokens).set({ revogadoEm: new Date() }).where(eq(refreshTokens.tokenHash, tokenHash));
    },
};

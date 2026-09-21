import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
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

    // Usado pela ponte de SSO (integração server-to-server, ex: deskcomm).
    // Acha o usuário pelo e-mail ou provisiona um novo, sempre como 'funcionario'
    // — promoção a admin continua sendo uma ação manual dentro deste sistema,
    // nunca decidida por quem chama o SSO (evita escalonamento de privilégio
    // caso o segredo compartilhado vaze ou o outro sistema tenha um bug).
    async encontrarOuCriarPorEmailSso(email, nome) {
        const emailNormalizado = email.toLowerCase();
        const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, emailNormalizado)).limit(1);
        if (existente) {
            // O nome é do sistema de origem e pode mudar (ex: a pessoa renomeia o
            // perfil no deskcomm) — sem isso o nome gravado no primeiro login
            // ficaria pra sempre e duas contas "Dono" viravam indistinguíveis na
            // lista do chat. Quando o outro lado não tem nome próprio ele manda o
            // e-mail no lugar, e isso não pode sobrescrever um nome de verdade.
            const nomeNovo = (nome ?? '').trim().slice(0, 100);
            if (nomeNovo && nomeNovo.toLowerCase() !== emailNormalizado && nomeNovo !== existente.nome) {
                const [atualizado] = await db
                    .update(usuarios)
                    .set({ nome: nomeNovo })
                    .where(eq(usuarios.id, existente.id))
                    .returning();
                return atualizado;
            }
            return existente;
        }

        // Conta provisionada via SSO nunca loga com senha por aqui — gera um
        // hash de uma senha aleatória que ninguém conhece, só pra satisfazer
        // a coluna NOT NULL sem abrir uma forma alternativa de login.
        const senhaAleatoria = crypto.randomBytes(32).toString('hex');
        const senhaHash = await bcrypt.hash(senhaAleatoria, SALT_ROUNDS);

        const [novo] = await db
            .insert(usuarios)
            .values({ nome, email: emailNormalizado, senhaHash, papel: 'funcionario' })
            .returning();

        return novo;
    },

    // "Diretório" interno — usado pelo frontend pra montar o seletor de "com
    // quem iniciar uma conversa". Só id/nome/papel: nunca email nem senha_hash.
    async listarUsuarios() {
        return db
            .select({ id: usuarios.id, nome: usuarios.nome, papel: usuarios.papel })
            .from(usuarios)
            .where(eq(usuarios.ativo, true))
            .orderBy(asc(usuarios.nome));
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

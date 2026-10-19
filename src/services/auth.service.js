import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { and, asc, eq, isNull } from 'drizzle-orm';
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
    async encontrarOuCriarPorEmailSso(email, nome, organizacaoId) {
        const emailNormalizado = email.toLowerCase();
        const [existente] = await db.select().from(usuarios).where(eq(usuarios.email, emailNormalizado)).limit(1);
        if (existente) {
            // O nome é do sistema de origem e pode mudar (ex: a pessoa renomeia o
            // perfil no deskcomm) — sem isso o nome gravado no primeiro login
            // ficaria pra sempre e duas contas "Dono" viravam indistinguíveis na
            // lista do chat. Quando o outro lado não tem nome próprio ele manda o
            // e-mail no lugar, e isso não pode sobrescrever um nome de verdade.
            const nomeNovo = (nome ?? '').trim().slice(0, 100);
            const mudancas = {};
            if (nomeNovo && nomeNovo.toLowerCase() !== emailNormalizado && nomeNovo !== existente.nome) {
                mudancas.nome = nomeNovo;
            }
            // A empresa só muda quando o DeskComm a afirma (o Chat da equipe manda;
            // as chamadas do painel não mandam e não mexem nela).
            if (organizacaoId && organizacaoId !== existente.organizacaoId) {
                mudancas.organizacaoId = organizacaoId;
            }
            if (Object.keys(mudancas).length === 0) return existente;
            const [atualizado] = await db
                .update(usuarios)
                .set(mudancas)
                .where(eq(usuarios.id, existente.id))
                .returning();
            return atualizado;
        }

        // Conta provisionada via SSO nunca loga com senha por aqui — gera um
        // hash de uma senha aleatória que ninguém conhece, só pra satisfazer
        // a coluna NOT NULL sem abrir uma forma alternativa de login.
        const senhaAleatoria = crypto.randomBytes(32).toString('hex');
        const senhaHash = await bcrypt.hash(senhaAleatoria, SALT_ROUNDS);

        const [novo] = await db
            .insert(usuarios)
            .values({ nome, email: emailNormalizado, senhaHash, papel: 'funcionario', organizacaoId: organizacaoId ?? null })
            .returning();

        return novo;
    },

    // "Diretório" interno — usado pelo frontend pra montar o seletor de "com
    // quem iniciar uma conversa". Só id/nome/papel: nunca email nem senha_hash.
    //
    // Só devolve quem é da MESMA empresa de quem pergunta: sem isso, o chat de
    // uma empresa listava os funcionários de todas as outras. Quem ainda não tem
    // empresa registrada (nulo) só enxerga outros sem empresa — nunca a de alguém.
    async listarUsuarios(solicitanteId) {
        const [eu] = await db
            .select({ organizacaoId: usuarios.organizacaoId })
            .from(usuarios)
            .where(eq(usuarios.id, solicitanteId))
            .limit(1);
        if (!eu) return [];
        const mesmaEmpresa = eu.organizacaoId
            ? eq(usuarios.organizacaoId, eu.organizacaoId)
            : isNull(usuarios.organizacaoId);
        return db
            .select({ id: usuarios.id, nome: usuarios.nome, papel: usuarios.papel })
            .from(usuarios)
            .where(and(eq(usuarios.ativo, true), mesmaEmpresa))
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
    // `claims` só entram no access token (curto, 15 min) — nunca no refresh token,
    // então uma renovação por refresh volta ao acesso normal e a permissão extra
    // só existe enquanto o sistema de origem a reafirmar num novo SSO.
    async emitirTokens(usuario, userAgent, claims = {}) {
        const accessToken = signAccessToken(usuario, claims);
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

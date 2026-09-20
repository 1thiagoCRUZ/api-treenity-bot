import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { chatConversas, chatMensagens, usuarios } from '../db/schema.js';
import { encrypt, decrypt } from '../utils/crypto.util.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREVIA_MAX_CARACTERES = 140;

function montarPrevia(conteudoCriptografado) {
    try {
        const texto = decrypt(conteudoCriptografado);
        return texto.length > PREVIA_MAX_CARACTERES ? `${texto.slice(0, PREVIA_MAX_CARACTERES)}…` : texto;
    } catch {
        // Uma mensagem ilegível (ex: chave de criptografia diferente) não pode derrubar a lista inteira.
        return null;
    }
}

export const chatService = {
    // Conversas de que o usuário participa, da mais recente pra mais antiga, cada
    // uma com o outro participante e a última mensagem (prévia já descriptografada).
    // Ficam de fora conversas cujo outro lado não existe mais ou foi desativado
    // (ex: registros antigos com id que não é de usuário) — não há com quem abri-las.
    async listarConversasDoUsuario(usuarioId) {
        const conversas = await db
            .select()
            .from(chatConversas)
            .where(or(eq(chatConversas.adminId, usuarioId), eq(chatConversas.funcionarioId, usuarioId)))
            .orderBy(desc(chatConversas.atualizadoEm));

        if (conversas.length === 0) return [];

        const outroDe = (c) => (c.adminId === usuarioId ? c.funcionarioId : c.adminId);
        // Só ids em formato uuid entram na consulta: usuarios.id é uuid e um valor
        // fora do formato faria o Postgres recusar a query inteira.
        const outrosIds = [...new Set(conversas.map(outroDe).filter((id) => UUID_REGEX.test(id)))];

        const outros = outrosIds.length
            ? await db
                  .select({ id: usuarios.id, nome: usuarios.nome, papel: usuarios.papel })
                  .from(usuarios)
                  .where(and(inArray(usuarios.id, outrosIds), eq(usuarios.ativo, true)))
            : [];
        const outroPorId = new Map(outros.map((u) => [u.id, u]));

        const ultimas = await db
            .selectDistinctOn([chatMensagens.conversaId], {
                id: chatMensagens.id,
                conversaId: chatMensagens.conversaId,
                remetenteId: chatMensagens.remetenteId,
                conteudoCriptografado: chatMensagens.conteudoCriptografado,
                criadoEm: chatMensagens.criadoEm,
            })
            .from(chatMensagens)
            .where(inArray(chatMensagens.conversaId, conversas.map((c) => c.id)))
            .orderBy(chatMensagens.conversaId, desc(chatMensagens.criadoEm));
        const ultimaPorConversa = new Map(ultimas.map((m) => [m.conversaId, m]));

        return conversas.flatMap((c) => {
            const outroUsuario = outroPorId.get(outroDe(c));
            if (!outroUsuario) return [];

            const ultima = ultimaPorConversa.get(c.id);
            return [
                {
                    id: c.id,
                    atualizadoEm: c.atualizadoEm,
                    outroUsuario,
                    ultimaMensagem: ultima
                        ? {
                              id: ultima.id,
                              remetenteId: ultima.remetenteId,
                              conteudo: montarPrevia(ultima.conteudoCriptografado),
                              criadoEm: ultima.criadoEm,
                          }
                        : null,
                },
            ];
        });
    },

    // Busca uma conversa pelo ID (usado para checar quem são os participantes)
    async getConversaById(id) {
        const [conversa] = await db.select().from(chatConversas).where(eq(chatConversas.id, id)).limit(1);
        return conversa || null;
    },

    // Busca ou cria uma conversa entre admin e funcionário
    async getOrCreateChat(adminId, funcionarioId) {
        const [existente] = await db
            .select()
            .from(chatConversas)
            .where(
                or(
                    and(eq(chatConversas.adminId, adminId), eq(chatConversas.funcionarioId, funcionarioId)),
                    and(eq(chatConversas.adminId, funcionarioId), eq(chatConversas.funcionarioId, adminId))
                )
            )
            .limit(1);

        if (existente) return existente;

        const [nova] = await db.insert(chatConversas).values({ adminId, funcionarioId }).returning();
        return nova;
    },

    // Salva uma mensagem criptografada
    async saveMessage(conversaId, remetenteId, conteudoBase) {
        const conteudoCriptografado = encrypt(conteudoBase);

        const [mensagem] = await db
            .insert(chatMensagens)
            .values({ conversaId, remetenteId, conteudoCriptografado })
            .returning();

        // Atualiza o 'atualizadoEm' da conversa para ordenar conversas mais recentes primeiro
        await db.update(chatConversas).set({ atualizadoEm: new Date() }).where(eq(chatConversas.id, conversaId));

        // Retorna a mensagem com o conteúdo descriptografado para enviar em tempo real no socket
        return {
            ...mensagem,
            conteudo: conteudoBase,
            conteudoCriptografado: undefined, // não precisamos enviar a hash pro cliente
        };
    },

    // Busca o histórico de mensagens e as descriptografa
    async getChatHistory(conversaId) {
        const mensagens = await db
            .select()
            .from(chatMensagens)
            .where(eq(chatMensagens.conversaId, conversaId))
            .orderBy(chatMensagens.criadoEm); // do mais antigo para o mais novo

        // Mapeia e descriptografa todas as mensagens
        return mensagens.map((msg) => ({
            id: msg.id,
            conversaId: msg.conversaId,
            remetenteId: msg.remetenteId,
            criadoEm: msg.criadoEm,
            conteudo: decrypt(msg.conteudoCriptografado), // Descriptografa antes de retornar ao Controller/Client
        }));
    },
};

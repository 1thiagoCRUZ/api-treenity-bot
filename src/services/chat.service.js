import { and, eq, or } from 'drizzle-orm';
import { db } from '../db/client.js';
import { chatConversas, chatMensagens } from '../db/schema.js';
import { encrypt, decrypt } from '../utils/crypto.util.js';

export const chatService = {
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

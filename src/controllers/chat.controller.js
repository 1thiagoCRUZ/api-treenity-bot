import { z } from 'zod';
import { chatService } from '../services/chat.service.js';

// admin_id/funcionario_id agora são sempre usuarios.id (uuid).
const idsSchema = z.object({
    adminId: z.string().uuid(),
    funcionarioId: z.string().uuid(),
});
const conversaIdSchema = z.string().uuid();

export const chatController = {
    // Lista as conversas do usuário autenticado (com o outro participante e a
    // última mensagem), pra montar a lista lateral do chat sem adivinhar quem
    // já tem histórico. O usuário vem do token, nunca de parâmetro.
    async listarConversas(req, res) {
        const conversas = await chatService.listarConversasDoUsuario(req.usuario.id);
        res.json({ success: true, data: conversas });
    },

    // Rota para buscar o histórico ou criar uma conversa
    async initChat(req, res) {
        const parsed = idsSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'adminId e funcionarioId (uuid) são obrigatórios' });
        }
        const { adminId, funcionarioId } = parsed.data;

        // Só é possível iniciar uma conversa da qual você mesmo participa
        if (![adminId, funcionarioId].includes(req.usuario.id)) {
            return res.status(403).json({ success: false, error: 'Você só pode iniciar conversas das quais participa' });
        }

        const conversa = await chatService.getOrCreateChat(adminId, funcionarioId);
        res.json({ success: true, data: conversa });
    },

    // Rota para buscar o histórico de uma conversa (descriptografa as mensagens no backend)
    async getHistory(req, res) {
        const parsedId = conversaIdSchema.safeParse(req.params.conversaId);
        if (!parsedId.success) {
            return res.status(400).json({ success: false, error: 'ID da conversa inválido' });
        }
        const conversaId = parsedId.data;

        const conversa = await chatService.getConversaById(conversaId);
        if (!conversa) {
            return res.status(404).json({ success: false, error: 'Conversa não encontrada' });
        }

        if (![conversa.adminId, conversa.funcionarioId].includes(req.usuario.id)) {
            return res.status(403).json({ success: false, error: 'Você não tem acesso a esta conversa' });
        }

        const mensagens = await chatService.getChatHistory(conversaId);
        res.json({ success: true, data: mensagens });
    }
};

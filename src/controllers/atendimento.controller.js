import { z } from 'zod';
import { atendimentoService } from '../services/atendimento.service.js';
import { emitAlertaAtendimento } from '../sockets/realtime.js';

const sinalizarSchema = z.object({
    id_face: z.string().min(1),
    motivo: z.string().min(1).max(500),
});

export const atendimentoController = {
    // Chamada pelo n8n (segredo compartilhado, ver n8n.middleware.js) quando o
    // Agente de IA detecta que o cliente precisa de um humano.
    async sinalizar(req, res) {
        const parsed = sinalizarSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'id_face e motivo são obrigatórios' });
        }
        const { id_face, motivo } = parsed.data;

        const atendimento = await atendimentoService.sinalizar(id_face, motivo);
        if (!atendimento) {
            return res.status(404).json({ success: false, error: 'Nenhum atendimento aberto para esse cliente' });
        }

        emitAlertaAtendimento({
            atendimentoId: atendimento.id,
            clienteNome: atendimento.clienteNome,
            canal: atendimento.canal,
            motivo: atendimento.motivoAtencao,
            sinalizadoEm: atendimento.atencaoSinalizadaEm,
        });

        res.json({ success: true, data: atendimento });
    },

    // Chamada pelo painel (usuário autenticado, qualquer papel) quando um
    // humano resolveu a situação na mão, sem terminar em venda.
    async encerrar(req, res) {
        const parsedId = z.string().uuid().safeParse(req.params.id);
        if (!parsedId.success) {
            return res.status(400).json({ success: false, error: 'ID do atendimento inválido' });
        }

        const atendimento = await atendimentoService.encerrar(parsedId.data);
        if (!atendimento) {
            return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
        }

        res.json({ success: true, data: atendimento });
    },
};

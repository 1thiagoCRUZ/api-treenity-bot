import { z } from 'zod';
import { atendimentoService } from '../services/atendimento.service.js';
import { emitAlertaAtendimento } from '../sockets/realtime.js';
import { decodificarCursor } from '../utils/cursor.util.js';

const sinalizarSchema = z.object({
    id_face: z.string().min(1),
    motivo: z.string().min(1).max(500),
});

// `desde` é inclusivo e `ate` é exclusivo, sobre a última atividade do atendimento.
const listarSchema = z.object({
    canal: z.string().min(1).max(60).optional(),
    etapa: z.string().min(1).max(60).optional(),
    com_venda: z.enum(['true', 'false']).optional(),
    desde: z.coerce.date().optional(),
    ate: z.coerce.date().optional(),
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const atendimentoController = {
    // Painel: todos os atendimentos com o resumo de cada um. Restrita ao painel
    // admin (ver requirePainelAdmin em atendimento.routes.js) porque traz nome
    // e identificador do cliente. Paginada: `proximoCursor` vem preenchido
    // enquanto houver mais páginas.
    async listar(req, res) {
        const parsed = listarSchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'Parâmetros inválidos', detalhes: parsed.error.flatten() });
        }
        const { cursor: cursorTexto, com_venda, ...filtros } = parsed.data;

        let cursor;
        if (cursorTexto) {
            cursor = decodificarCursor(cursorTexto);
            if (!cursor) return res.status(400).json({ success: false, error: 'Cursor inválido' });
        }

        const { itens, proximoCursor } = await atendimentoService.listarTodos({
            ...filtros,
            comVenda: com_venda === undefined ? undefined : com_venda === 'true',
            cursor,
        });
        res.json({ success: true, data: itens, proximoCursor });
    },

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

    // Lista os atendimentos sinalizados e ainda abertos — pro painel montar
    // uma tela de "conversas precisando de atenção" sem depender só do evento.
    async listarSinalizados(req, res) {
        const sinalizados = await atendimentoService.listarSinalizados();
        res.json({ success: true, data: sinalizados });
    },

    // Transcrição de um atendimento específico — é o que permite ir do alerta
    // (que só traz o atendimentoId) direto pra conversa real.
    async listarMensagens(req, res) {
        const parsedId = z.string().uuid().safeParse(req.params.id);
        if (!parsedId.success) {
            return res.status(400).json({ success: false, error: 'ID do atendimento inválido' });
        }

        const atendimento = await atendimentoService.buscarComCliente(parsedId.data);
        if (!atendimento) {
            return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
        }

        const mensagens = await atendimentoService.listarMensagens(parsedId.data);
        res.json({ success: true, data: { atendimento, mensagens } });
    },
};

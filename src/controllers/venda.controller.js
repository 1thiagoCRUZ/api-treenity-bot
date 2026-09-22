import { z } from 'zod';
import { vendaService, STATUS_AGUARDANDO } from '../services/venda.service.js';
import { getSalesDetails } from '../services/dashboard.service.js';
import { decodificarCursor } from '../utils/cursor.util.js';

const idSchema = z.string().uuid();

const pagamentoSchema = z.object({
    pago: z.boolean(),
    // Quem conferiu (e-mail do admin no deskcomm). Obrigatório ao marcar como paga.
    confirmado_por: z.string().min(1).max(200).optional(),
});

// `desde` é obrigatório: quem chama (o sincronizador de tarefas do deskcomm) só
// quer as vendas novas, nunca o histórico inteiro.
const aguardandoSchema = z.object({
    desde: z.coerce.date(),
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const vendaController = {
    // Vendas ainda "Aguardando Pagamento" criadas a partir de `desde`, mais
    // recentes primeiro. Server-to-server (segredo de SSO) — mesmo formato de
    // GET /api/dashboard/vendas, sem o resumo.
    async listarAguardando(req, res) {
        const parsed = aguardandoSchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'Parâmetros inválidos', detalhes: parsed.error.flatten() });
        }
        const { cursor: cursorTexto, ...filtros } = parsed.data;

        let cursor;
        if (cursorTexto) {
            cursor = decodificarCursor(cursorTexto);
            if (!cursor) return res.status(400).json({ success: false, error: 'Cursor inválido' });
        }

        const { itens, proximoCursor } = await getSalesDetails({ ...filtros, status: STATUS_AGUARDANDO, cursor });
        res.json({ success: true, count: itens.length, proximo_cursor: proximoCursor, data: itens });
    },

    async definirPagamento(req, res) {
        const id = idSchema.safeParse(req.params.id);
        if (!id.success) return res.status(400).json({ success: false, error: 'Id de venda inválido' });

        const corpo = pagamentoSchema.safeParse(req.body);
        if (!corpo.success || (corpo.data.pago && !corpo.data.confirmado_por)) {
            return res.status(400).json({ success: false, error: 'Informe pago (boolean) e, ao marcar como paga, confirmado_por' });
        }

        const resultado = await vendaService.definirPagamento(id.data, {
            pago: corpo.data.pago,
            confirmadoPor: corpo.data.confirmado_por,
        });
        if (!resultado) return res.status(404).json({ success: false, error: 'Venda não encontrada' });

        const { venda, alterou } = resultado;
        res.json({
            success: true,
            alterou,
            data: {
                id_venda: venda.id,
                status: venda.statusVenda,
                pago_em: venda.pagoEm,
                pagamento_confirmado_por: venda.pagamentoConfirmadoPor,
            },
        });
    },
};

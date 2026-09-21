import { z } from 'zod';
import { getMetrics, consolidateMetrics, getSalesDetails } from '../services/dashboard.service.js';
import { decodificarCursor } from '../utils/cursor.util.js';

// `desde` é inclusivo e `ate` é exclusivo (ex: pra um dia inteiro, ate = dia seguinte).
const vendasQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    status: z.string().min(1).max(60).optional(),
    canal: z.string().min(1).max(60).optional(),
    desde: z.coerce.date().optional(),
    ate: z.coerce.date().optional(),
    cursor: z.string().max(300).optional(),
});

export const dashboardController = {

    async getDashboard(req, res) {
        try {
            const metricas = await getMetrics();
            res.json({ success: true, data: metricas });
        } catch (error) {
            console.error('Error in getDashboard:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar métricas' });
        }
    },

    async forceUpdate(req, res) {
        try {
            await consolidateMetrics();
            res.json({ success: true, message: 'Dashboard updated successfully!' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Error in update' });
        }
    },

    // Lista de vendas + resumo do conjunto filtrado. Restrita ao painel admin
    // (ver requirePainelAdmin em dashboard.routes.js). Paginação por cursor:
    // `proximo_cursor` vem preenchido enquanto houver mais páginas.
    async getSalesDetails(req, res) {
        const parsed = vendasQuerySchema.safeParse(req.query);
        if (!parsed.success) {
            return res.status(400).json({ success: false, error: 'Parâmetros inválidos', detalhes: parsed.error.flatten() });
        }
        const { cursor: cursorTexto, ...filtros } = parsed.data;

        let cursor;
        if (cursorTexto) {
            cursor = decodificarCursor(cursorTexto);
            if (!cursor) return res.status(400).json({ success: false, error: 'Cursor inválido' });
        }

        try {
            const { itens, proximoCursor, resumo } = await getSalesDetails({ ...filtros, cursor });

            res.status(200).json({
                success: true,
                count: itens.length,
                resumo,
                proximo_cursor: proximoCursor,
                data: itens,
            });
        } catch (error) {
            console.error('Error in getSalesDetails:', error);
            res.status(500).json({ success: false, error: 'Erro ao buscar detalhes das vendas' });
        }
    },

    // Aliases para compatibilidade legada
    forcarAtualizacao(req, res) {
        return this.forceUpdate(req, res);
    },
    getVendasDetalhes(req, res) {
        return this.getSalesDetails(req, res);
    }
};
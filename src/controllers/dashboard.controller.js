import { getMetrics, consolidateMetrics, getSalesDetails } from '../services/dashboard.service.js';

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

    async getSalesDetails(req, res) {
        try {
            const limit = req.query.limit ? Number(req.query.limit) : 50;
            const status = req.query.status;
            const canal = req.query.canal;

            const vendas = await getSalesDetails({ limit, status, canal });

            const totalFaturamento = vendas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
            const ticketMedio = vendas.length > 0 ? Number((totalFaturamento / vendas.length).toFixed(2)) : 0;

            res.status(200).json({
                success: true,
                count: vendas.length,
                resumo: {
                    faturamento_total: Number(totalFaturamento.toFixed(2)),
                    ticket_medio: ticketMedio
                },
                data: vendas
            });
        } catch (error) {
            console.error('Error in getSalesDetails:', error);
            res.status(500).json({
                success: false,
                error: 'Erro ao buscar detalhes das vendas',
                message: error.message
            });
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
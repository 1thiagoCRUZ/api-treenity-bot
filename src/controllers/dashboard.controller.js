import { getMetrics, consolidateMetrics } from '../services/dashboard.service.js';

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

    async forcarAtualizacao(req, res) {
        try {
            await consolidateMetrics();
            res.json({ success: true, message: 'Dashboard updated successfully!' });
        } catch (error) {
            res.status(500).json({ success: false, error: 'Error in update' });
        }
    }
};
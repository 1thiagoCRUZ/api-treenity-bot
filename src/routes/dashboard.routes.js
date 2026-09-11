import express from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = express.Router();

// Métricas/vendas: qualquer usuário autenticado (admin ou funcionário) pode ler.
router.use(requireAuth);

router.get('/', dashboardController.getDashboard);
router.get('/vendas', dashboardController.getSalesDetails);

// Forçar recálculo é uma operação pesada — restrita a admins.
router.post('/atualizar', requireRole('admin'), dashboardController.forceUpdate);

export default router;
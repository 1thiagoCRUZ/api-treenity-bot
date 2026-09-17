import express from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { requireCronSecret } from '../middlewares/cron.middleware.js';

const router = express.Router();

// Disparada por um agendador externo (ex: GitHub Actions agendado), sem
// usuário logado — por isso vem ANTES do router.use(requireAuth) abaixo, pra
// não exigir Bearer token. Mesma ação de POST /atualizar, autenticação diferente.
router.post('/atualizar-agendado', requireCronSecret, dashboardController.forceUpdate);

// Métricas/vendas: qualquer usuário autenticado (admin ou funcionário) pode ler.
router.use(requireAuth);

router.get('/', dashboardController.getDashboard);
router.get('/vendas', dashboardController.getSalesDetails);

// Forçar recálculo é uma operação pesada — restrita a admins.
router.post('/atualizar', requireRole('admin'), dashboardController.forceUpdate);

export default router;
import express from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';
import { requireAuth, requirePainelAdmin, requireRole } from '../middlewares/auth.middleware.js';
import { requireCronSecret } from '../middlewares/cron.middleware.js';

const router = express.Router();

// Disparada por um agendador externo (ex: GitHub Actions agendado), sem
// usuário logado — por isso vem ANTES do router.use(requireAuth) abaixo, pra
// não exigir Bearer token. Mesma ação de POST /atualizar, autenticação diferente.
router.post('/atualizar-agendado', requireCronSecret, dashboardController.forceUpdate);

router.use(requireAuth);

// Métricas agregadas (faturamento): só admin do painel (claim `painelAdmin`) ou
// admin deste sistema — Funcionário não lê.
router.get('/', requirePainelAdmin, dashboardController.getDashboard);

// Vendas trazem nome, CEP e itens do cliente: só o painel admin (claim
// `painelAdmin` do SSO) ou um admin deste sistema.
router.get('/vendas', requirePainelAdmin, dashboardController.getSalesDetails);

// Forçar recálculo é uma operação pesada — restrita a admins.
router.post('/atualizar', requireRole('admin'), dashboardController.forceUpdate);

export default router;
import { Router } from 'express';
import { atendimentoController } from '../controllers/atendimento.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { requireN8nSecret } from '../middlewares/n8n.middleware.js';

const router = Router();

// Chamada pelo n8n (server-to-server), não por usuário logado.
router.post('/sinalizar', requireN8nSecret, asyncHandler(atendimentoController.sinalizar));

// Chamada pelo painel — qualquer usuário autenticado pode encerrar um
// atendimento que assumiu manualmente.
router.post('/:id/encerrar', requireAuth, asyncHandler(atendimentoController.encerrar));

// Leitura, pro painel (fallback caso o deskcomm não tenha isso pronto):
router.get('/sinalizados', requireAuth, asyncHandler(atendimentoController.listarSinalizados));
router.get('/:id/mensagens', requireAuth, asyncHandler(atendimentoController.listarMensagens));

export default router;

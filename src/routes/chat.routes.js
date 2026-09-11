import { Router } from 'express';
import { chatController } from '../controllers/chat.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = Router();

router.use(requireAuth);

// Inicia um chat (busca ou cria) — só entre o usuário autenticado e outro participante
router.post('/init', asyncHandler(chatController.initChat));

// Busca histórico de uma conversa — só se o usuário autenticado participar dela
router.get('/history/:conversaId', asyncHandler(chatController.getHistory));

export default router;

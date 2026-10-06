import { Router } from 'express';
import { chatController } from '../controllers/chat.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';

const router = Router();

router.use(requireAuth);

// Conversas do usuário autenticado, da mais recente pra mais antiga, com a última mensagem
router.get('/conversas', asyncHandler(chatController.listarConversas));

// Total de mensagens não lidas do usuário autenticado (selo do "Chat da equipe")
router.get('/nao-lidas', asyncHandler(chatController.naoLidas));

// Marca a conversa como lida pelo usuário autenticado
router.post('/conversas/:conversaId/lida', asyncHandler(chatController.marcarLida));

// Inicia um chat (busca ou cria) — só entre o usuário autenticado e outro participante
router.post('/init', asyncHandler(chatController.initChat));

// Busca histórico de uma conversa — só se o usuário autenticado participar dela
router.get('/history/:conversaId', asyncHandler(chatController.getHistory));

export default router;

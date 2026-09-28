import { Router } from 'express';
import { atendimentoController } from '../controllers/atendimento.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireAuth, requirePainelAdmin } from '../middlewares/auth.middleware.js';
import { requireN8nSecret } from '../middlewares/n8n.middleware.js';

const router = Router();

// Painel admin: todos os atendimentos, com cliente, etapa, nota da IA, venda e
// última mensagem (traz dados de cliente — só claim `painelAdmin` ou admin do bot).
router.get('/', requireAuth, requirePainelAdmin, asyncHandler(atendimentoController.listar));

// Chamada pelo n8n (server-to-server), não por usuário logado.
router.post('/sinalizar', requireN8nSecret, asyncHandler(atendimentoController.sinalizar));

// Chamada pelo DeskComm ("Reativar bot" no Inbox), com o token SSO do usuário
// que clicou. Precisa vir ANTES de `/:id/...` só por clareza — o caminho não colide.
router.post('/devolver-ao-bot', requireAuth, asyncHandler(atendimentoController.devolverAoBot));

// Chamada pelo painel — qualquer usuário autenticado pode encerrar um
// atendimento que assumiu manualmente.
router.post('/:id/encerrar', requireAuth, asyncHandler(atendimentoController.encerrar));

// Leitura, pro painel (fallback caso o deskcomm não tenha isso pronto):
router.get('/sinalizados', requireAuth, asyncHandler(atendimentoController.listarSinalizados));
router.get('/:id/mensagens', requireAuth, asyncHandler(atendimentoController.listarMensagens));

export default router;

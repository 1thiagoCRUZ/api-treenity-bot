import { Router } from 'express';
import { atendimentoController } from '../controllers/atendimento.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireAuth, requirePainelAdmin } from '../middlewares/auth.middleware.js';
import { requireN8nSecret } from '../middlewares/n8n.middleware.js';
import { requireSsoSecret } from '../middlewares/sso.middleware.js';

const router = Router();

// Painel admin: todos os atendimentos, com cliente, etapa, nota da IA, venda e
// última mensagem (traz dados de cliente — só claim `painelAdmin` ou admin do bot).
router.get('/', requireAuth, requirePainelAdmin, asyncHandler(atendimentoController.listar));

// Chamada pelo n8n (server-to-server), não por usuário logado.
router.post('/sinalizar', requireN8nSecret, asyncHandler(atendimentoController.sinalizar));

// Mutações chamadas SÓ pelo backend do DeskComm (server-to-server). Exigem o
// segredo de servidor (X-SSO-Secret) e NÃO aceitam token de usuário: o Bearer
// de uma pessoa (inclusive Funcionário) não basta para religar o bot, encerrar
// atendimento nem criar/alterar venda. A decisão de "quem pode" já foi tomada
// no servidor do DeskComm antes da chamada. O n8n não chama nenhuma delas
// (só /sinalizar, acima).

// "Reativar bot" no Inbox.
router.post('/devolver-ao-bot', requireSsoSecret, asyncHandler(atendimentoController.devolverAoBot));

// Equipe fecha a conversa no Inbox dizendo como terminou (com ou sem venda).
router.post('/encerrar-por-cliente', requireSsoSecret, asyncHandler(atendimentoController.encerrarPorCliente));

// Encerrar um atendimento assumido manualmente (botão na transcrição do painel).
router.post('/:id/encerrar', requireSsoSecret, asyncHandler(atendimentoController.encerrar));

// Leituras sensíveis (nome/telefone de cliente, conversa inteira): só admin do
// painel (claim `painelAdmin`) ou admin deste sistema.
router.get('/sinalizados', requireAuth, requirePainelAdmin, asyncHandler(atendimentoController.listarSinalizados));
router.get('/:id/mensagens', requireAuth, requirePainelAdmin, asyncHandler(atendimentoController.listarMensagens));

export default router;

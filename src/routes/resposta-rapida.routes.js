import { Router } from 'express';
import { respostaRapidaController } from '../controllers/resposta-rapida.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireSsoSecret } from '../middlewares/sso.middleware.js';

const router = Router();

// Server-to-server: quem chama é o backend do deskcomm, na sessão de um usuário
// da loja. Nunca do navegador — o segredo do SSO não pode existir em código de front.
// Esta tabela é o ÚNICO cadastro das respostas rápidas: a tela do deskcomm e o
// "/" do Inbox leem e gravam aqui, e o n8n lê direto do banco.
router.get('/', requireSsoSecret, asyncHandler(respostaRapidaController.listar));
router.post('/', requireSsoSecret, asyncHandler(respostaRapidaController.criar));
router.patch('/:id', requireSsoSecret, asyncHandler(respostaRapidaController.atualizar));
router.delete('/:id', requireSsoSecret, asyncHandler(respostaRapidaController.remover));

export default router;

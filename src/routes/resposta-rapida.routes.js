import { Router } from 'express';
import { respostaRapidaController } from '../controllers/resposta-rapida.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireSsoSecret } from '../middlewares/sso.middleware.js';

const router = Router();

// Server-to-server: quem chama é o backend do deskcomm, na sessão de um admin.
// Nunca do navegador — o segredo do SSO não pode existir em código de front.
router.get('/', requireSsoSecret, asyncHandler(respostaRapidaController.listar));
router.post('/', requireSsoSecret, asyncHandler(respostaRapidaController.criar));
router.patch('/:id', requireSsoSecret, asyncHandler(respostaRapidaController.atualizar));
router.delete('/:id', requireSsoSecret, asyncHandler(respostaRapidaController.remover));

// Espelho das respostas salvas do deskcomm, endereçadas pelo id de lá. PUT
// cria ou substitui (idempotente); DELETE tira do bot.
router.put('/origem/:origemId', requireSsoSecret, asyncHandler(respostaRapidaController.espelhar));
router.delete('/origem/:origemId', requireSsoSecret, asyncHandler(respostaRapidaController.removerEspelho));

export default router;

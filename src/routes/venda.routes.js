import { Router } from 'express';
import { vendaController } from '../controllers/venda.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireSsoSecret } from '../middlewares/sso.middleware.js';

const router = Router();

// Server-to-server: quem chama é o backend do deskcomm, depois de confirmar que
// quem concluiu a tarefa é admin. Nunca chamada pelo navegador.
router.get('/aguardando-pagamento', requireSsoSecret, asyncHandler(vendaController.listarAguardando));
router.post('/:id/pagamento', requireSsoSecret, asyncHandler(vendaController.definirPagamento));

export default router;

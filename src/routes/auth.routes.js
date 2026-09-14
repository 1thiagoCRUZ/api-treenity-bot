import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';
import { requireSsoSecret } from '../middlewares/sso.middleware.js';

const router = Router();

router.post('/login', asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', requireAuth, asyncHandler(authController.me));

// Ponte de SSO para integrações server-to-server (ex: deskcomm). Protegida por
// segredo compartilhado, não por login de usuário — ver sso.middleware.js.
router.post('/sso', requireSsoSecret, asyncHandler(authController.sso));

// Listagem: qualquer autenticado pode ver o diretório (id/nome/papel) pra
// escolher com quem iniciar uma conversa.
router.get('/usuarios', requireAuth, asyncHandler(authController.listarUsuarios));

// Criação de contas é restrita a admins autenticados (o primeiro admin é
// criado via `npm run db:seed-admin`, fora da API).
router.post('/usuarios', requireAuth, requireRole('admin'), asyncHandler(authController.criarUsuario));

export default router;

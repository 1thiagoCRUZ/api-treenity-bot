import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { asyncHandler } from '../middlewares/asyncHandler.js';
import { requireAuth, requireRole } from '../middlewares/auth.middleware.js';

const router = Router();

router.post('/login', asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', requireAuth, asyncHandler(authController.me));

// Criação de contas é restrita a admins autenticados (o primeiro admin é
// criado via `npm run db:seed-admin`, fora da API).
router.post('/usuarios', requireAuth, requireRole('admin'), asyncHandler(authController.criarUsuario));

export default router;

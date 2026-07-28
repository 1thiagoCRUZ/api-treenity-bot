import express from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/', dashboardController.getDashboard);
router.post('/atualizar', dashboardController.forcarAtualizacao);

export default router;
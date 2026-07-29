import express from 'express';
import { dashboardController } from '../controllers/dashboard.controller.js';

const router = express.Router();

router.get('/', dashboardController.getDashboard);
router.post('/atualizar', dashboardController.forceUpdate);
router.get('/vendas', dashboardController.getSalesDetails);

export default router;
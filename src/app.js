import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

import { startCronJobs } from './cron/dashboard.cron.js';
import dashboardRoutes from './routes/dashboard.routes.js';

const app = express();
const porta = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/dashboard', dashboardRoutes);

app.listen(porta, () => {
    console.log(`======================================================`);
    console.log(`Server is running on port ${porta}`);
    console.log(`Available endpoints:`);
    console.log(`   - GET  http://localhost:${porta}/api/dashboard`);
    console.log(`   - GET  http://localhost:${porta}/api/dashboard/vendas`);
    console.log(`   - POST http://localhost:${porta}/api/dashboard/atualizar`);
    console.log(`======================================================`);
    startCronJobs();
});

export default app;

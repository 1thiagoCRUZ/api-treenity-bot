import express from 'express';
import dotenv from 'dotenv';
import { iniciarCronJobs } from './cron/dashboardCron.js';
import dashboardRoutes from './routes/dashboardRoutes.js';

dotenv.config();

const app = express();
const porta = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/dashboard', dashboardRoutes);

app.listen(porta, () => {
    console.log(`Server is running on port ${porta}`);
    iniciarCronJobs(); 
});
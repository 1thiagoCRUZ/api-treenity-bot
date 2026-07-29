import cron from 'node-cron';
import { consolidateMetrics } from '../services/dashboard.service.js';

export function startCronJobs() {
    console.log('[Cron] Scheduling background tasks...');

    // Rodar de hora em hora (no minuto 0 de cada hora)
    cron.schedule('0 * * * *', async () => {
        console.log('[Cron] Hourly task triggered: consolidating metrics...');
        try {
            await consolidateMetrics();
            console.log('[Cron] Hourly metrics consolidation completed!');
        } catch (error) {
            console.error('[Cron] Error consolidating metrics:', error.message);
        }
    });

    console.log('[Cron] Job scheduled: "0 * * * *" (every hour at minute 0).');

    console.log('[Cron] Running initial metrics consolidation on startup...');
    consolidateMetrics()
        .then(() => {
            console.log('[Cron] Initial metrics consolidation completed successfully!');
        })
        .catch((error) => {
            console.error('[Cron] Error on initial metrics consolidation:', error.message);
        });
}

export { startCronJobs as iniciarCronJobs };
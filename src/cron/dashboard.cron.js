import cron from 'node-cron';

export function startCronJobs() {
    console.log('Starting schedule tasks...');
    // Rodar todo dia 3h da manhã
    cron.schedule('3 * * * *', async () => {
        await consolidarTodasAsMetricas();
    });
}
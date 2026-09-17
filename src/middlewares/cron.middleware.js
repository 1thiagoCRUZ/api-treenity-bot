import crypto from 'crypto';

// Segredo conhecido só pelo agendador externo (ex: workflow agendado do
// GitHub Actions) que dispara a consolidação de métricas sem um usuário
// logado por trás. Mesmo padrão de sso.middleware.js / n8n.middleware.js.
//
// Opcional: sem ele, a rota que o usa fica desativada (501) — nem todo
// deploy tem um agendador externo configurado.
const CRON_SECRET = process.env.CRON_SHARED_SECRET;

export function requireCronSecret(req, res, next) {
    if (!CRON_SECRET) {
        return res.status(501).json({
            success: false,
            error: 'Agendamento externo não configurado neste ambiente (defina CRON_SHARED_SECRET no .env)',
        });
    }

    const header = req.headers['x-cron-secret'];
    if (!header || typeof header !== 'string') {
        return res.status(401).json({ success: false, error: 'Segredo de agendamento não informado' });
    }

    const recebido = Buffer.from(header);
    const esperado = Buffer.from(CRON_SECRET);

    const valido = recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
    if (!valido) {
        return res.status(401).json({ success: false, error: 'Segredo de agendamento inválido' });
    }

    next();
}

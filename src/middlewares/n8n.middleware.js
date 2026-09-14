import crypto from 'crypto';

// Segredo conhecido só pelo n8n do bot de atendimento, usado para chamar
// POST /api/atendimentos/sinalizar. NUNCA deve existir em código de frontend.
//
// Opcional como o SSO_SHARED_SECRET: sem ele, a rota fica desativada (501)
// em vez de derrubar o servidor — nem todo deploy tem essa integração.
const N8N_SECRET = process.env.N8N_SHARED_SECRET;

export function requireN8nSecret(req, res, next) {
    if (!N8N_SECRET) {
        return res.status(501).json({
            success: false,
            error: 'Integração com o n8n não configurada neste ambiente (defina N8N_SHARED_SECRET no .env)',
        });
    }

    const header = req.headers['x-n8n-secret'];
    if (!header || typeof header !== 'string') {
        return res.status(401).json({ success: false, error: 'Segredo de integração não informado' });
    }

    const recebido = Buffer.from(header);
    const esperado = Buffer.from(N8N_SECRET);

    const valido = recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
    if (!valido) {
        return res.status(401).json({ success: false, error: 'Segredo de integração inválido' });
    }

    next();
}

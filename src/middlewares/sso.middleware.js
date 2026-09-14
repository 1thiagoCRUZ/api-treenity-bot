import crypto from 'crypto';

// Segredo conhecido só pelos backends que podem chamar /api/auth/sso (ex: o
// backend do deskcomm). NUNCA deve existir em código que roda no navegador.
//
// Diferente dos outros segredos (JWT_ACCESS_SECRET, ENCRYPTION_KEY), este é
// OPCIONAL: nem todo deploy desta API tem uma integração externa configurada,
// então a ausência dele não derruba o servidor no boot — só desativa a rota
// /api/auth/sso até alguém configurar SSO_SHARED_SECRET no .env.
const SSO_SECRET = process.env.SSO_SHARED_SECRET;

export function requireSsoSecret(req, res, next) {
    if (!SSO_SECRET) {
        return res.status(501).json({
            success: false,
            error: 'Integração via SSO não configurada neste ambiente (defina SSO_SHARED_SECRET no .env)',
        });
    }

    const header = req.headers['x-sso-secret'];
    if (!header || typeof header !== 'string') {
        return res.status(401).json({ success: false, error: 'Segredo de integração não informado' });
    }

    const recebido = Buffer.from(header);
    const esperado = Buffer.from(SSO_SECRET);

    // Comparação em tempo constante — evita vazar o segredo por diferença de
    // tempo de resposta (timing attack) mesmo comparando string por string.
    const valido = recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
    if (!valido) {
        return res.status(401).json({ success: false, error: 'Segredo de integração inválido' });
    }

    next();
}

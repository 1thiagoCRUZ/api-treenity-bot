import { verifyAccessToken } from '../utils/jwt.util.js';

// Exige um access token válido no header Authorization: Bearer <token>.
// Em caso de sucesso, popula req.usuario = { id, papel, painelAdmin }.
export function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Token de acesso não informado' });
    }

    const token = header.slice(7);
    try {
        const payload = verifyAccessToken(token);
        req.usuario = { id: payload.sub, papel: payload.papel, painelAdmin: payload.painelAdmin === true };
        next();
    } catch (error) {
        return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }
}

// Dados sensíveis do painel (vendas, lista de atendimentos com dados de cliente).
// Passa quem tem a claim `painelAdmin` — que o SSO só emite quando o sistema de
// origem (deskcomm) afirma que a pessoa é admin lá — ou quem já é admin DESTE
// sistema. Nunca promove ninguém a 'admin' do bot: a claim só abre leitura.
// Deve vir depois de requireAuth.
export function requirePainelAdmin(req, res, next) {
    if (!req.usuario || !(req.usuario.painelAdmin || req.usuario.papel === 'admin')) {
        return res.status(403).json({ success: false, error: 'Sem permissão para acessar este recurso' });
    }
    next();
}

// Uso: requireRole('admin') ou requireRole('admin', 'funcionario')
export function requireRole(...papeis) {
    return (req, res, next) => {
        if (!req.usuario || !papeis.includes(req.usuario.papel)) {
            return res.status(403).json({ success: false, error: 'Sem permissão para acessar este recurso' });
        }
        next();
    };
}

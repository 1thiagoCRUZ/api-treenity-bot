import rateLimit from 'express-rate-limit';

// Login não tinha NENHUM limite de tentativas — um atacante podia tentar
// senhas sem parar (bcrypt atrasa cada tentativa, mas não impede automação).
// 10 tentativas / 15min por IP é generoso pra um usuário real que erra a senha
// algumas vezes, e inviabiliza força bruta.
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
    // Só conta tentativas que de fato falharam — login certo não deve
    // atrapalhar o próximo em redes com IP compartilhado (NAT de escritório).
    skipSuccessfulRequests: true,
});

// Rede de segurança geral pro resto da API — bem folgada de propósito pra não
// atrapalhar uso normal (painel com polling, várias pessoas atrás do mesmo IP).
export const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Muitas requisições. Tente novamente em instantes.' },
});

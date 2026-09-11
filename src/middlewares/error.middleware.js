// Último middleware da cadeia: qualquer erro não tratado explicitamente pelos
// controllers cai aqui. Loga o detalhe no servidor e nunca expõe error.message
// ao cliente (isso vazava detalhes internos do Postgres/Supabase — ver auditoria).
export function errorHandler(err, req, res, next) {
    console.error(`[Erro] ${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

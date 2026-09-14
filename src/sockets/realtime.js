// Ponte pequena entre partes da API que precisam emitir eventos em tempo real
// (ex: o controller de atendimentos) e a instância do Socket.io, que é criada
// em app.js. Evita import circular entre app.js e os controllers.
let io = null;

export function setIo(ioInstance) {
    io = ioInstance;
}

// Avisa qualquer painel conectado ao namespace /chat que um atendimento
// precisa de atenção humana. Não lança erro se o Socket.io ainda não tiver
// sido inicializado (ex: chamado fora do processo do servidor, em teste).
export function emitAlertaAtendimento(payload) {
    if (!io) return;
    io.of('/chat').emit('atendimento_sinalizado', payload);
}

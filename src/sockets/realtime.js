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

// Sala do painel admin: só entram sockets cujo token tem a claim `painelAdmin`
// (ou é admin do bot) — ver chat.socket.js. É o que impede um funcionário comum
// de receber avisos de vendas e atendimentos.
export const SALA_DO_PAINEL = 'painel-admin';

// Aviso de que algo mudou em mensagens/atendimentos/vendas (vem dos triggers do
// banco, via painel-listener.js). Só ids: o painel busca os detalhes pela API.
// Vai APENAS para a sala do painel, nunca para o namespace inteiro.
export function emitPainelEvento(payload) {
    if (!io) return;
    io.of('/chat').to(SALA_DO_PAINEL).emit('painel_evento', payload);
}

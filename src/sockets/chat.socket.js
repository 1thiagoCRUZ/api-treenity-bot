import { chatService } from '../services/chat.service.js';
import { verifyAccessToken } from '../utils/jwt.util.js';
import { SALA_DO_PAINEL } from './realtime.js';

export default function configureChatSockets(io) {
    const chatNamespace = io.of('/chat');

    // Exige um access token válido no handshake (io(url, { auth: { token } })).
    // Sem isso, qualquer cliente conseguia entrar em qualquer sala só informando um conversaId.
    chatNamespace.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Token de acesso não informado'));
        }
        try {
            const payload = verifyAccessToken(token);
            socket.usuario = { id: payload.sub, papel: payload.papel, painelAdmin: payload.painelAdmin === true };
            next();
        } catch (error) {
            next(new Error('Token inválido ou expirado'));
        }
    });

    chatNamespace.on('connection', (socket) => {
        console.log(`[Socket] Cliente conectado: ${socket.id} (usuário ${socket.usuario.id})`);

        // Avisos em tempo real de mensagens/atendimentos/vendas: só o painel admin
        // (mesma regra de requirePainelAdmin). A sala é decidida aqui, no servidor,
        // a partir do token — o cliente não escolhe entrar nela.
        if (socket.usuario.painelAdmin || socket.usuario.papel === 'admin') {
            socket.join(SALA_DO_PAINEL);
            // Confirma ao cliente que ele está na sala. É o que permite a um painel
            // saber que está "ao vivo" de verdade (e não só com o socket aberto) e
            // relaxar o polling de reserva.
            socket.emit('painel_pronto');
        }

        // Evento para entrar em uma sala de conversa específica
        socket.on('join_chat', async ({ adminId, funcionarioId, conversaId }) => {
            try {
                let roomId = conversaId;
                let conversa = null;

                if (!roomId && adminId && funcionarioId) {
                    // Só é possível criar/entrar numa conversa da qual você participa
                    if (![adminId, funcionarioId].includes(socket.usuario.id)) {
                        return socket.emit('chat_error', { error: 'Você só pode entrar em conversas das quais participa.' });
                    }
                    conversa = await chatService.getOrCreateChat(adminId, funcionarioId);
                    roomId = conversa.id;
                } else if (roomId) {
                    conversa = await chatService.getConversaById(roomId);
                }

                if (!conversa) {
                    return socket.emit('chat_error', { error: 'Conversa não encontrada.' });
                }

                // Confere que o usuário autenticado é de fato um dos participantes
                const ehParticipante = [conversa.adminId, conversa.funcionarioId].includes(socket.usuario.id);
                if (!ehParticipante) {
                    return socket.emit('chat_error', { error: 'Você não faz parte desta conversa.' });
                }

                socket.join(roomId);
                console.log(`[Socket] Cliente ${socket.id} entrou na conversa ${roomId}`);
                socket.emit('chat_joined', { success: true, conversa_id: roomId });
            } catch (error) {
                console.error('[Socket] Erro ao entrar no chat:', error.message);
                socket.emit('chat_error', { error: 'Falha ao conectar no chat.' });
            }
        });

        // Evento para enviar e retransmitir mensagem
        socket.on('send_message', async ({ conversaId, conteudo }) => {
            try {
                if (!conversaId || !conteudo) {
                    return socket.emit('chat_error', { error: 'Faltam dados para enviar a mensagem.' });
                }

                // Só permite enviar em salas que o socket já entrou via join_chat
                // (evita que um cliente mande mensagem numa conversa que nunca validamos)
                if (!socket.rooms.has(conversaId)) {
                    return socket.emit('chat_error', { error: 'Entre na conversa antes de enviar mensagens.' });
                }

                // remetenteId vem do token, nunca do payload enviado pelo cliente
                const mensagem = await chatService.saveMessage(conversaId, socket.usuario.id, conteudo);

                chatNamespace.to(conversaId).emit('receive_message', mensagem);
            } catch (error) {
                console.error('[Socket] Erro ao enviar mensagem:', error.message);
                socket.emit('chat_error', { error: 'Falha ao processar mensagem.' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`[Socket] Cliente desconectado: ${socket.id}`);
        });
    });
}

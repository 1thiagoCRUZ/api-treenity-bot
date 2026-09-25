import './config/env.js';

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { startCronJobs } from './cron/dashboard.cron.js';
import authRoutes from './routes/auth.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import chatRoutes from './routes/chat.routes.js';
import atendimentoRoutes from './routes/atendimento.routes.js';
import vendaRoutes from './routes/venda.routes.js';
import respostaRapidaRoutes from './routes/resposta-rapida.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';
import http from 'http';
import { Server } from 'socket.io';
import configureChatSockets from './sockets/chat.socket.js';
import { setIo } from './sockets/realtime.js';
import { iniciarPainelListener } from './realtime/painel-listener.js';

const app = express();
const server = http.createServer(app);

// Origens do frontend/demo que podem chamar a API com cookies (refresh token).
// Wildcard ("*") não funciona junto de credentials/cookies — precisa ser explícita.
// Aceita uma lista separada por vírgula (ex: várias portas/hosts usados em dev).
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function checkOrigin(origin, callback) {
    // Requisições sem "origin" (ex: curl, apps mobile) são liberadas
    if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
    }
    return callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
}

const io = new Server(server, {
    cors: {
        origin: checkOrigin,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Configura os sockets de chat
configureChatSockets(io);
setIo(io); // permite que controllers fora do socket (ex: atendimentos) emitam eventos
const porta = process.env.PORT || 3000;

app.use(cors({ origin: checkOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/atendimentos', atendimentoRoutes);
app.use('/api/vendas', vendaRoutes);
app.use('/api/respostas-rapidas', respostaRapidaRoutes);

app.use(errorHandler);

server.listen(porta, () => {
    console.log(`======================================================`);
    console.log(`Server is running on port ${porta}`);
    console.log(`Available endpoints:`);
    console.log(`   - POST http://localhost:${porta}/api/auth/login`);
    console.log(`   - POST http://localhost:${porta}/api/auth/refresh`);
    console.log(`   - POST http://localhost:${porta}/api/auth/logout`);
    console.log(`   - GET  http://localhost:${porta}/api/auth/me`);
    console.log(`   - POST http://localhost:${porta}/api/auth/sso`);
    console.log(`   - GET  http://localhost:${porta}/api/auth/usuarios`);
    console.log(`   - GET  http://localhost:${porta}/api/dashboard`);
    console.log(`   - GET  http://localhost:${porta}/api/dashboard/vendas`);
    console.log(`   - POST http://localhost:${porta}/api/dashboard/atualizar`);
    console.log(`   - POST http://localhost:${porta}/api/dashboard/atualizar-agendado`);
    console.log(`   - GET  http://localhost:${porta}/api/chat/conversas`);
    console.log(`   - POST http://localhost:${porta}/api/chat/init`);
    console.log(`   - GET  http://localhost:${porta}/api/chat/history/:conversaId`);
    console.log(`   - GET  http://localhost:${porta}/api/atendimentos`);
    console.log(`   - POST http://localhost:${porta}/api/atendimentos/sinalizar`);
    console.log(`   - POST http://localhost:${porta}/api/atendimentos/:id/encerrar`);
    console.log(`   - GET  http://localhost:${porta}/api/atendimentos/sinalizados`);
    console.log(`   - GET  http://localhost:${porta}/api/atendimentos/:id/mensagens`);
    console.log(`   - POST http://localhost:${porta}/api/vendas/:id/pagamento`);
    console.log(`   - GET  http://localhost:${porta}/api/respostas-rapidas`);
    console.log(`   - POST http://localhost:${porta}/api/respostas-rapidas`);
    console.log(`   - PATCH http://localhost:${porta}/api/respostas-rapidas/:id`);
    console.log(`   - DELETE http://localhost:${porta}/api/respostas-rapidas/:id`);
    console.log(`   - PUT  http://localhost:${porta}/api/respostas-rapidas/origem/:origemId`);
    console.log(`   - DELETE http://localhost:${porta}/api/respostas-rapidas/origem/:origemId`);
    console.log(`Sockets enabled at /chat namespace`);
    console.log(`======================================================`);
    startCronJobs();
    iniciarPainelListener(); // tempo real do painel admin (LISTEN no banco -> Socket.io)
});

export default app;

const API_BASE = 'http://localhost:3000';

let socket = null;
let accessToken = '';
let myId = '';
let targetId = '';
let currentRoomId = '';

const loginArea = document.getElementById('login-area');
const setupArea = document.getElementById('setup-area');
const chatArea = document.getElementById('chat-area');
const statusText = document.getElementById('connection-status');
const messagesList = document.getElementById('messages-list');
const btnLogin = document.getElementById('btn-login');
const btnConnect = document.getElementById('btn-connect');
const btnSend = document.getElementById('btn-send');
const messageInput = document.getElementById('message-input');
const loggedAsText = document.getElementById('logged-as');

const inputEmail = document.getElementById('login-email');
const inputSenha = document.getElementById('login-senha');
const inputTargetId = document.getElementById('target-id');

// Etapa 1: login — troca e-mail/senha por um access token (o refresh token
// fica num cookie httpOnly, o navegador cuida dele sozinho).
btnLogin.addEventListener('click', async () => {
    const email = inputEmail.value.trim();
    const senha = inputSenha.value;

    if (!email || !senha) {
        alert('Preencha e-mail e senha!');
        return;
    }

    btnLogin.innerText = 'Entrando...';
    btnLogin.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, senha })
        });

        const resData = await response.json();

        if (resData.success) {
            accessToken = resData.data.accessToken;
            myId = resData.data.usuario.id;

            loggedAsText.innerText = `Logado como ${resData.data.usuario.nome} (${resData.data.usuario.papel})`;
            loginArea.style.display = 'none';
            setupArea.style.display = 'block';
        } else {
            alert('Erro ao entrar: ' + resData.error);
        }
    } catch (err) {
        console.error(err);
        alert('Erro de comunicação com o servidor.');
    } finally {
        btnLogin.innerText = 'Entrar';
        btnLogin.disabled = false;
    }
});

// Etapa 2: iniciar/retomar uma conversa com outro usuário
btnConnect.addEventListener('click', async () => {
    targetId = inputTargetId.value.trim();

    if (!targetId) {
        alert('Informe o ID do destinatário!');
        return;
    }

    btnConnect.innerText = 'Conectando...';
    btnConnect.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/api/chat/init`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            credentials: 'include',
            body: JSON.stringify({ adminId: myId, funcionarioId: targetId })
        });

        const resData = await response.json();

        if (resData.success) {
            currentRoomId = resData.data.id;

            // Conecta o socket só agora, já autenticado com o access token
            socket = io(`${API_BASE}/chat`, { auth: { token: accessToken } });
            registerSocketHandlers();

            socket.on('connect', () => {
                socket.emit('join_chat', { conversaId: currentRoomId });
            });

            loadHistory(currentRoomId);
        } else {
            alert('Erro ao criar conversa: ' + resData.error);
        }
    } catch (err) {
        console.error(err);
        alert('Erro de comunicação com o servidor.');
    } finally {
        btnConnect.innerText = 'Iniciar Conversa';
        btnConnect.disabled = false;
    }
});

function registerSocketHandlers() {
    socket.on('chat_joined', (data) => {
        statusText.innerText = `Online (Sala: ${data.conversa_id.substring(0, 6)}...)`;
        statusText.style.color = '#86efac'; // green

        setupArea.style.display = 'none';
        chatArea.style.display = 'flex';
    });

    socket.on('chat_error', (data) => {
        alert('Erro no Chat: ' + data.error);
    });

    socket.on('receive_message', (mensagem) => {
        renderMessage(mensagem.conteudo, mensagem.remetenteId === myId, mensagem.criadoEm);
    });
}

// Funções Auxiliares
async function loadHistory(conversaId) {
    try {
        const response = await fetch(`${API_BASE}/api/chat/history/${conversaId}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            credentials: 'include'
        });
        const resData = await response.json();

        if (resData.success) {
            messagesList.innerHTML = ''; // limpa

            if (resData.data.length === 0) {
                renderSystemMessage('Nenhuma mensagem anterior. Comece a conversar!');
            } else {
                resData.data.forEach(msg => {
                    renderMessage(msg.conteudo, msg.remetenteId === myId, msg.criadoEm);
                });
            }
        }
    } catch (err) {
        console.error('Erro ao carregar histórico', err);
    }
}

function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || !socket) return;

    // remetenteId não é mais enviado — o servidor identifica quem envia pelo token
    socket.emit('send_message', {
        conversaId: currentRoomId,
        conteudo: text
    });

    messageInput.value = '';
    messageInput.focus();
}

btnSend.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function renderMessage(text, isMine, dateStr) {
    const div = document.createElement('div');
    div.className = `message ${isMine ? 'message-mine' : 'message-theirs'}`;

    const time = dateStr ? new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Texto como nó de texto (não innerHTML) para não executar HTML/script vindo de outro usuário
    const textNode = document.createTextNode(text);
    const meta = document.createElement('span');
    meta.className = 'message-meta';
    meta.innerText = time;

    div.appendChild(textNode);
    div.appendChild(meta);

    messagesList.appendChild(div);
    messagesList.scrollTop = messagesList.scrollHeight; // rola pro final
}

function renderSystemMessage(text) {
    const div = document.createElement('div');
    div.className = `message system-msg`;
    div.innerText = text;
    messagesList.appendChild(div);
}

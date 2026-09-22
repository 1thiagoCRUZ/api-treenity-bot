# API de monitoramento bot Treenity

Esta é a API backend responsável por alimentar o painel de métricas do sistema. 

## O Problema que Resolvemos

Geralmente, APIs de dashboards realizam consultas matemáticas complexas (`SUM`, `COUNT`) em tabelas com milhares de registros (como `vendas` ou `clientes`) toda vez que um usuário abre a tela. Isso gera lentidão e sobrecarrega o banco de dados.

## A Nossa Solução (Arquitetura)

Em vez de calcular os dados em tempo real, utilizamos Cron Jobs que rodam em segundo plano (background).

1. O Cron Job desperta de hora em hora.
2. Ele vai até as tabelas originais (`vendas`, `clientes`, `atendimentos`), faz os cálculos pesados em paralelo e gera um resumo do dia.
3. Esse resumo é salvo em uma tabela consolidada chamada `dashboard_metrics_diarias`.
4. Quando o Frontend requisita os dados, a nossa API REST faz apenas um simples `SELECT` nessa tabela consolidada, devolvendo a resposta em milissegundos.

## Tecnologias Utilizadas

- **Node.js com Express**: Criação do servidor e rotas REST.
- **Supabase (PostgreSQL)**: Banco de dados relacional (hospedagem apenas — todo o acesso a dados da API é feito via Drizzle, sem o SDK do Supabase).
- **Drizzle ORM + Drizzle Kit**: toda leitura/escrita (dashboard, chat e autenticação) passa pelo Drizzle, com schema e migrations versionadas em `src/db/schema.js` / `drizzle/`, conexão direta ao Postgres via `pg`.
- **JWT (jsonwebtoken) + refresh token com rotação**: Autenticação stateless — access token curto (15min) no header `Authorization`, refresh token (7 dias) em cookie httpOnly.
- **node-cron**: Agendador de tarefas em background.
- **dotenv**: Gerenciamento de variáveis de ambiente.

## Autenticação

Todas as rotas de `/api/dashboard` e `/api/chat` exigem um usuário autenticado (`Authorization: Bearer <accessToken>`). Não existe cadastro público — contas são criadas por um admin já autenticado, e o primeiro admin é criado via script (não pela API).

- `POST /api/auth/login` `{ email, senha }` → devolve `{ accessToken, usuario }` e grava o refresh token num cookie httpOnly.
- `POST /api/auth/refresh` → usa o cookie para rotacionar o refresh token e emitir um novo access token.
- `POST /api/auth/logout` → revoga o refresh token atual.
- `GET /api/auth/me` → dados do usuário autenticado (requer Bearer token).
- `GET /api/auth/usuarios` → lista `{ id, nome, papel }` dos usuários ativos (nunca e-mail/senha) — qualquer autenticado pode chamar; é o diretório usado pra escolher com quem iniciar uma conversa no chat.
- `POST /api/auth/usuarios` `{ nome, email, senha, papel? }` → cria um usuário; `papel` é opcional (`admin` ou `funcionario`, padrão `funcionario`); só admins autenticados podem chamar.

No Socket.io, conecte informando o token no handshake: `io(url, { auth: { token: accessToken } })`. Sem isso a conexão é recusada.

## Integração externa (SSO) — usando esta API como serviço de outro sistema

Este projeto foi pensado pra continuar existindo como um **serviço próprio**, consumido por outra aplicação (hoje o cenário concreto é o [deskcomm](https://github.com/thalena-lima/deskcomm), que cuidaria do funil de vendas, inbox de WhatsApp e telas). Duas partes desta API viram integração:

- **Dashboard** (`/api/dashboard*`): é só leitura de dados. A outra aplicação simplesmente chama essas rotas pra montar suas próprias telas de métrica — não precisa de nada especial além de autenticação.
- **Chat interno** (`/api/chat*` + Socket.io): é um sistema vivo (conexões abertas, mensagens em tempo real, criptografia), por isso continua rodando como processo/serviço à parte, e a outra aplicação conecta nele como cliente.

O problema que isso cria: o funcionário já fez login **no outro sistema** (lá, com o método de autenticação dele). Ele não deveria ter que logar de novo aqui só pra ver métricas ou abrir o chat. É pra isso que existe a rota de SSO.

### Como funciona o `POST /api/auth/sso`

É uma "ponte de confiança" **entre backends**, nunca entre o navegador do usuário e esta API diretamente:

```
1. Funcionário loga no deskcomm (com o sistema de auth deles)
2. O BACKEND do deskcomm (nunca o navegador) chama:

   POST /api/auth/sso
   Header:  X-SSO-Secret: <segredo compartilhado, só os dois backends conhecem>
   Body:    { "email": "funcionario@empresa.com", "nome": "Nome do Funcionário" }

3. Esta API:
   - confere o segredo (se não bater, 401 — ninguém sem o segredo passa)
   - procura um usuário com esse e-mail; se não existir, cria um novo com
     papel "funcionario" (nunca "admin" — promoção continua sendo manual,
     feita dentro deste sistema, pra ninguém virar admin por engano ou bug
     do outro lado)
   - se o corpo trouxer `painel_admin: true` (o sistema de origem afirmando que
     a pessoa é admin LÁ), o accessToken ganha a claim `painelAdmin`, que abre
     só a leitura de vendas e da lista de atendimentos — o papel continua
     "funcionario". Sem o campo (ou `false`), sem a claim. A claim vive só no
     accessToken de 15 min: some numa renovação por refresh e precisa ser
     reafirmada por um novo SSO
   - se o usuário já existe e o `nome` recebido é diferente do gravado, atualiza
     o nome (quem renomeia o perfil no deskcomm aparece com o nome novo na lista
     do chat). Um `nome` vazio ou igual ao e-mail — o que o outro lado manda
     quando a pessoa não tem nome — nunca sobrescreve um nome de verdade
   - gera um accessToken (JWT, 15min) e um refreshToken (7 dias), do mesmo
     jeito que um login normal geraria

4. Devolve no corpo da resposta (não em cookie — é uma resposta pro backend
   do deskcomm, não pro navegador do usuário; um cookie aqui nunca chegaria
   no navegador de ninguém):

   { "accessToken": "...", "refreshToken": "...", "usuario": { ... } }

5. O backend do deskcomm repassa o accessToken pro frontend dele (na sessão
   daquele usuário), que passa a usar esse token pra:
   - chamar GET /api/dashboard, /api/dashboard/vendas (header Authorization)
   - conectar no Socket.io do chat (io(url, { auth: { token } }))
```

### Renovando o token

O `accessToken` dura só 15 minutos (igual o de um login normal). Como isso é uma integração server-to-server, o jeito mais simples é o backend do deskcomm **chamar `/api/auth/sso` de novo** quando precisar — não expusemos o fluxo de cookie de `/api/auth/refresh` pra isso porque cookie não atravessa domínios diferentes de servidor pra servidor. O `refreshToken` devolvido no passo 4 fica disponível caso façam sentido evoluir isso depois, mas não é obrigatório usar.

### Segurança — o que isso exige de cuidado

- **`SSO_SHARED_SECRET` nunca pode existir em código de frontend/navegador.** Quem tiver esse segredo consegue gerar um token válido pra qualquer e-mail — por isso essa chamada só pode partir de um backend confiável, nunca do browser do usuário final.
- A comparação do segredo é em tempo constante (`crypto.timingSafeEqual`), pra não vazar informação por diferença de tempo de resposta.
- Contas criadas via SSO entram sempre como `funcionario`; virar `admin` é uma ação separada, feita por um admin já existente via `POST /api/auth/usuarios` — o SSO nunca decide isso sozinho.
- Configure `SSO_SHARED_SECRET` no `.env` (veja `.env.example`) e combine o mesmo valor do lado do deskcomm.

## Painel admin — lista de atendimentos

- `GET /api/atendimentos` → todos os atendimentos (cliente ↔ IA), do mais ativo pro menos, com o resumo de cada um numa linha. Restrito ao **painel admin** (claim `painelAdmin` do SSO, ou admin deste sistema; senão `403`).
  - **Filtros (query):** `canal`, `etapa` (etapa do funil, ex: `Proposta`, `Fechada`), `com_venda` (`true`/`false`), `desde` (inclusivo) / `ate` (exclusivo) sobre a última atividade, `limit` (padrão 30, máx. 100) e `cursor` (o `proximoCursor` da resposta anterior).
  - **Resposta:** `{ success, data: [...], proximoCursor }`, com `proximoCursor: null` na última página. Cada item:
    `{ id, cliente: { id, nome, idFace }, canal, origem, statusFunil, qualidadeIa, categoriaFeedback, precisaAtencaoHumana, criadoEm, atualizadoEm, totalMensagens, ultimaMensagem: { remetente, formato, conteudo (prévia de 140 caracteres), enviadoEm } | null, venda: { quantidade, total } | null }`.
  - A transcrição completa de um atendimento continua em `GET /api/atendimentos/:id/mensagens`.
- O painel admin também inclui `GET /api/dashboard/vendas` (ver a seção do dashboard).
- **Paginação por cursor:** o cursor é opaco (não monte à mão). Ele guarda a última atividade com precisão de microssegundo, então linhas gravadas no mesmo milissegundo (o n8n grava várias por segundo) não são puladas nem repetidas.

### Painel admin — tempo real

O painel recebe avisos ao vivo quando o n8n grava mensagens, atendimentos ou vendas — sem polling.

- **Como funciona:** o n8n grava direto no Postgres (não passa por esta API), então o gancho é do banco. Triggers (`drizzle/0006_painel_tempo_real.sql`) fazem `pg_notify('treenity_painel', ...)` a cada gravação; o bot mantém **uma conexão dedicada em `LISTEN`** (`src/realtime/painel-listener.js`) e converte cada aviso num evento Socket.io. Nada muda no n8n.
- **Evento:** `painel_evento` no namespace `/chat`, com `{ tipo: 'mensagem' | 'atendimento' | 'venda', op: 'INSERT' | 'UPDATE' | 'DELETE', id, atendimentoId }`. **Só ids** — nenhum dado de cliente trafega no aviso; o painel busca os detalhes pela API, que confere a permissão. Mensagens só geram `INSERT`.
- **Quem recebe:** só sockets cujo token tem a claim `painelAdmin` (ou é admin do bot). A sala (`painel-admin`) é decidida pelo servidor no handshake — o cliente não escolhe entrar. Funcionário sem a claim não recebe nada. Quem entra na sala recebe o evento `painel_pronto`, que confirma que os avisos vão chegar (o cliente pode então relaxar o polling de reserva).
- **`{ tipo: 'reconectado' }`:** enviado quando o `LISTEN` cai e volta (heartbeat de 30 s, reconexão com espera crescente de 1 a 30 s). Avisos emitidos enquanto a conexão estava fora se perdem, então o painel deve buscar tudo de novo ao receber este evento.
- **Latência medida:** poucos milissegundos do banco ao socket.
- **Render free:** com o serviço dormindo o `LISTEN` também dorme; ao acordar ele reconecta e manda `reconectado`. Mantenha um polling de reserva no cliente.
- **Requisito:** `LISTEN` precisa de conexão de sessão — a `DATABASE_URL` do Session Pooler do Supabase serve; o pooler em modo transação, não.

## Chat interno — conversas

Além do Socket.io (namespace `/chat`), o chat tem três rotas REST, todas com `Authorization: Bearer <accessToken>` e restritas às conversas de que o usuário autenticado participa:

- `GET /api/chat/conversas` → lista as conversas do usuário, da mais recente pra mais antiga: `[{ id, atualizadoEm, outroUsuario: { id, nome, papel }, ultimaMensagem: { id, remetenteId, conteudo, criadoEm } | null }]`. `conteudo` vem descriptografado e truncado em 140 caracteres (`null` se a mensagem estiver ilegível); `ultimaMensagem` é `null` em conversa aberta que ainda não teve mensagem. Conversas cujo outro participante não existe mais ou está inativo ficam de fora. Serve pra montar a lista lateral do chat.
- `POST /api/chat/init` `{ adminId, funcionarioId }` → busca ou cria a conversa entre dois usuários (o autenticado precisa ser um deles).
- `GET /api/chat/history/:conversaId` → histórico completo, descriptografado, do mais antigo pro mais novo.

## Atendimentos — sinalização para intervenção humana

O bot de atendimento (n8n — ver `n8n/README.md`) detecta quando um cliente precisa de um humano (pedido insistente de desconto, muito irritado, etc.) e chama esta API para sinalizar o atendimento e avisar o painel em tempo real.

- `POST /api/atendimentos/sinalizar` `{ id_face, motivo }` → marca o atendimento **aberto** daquele cliente como precisando de atenção humana e emite o evento `atendimento_sinalizado` no namespace `/chat` do Socket.io (payload: `{ atendimentoId, clienteNome, canal, motivo, sinalizadoEm }`). Chamada server-to-server, autenticada por `X-N8N-Secret` (segredo próprio, `N8N_SHARED_SECRET`) — nunca por login de usuário. 404 se o cliente não tiver nenhum atendimento aberto.
- `POST /api/atendimentos/:id/encerrar` → fecha manualmente um atendimento (`status_funil = 'Fechada'`); qualquer usuário autenticado pode chamar. É assim que a IA volta a atender aquele cliente: a próxima mensagem dele abre um atendimento novo, sem a sinalização (mesma regra que já impede dois atendimentos abertos ao mesmo tempo).
- `GET /api/atendimentos/sinalizados` → lista os atendimentos sinalizados que ainda estão abertos (`clienteNome`, `idFace`, `canal`, `motivo`, `sinalizadoEm`) — pro painel montar uma tela de "conversas precisando de atenção" sem depender só de ter capturado o evento em tempo real no momento exato em que ele disparou.
- `GET /api/atendimentos/:id/mensagens` → transcrição completa (cliente + bot) de um atendimento específico, do mais antigo pro mais recente, junto com o contexto do atendimento (cliente, canal, se está sinalizado). É o que permite ir do alerta (que só traz o `atendimentoId`) direto pra conversa real — a ideia é o **deskcomm montar essa tela com os dados dele próprio**, mas essas duas rotas existem como caminho alternativo caso ele não tenha isso pronto para os dados deste bot.

Detalhe completo do fluxo (por que existe, o que muda no lado do n8n) em `n8n/README.md`.

## Estrutura do Projeto

O código está dividido por responsabilidades para facilitar a manutenção:

```
/src
├── app.js                 # Ponto de entrada (sobe o servidor e ativa o cron)
├── config/
│   └── env.js              # Carrega o .env uma única vez (dotenv)
├── db/
│   ├── schema.js            # Definição das tabelas + relations (Drizzle)
│   ├── client.js            # Instância de conexão com o Postgres (Drizzle)
│   ├── migrate.js           # Script que aplica as migrations
│   └── seed-admin.js        # Cria o primeiro usuário admin
├── cron/
│   └── dashboard.cron.js    # Regras de agendamento de tempo (quando rodar)
├── middlewares/
│   ├── auth.middleware.js   # requireAuth / requireRole
│   ├── sso.middleware.js     # segredo compartilhado do /api/auth/sso
│   ├── n8n.middleware.js      # segredo compartilhado do /api/atendimentos/sinalizar
│   ├── asyncHandler.js
│   └── error.middleware.js
├── controllers/              # Lida com a requisição da rota e devolve o JSON
├── routes/                   # Mapeamento das URLs (Endpoints) da API
├── services/                  # Regras de negócio e consultas ao banco (Drizzle)
├── sockets/
│   ├── chat.socket.js        # Autenticação e regras do namespace /chat
│   └── realtime.js            # Ponte para emitir eventos fora do socket (ex: alertas de atendimento)
└── utils/
    ├── crypto.util.js         # Criptografia das mensagens do chat
    └── jwt.util.js             # Assinatura/verificação do access token
```

Tabelas gerenciadas pelo Drizzle (`src/db/schema.js`, migrations em `drizzle/`): `usuarios`, `refresh_tokens`, `chat_conversas`, `chat_mensagens`, além de `clientes`, `atendimentos`, `vendas`, `mensagens` e `dashboard_metrics_diarias`, que já existiam no banco e foram trazidas para o schema.

## Como Configurar e Rodar Localmente

### 1. Clonando e Instalando Dependências

No seu terminal, rode:

```bash
npm install
```

### 2. Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha com as credenciais reais (veja os comentários de cada variável no próprio arquivo):

```
PORT, NODE_ENV, CORS_ORIGIN
DATABASE_URL        # connection string do Postgres — use a do "Session pooler" (Project Settings > Database > Connect)
ENCRYPTION_KEY
JWT_ACCESS_SECRET
SSO_SHARED_SECRET   # só necessária se algum backend externo (ex: deskcomm) for usar /api/auth/sso
N8N_SHARED_SECRET   # só necessária se o n8n do bot for usar /api/atendimentos/sinalizar
CRON_SHARED_SECRET  # só necessária se algum agendador externo for usar /api/dashboard/atualizar-agendado
```

### 3. Migrations e primeiro usuário admin

Com `DATABASE_URL` configurada, aplique as migrations do Drizzle e crie o primeiro admin:

```bash
npm run db:migrate
npm run db:seed-admin -- "Seu Nome" seu-email@exemplo.com senhaForte123
```

Sempre que o schema em `src/db/schema.js` mudar, gere uma nova migration com `npm run db:generate` antes de rodar `npm run db:migrate` de novo.

### 4. Rodando o Servidor

Para iniciar a API em modo de desenvolvimento (com auto-reload):

```bash
npm run dev
```

> O servidor iniciará na porta 3000 e o Cron Job será ativado no background. Todas as rotas abaixo (exceto as de `/api/auth`) exigem login — veja a seção [Autenticação](#autenticação).

## Endpoints da API

Abaixo estão as rotas disponíveis para consumo pelo Frontend.

### Buscar Métricas do Dashboard

Retorna os dados já processados dos últimos 30 dias. Leitura ultrarrápida.

- **Rota**: `GET /api/dashboard`
- **Resposta de Sucesso (200 OK)**:

```json
{
  "success": true,
  "data": [
    {
      "data_referencia": "2026-07-28",
      "total_clientes": 150,
      "total_atendimentos": 85,
      "faturamento_total": 5240.50,
      "atualizado_em": "2026-07-28T10:05:00.000Z"
    }
  ]
}
```

### Forçar Atualização de Métricas

Aciona manualmente o serviço de cálculo sem precisar esperar a próxima execução agendada do Cron Job. Útil para testes ou para botões de "Sincronizar Agora" no painel admin.

- **Rota**: `POST /api/dashboard/atualizar`
- **Resposta de Sucesso (200 OK)**:

```json
{
  "success": true,
  "message": "Dashboard atualizado à força com sucesso!"
}
```

#### Variante para agendador externo

Mesma ação acima, mas pensada para ser chamada por um agendador externo (ex: o workflow agendado em `.github/workflows/metrics-cron.yml`, que substitui o Cron Job do Render — plano free não suporta esse tipo de serviço lá) em vez de um admin logado.

- **Rota**: `POST /api/dashboard/atualizar-agendado`
- **Autenticação**: header `X-Cron-Secret` com o valor de `CRON_SHARED_SECRET` (em vez de Bearer token). Sem essa variável configurada no ambiente, a rota responde `501`.

### Confirmar pagamento de uma venda

Quando o bot fecha uma venda por PIX ele só envia a chave — **a API não valida o pagamento**. Um admin confere no banco e marca a venda como paga; o deskcomm faz isso quando o admin conclui a tarefa "Conferir pagamento PIX" (criada automaticamente para cada venda nova).

- **Rota**: `POST /api/vendas/:id/pagamento` (`:id` é o `id_venda` de `GET /api/dashboard/vendas`)
- **Autenticação**: header `X-SSO-Secret` (o mesmo segredo do SSO) — chamada **server-to-server**, nunca do navegador. O deskcomm só a faz depois de confirmar que quem concluiu a tarefa é admin.
- **Body**: `{ "pago": true, "confirmado_por": "admin@exemplo.com" }` marca como `Paga` (`confirmado_por` é obrigatório); `{ "pago": false }` desfaz.
- **Idempotente**: repetir a chamada não altera nada (`"alterou": false`). Desfazer só age se a venda ainda está `Paga` — se o n8n já a levou para outro status, ele não é sobrescrito.
- **Efeito**: `status_venda` vira `Paga` e `pago_em` / `pagamento_confirmado_por` são preenchidos (aparecem em `GET /api/dashboard/vendas`). O trigger de `vendas` avisa o painel ao vivo.
- **Erros**: `400` (id ou body inválido), `401` (segredo), `404` (venda não existe), `501` (SSO não configurado).

**Listar vendas aguardando pagamento** (para o deskcomm criar as tarefas): `GET /api/vendas/aguardando-pagamento?desde=<ISO>&limit=&cursor=` — também com `X-SSO-Secret`; devolve `{ success, count, proximo_cursor, data }` com o mesmo formato de `GET /api/dashboard/vendas`, só das vendas criadas a partir de `desde` (obrigatório).

### Buscar Detalhes das Vendas (com Atendimentos e Clientes)

Retorna a lista detalhada das vendas com informações enriquecidas de seus respectivos atendimentos (canais, avaliações, métricas e insights de IA) e clientes (nome, CEP, resumo de perfil e redes sociais).

- **Rota**: `GET /api/dashboard/vendas`
- **Acesso**: restrito ao **painel admin** — token com a claim `painelAdmin` (emitida pelo `POST /api/auth/sso` quando o sistema de origem manda `painel_admin: true`) ou usuário admin deste sistema. Sem isso: `403`. Traz nome, CEP e itens do cliente, por isso não fica aberto a qualquer autenticado.
- **Parâmetros de Consulta Opcionais (Query Params)**:
  - `limit`: Quantidade de vendas por página (padrão: `50`, máximo: `200`)
  - `cursor`: Cursor da próxima página (o `proximo_cursor` da resposta anterior)
  - `status`: Filtrar pelo status da venda (ex: `Aguardando Pagamento`, `Fechada`)
  - `canal`: Filtrar por canal de atendimento (ex: `Facebook`, `WhatsApp`)
  - `desde` / `ate`: Período pela data da venda (`desde` inclusivo, `ate` exclusivo; ex: `desde=2026-09-01&ate=2026-10-01`)
- **O `resumo` cobre todas as vendas que casam com os filtros**, não só a página — os totais não mudam ao paginar. `proximo_cursor` é `null` na última página.
- **Resposta de Sucesso (200 OK)**:

```json
{
  "success": true,
  "count": 1,
  "proximo_cursor": null,
  "resumo": {
    "quantidade": 1,
    "faturamento_total": 30.00,
    "frete_total": 15.00,
    "valor_produtos_total": 15.00,
    "ticket_medio": 30.00
  },
  "data": [
    {
      "id_venda": "ddceedb8-89c7-4838-8dc9-7badbe4b...",
      "data_venda": "2026-07-08T01:03:29.000Z",
      "cliente": "Mario",
      "cep": "17525-181",
      "canal": "Facebook",
      "itens": "1x Adubo NPK 10-10-10 1kg",
      "frete": 15.00,
      "total": 30.00,
      "status": "Aguardando Pagamento",
      "transportadora": "PAC",
      "valor_produtos": 15.00,
      "cliente_detalhes": {
        "id": "26dab5fd-e453-467a-b61d-8e86352f...",
        "nome": "Mario",
        "cep_padrao": "17525-181",
        "id_face": "36197839983165176",
        "resumo": null,
        "cliente_desde": "2026-07-08T01:01:06.675Z"
      },
      "atendimento_detalhes": {
        "id": "c18c2d37-a2db-4d94-ab64-928afc59...",
        "canal": "Facebook",
        "status_funil": "Fechada",
        "iniciado_em": "2026-07-08T01:01:06.000Z",
        "nota_feedback": 9,
        "categoria_feedback": "Excelente",
        "qualidade_ia": null,
        "insights_ia": null
      }
    }
  ]
}
```
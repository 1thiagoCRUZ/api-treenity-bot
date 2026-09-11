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
- `POST /api/auth/usuarios` `{ nome, email, senha, papel? }` → cria um usuário; `papel` é opcional (`admin` ou `funcionario`, padrão `funcionario`); só admins autenticados podem chamar.

No Socket.io, conecte informando o token no handshake: `io(url, { auth: { token: accessToken } })`. Sem isso a conexão é recusada.

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
│   ├── asyncHandler.js
│   └── error.middleware.js
├── controllers/              # Lida com a requisição da rota e devolve o JSON
├── routes/                   # Mapeamento das URLs (Endpoints) da API
├── services/                  # Regras de negócio e consultas ao banco (Drizzle)
├── sockets/
│   └── chat.socket.js        # Autenticação e regras do namespace /chat
└── utils/
    ├── crypto.util.js         # Criptografia das mensagens do chat
    └── jwt.util.js             # Assinatura/verificação do access token
```

Tabelas gerenciadas pelo Drizzle (`src/db/schema.js`, migrations em `drizzle/`): `usuarios`, `refresh_tokens`, `chat_conversas`, `chat_mensagens`, além de `clientes`, `atendimentos`, `vendas` e `dashboard_metrics_diarias`, que já existiam no banco e foram trazidas para o schema.

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

### Buscar Detalhes das Vendas (com Atendimentos e Clientes)

Retorna a lista detalhada das vendas com informações enriquecidas de seus respectivos atendimentos (canais, avaliações, métricas e insights de IA) e clientes (nome, CEP, resumo de perfil e redes sociais).

- **Rota**: `GET /api/dashboard/vendas`
- **Parâmetros de Consulta Opcionais (Query Params)**:
  - `limit`: Quantidade de vendas retornadas (padrão: `50`)
  - `status`: Filtrar pelo status da venda (ex: `Aguardando Pagamento`, `Fechada`)
  - `canal`: Filtrar por canal de atendimento (ex: `Facebook`, `WhatsApp`)
- **Resposta de Sucesso (200 OK)**:

```json
{
  "success": true,
  "count": 1,
  "resumo": {
    "faturamento_total": 30.00,
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
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
- **Supabase (PostgreSQL)**: Banco de dados relacional.
- **node-cron**: Agendador de tarefas em background.
- **dotenv**: Gerenciamento de variáveis de ambiente.

## Estrutura do Projeto

O código está dividido por responsabilidades para facilitar a manutenção:

```
/src
├── app.js                 # Ponto de entrada (sobe o servidor e ativa o cron)
├── config/                
│   └── supabase.js        # Instância de conexão com o banco de dados
├── cron/                  
│   └── dashboardCron.js   # Regras de agendamento de tempo (quando rodar)
├── controllers/           
│   └── dashboardController.js # Lida com a requisição da rota e devolve o JSON
├── routes/                
│   └── dashboardRoutes.js # Mapeamento das URLs (Endpoints) da API
└── services/              
    └── dashboardService.js # Regras de negócio e comunicação pesada com o banco (SQL)
```

## Como Configurar e Rodar Localmente

### 1. Preparando o Banco de Dados 

Antes de rodar o código, você precisa criar a tabela que vai receber os dados consolidados. Vá no SQL Editor do seu Supabase e execute:

```sql
CREATE TABLE dashboard_metrics_diarias (
    data_referencia DATE PRIMARY KEY,
    total_clientes INT DEFAULT 0,
    total_atendimentos INT DEFAULT 0,
    faturamento_total DECIMAL(10,2) DEFAULT 0,
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. Clonando e Instalando Dependências

No seu terminal, rode:

```bash
npm install
```

### 3. Variáveis de Ambiente

Crie um arquivo chamado `.env` na raiz do projeto e preencha com as credenciais do seu projeto Supabase:

```
PORT=3000
SUPABASE_URL=sua_url_do_supabase_aqui
SUPABASE_ANON_KEY=sua_anon_key_do_supabase_aqui
```

### 4. Rodando o Servidor

Para iniciar a API em modo de desenvolvimento (com auto-reload):

```bash
npm run dev
```

> O servidor iniciará na porta 3000 e o Cron Job será ativado no background.

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
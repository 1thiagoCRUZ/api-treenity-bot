import { sql, relations } from 'drizzle-orm';
import {
    pgTable,
    pgEnum,
    uuid,
    bigserial,
    text,
    varchar,
    boolean,
    timestamp,
    date,
    integer,
    smallint,
    numeric,
    jsonb,
    index,
    uniqueIndex,
    unique,
    check,
} from 'drizzle-orm/pg-core';

// Gera UUIDs usando a extensão uuid-ossp já disponível no Supabase
// (o mesmo padrão usado em chat_schema.sql, no schema `extensions`).
const uuidDefault = sql`extensions.uuid_generate_v4()`;

export const papelUsuarioEnum = pgEnum('papel_usuario', ['admin', 'funcionario']);

export const usuarios = pgTable('usuarios', {
    id: uuid('id').primaryKey().default(uuidDefault),
    nome: text('nome').notNull(),
    email: text('email').notNull().unique(),
    senhaHash: text('senha_hash').notNull(),
    papel: papelUsuarioEnum('papel').notNull(),
    ativo: boolean('ativo').notNull().default(true),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable(
    'refresh_tokens',
    {
        id: uuid('id').primaryKey().default(uuidDefault),
        usuarioId: uuid('usuario_id')
            .notNull()
            .references(() => usuarios.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
        userAgent: text('user_agent'),
        expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
        revogadoEm: timestamp('revogado_em', { withTimezone: true }),
        criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index('idx_refresh_tokens_token_hash').on(table.tokenHash),
        index('idx_refresh_tokens_usuario_id').on(table.usuarioId),
    ]
);

// ---------------------------------------------------------------------------
// Tabelas abaixo já existiam no banco (criadas pelo bot / por chat_schema.sql,
// fora deste repositório). Os campos batem com o schema real, obtido via
// `drizzle-kit pull` — mantidos aqui só os usados por esta API de monitoramento.
// ---------------------------------------------------------------------------

export const chatConversas = pgTable(
    'chat_conversas',
    {
        id: uuid('id').primaryKey().default(uuidDefault),
        adminId: text('admin_id').notNull(),
        funcionarioId: text('funcionario_id').notNull(),
        criadoEm: timestamp('criado_em', { withTimezone: true })
            .notNull()
            .default(sql`timezone('utc'::text, now())`),
        atualizadoEm: timestamp('atualizado_em', { withTimezone: true })
            .notNull()
            .default(sql`timezone('utc'::text, now())`),
    },
    (table) => [unique('chat_conversas_admin_id_funcionario_id_key').on(table.adminId, table.funcionarioId)]
);

export const chatMensagens = pgTable(
    'chat_mensagens',
    {
        id: uuid('id').primaryKey().default(uuidDefault),
        conversaId: uuid('conversa_id')
            .notNull()
            .references(() => chatConversas.id, { onDelete: 'cascade' }),
        remetenteId: text('remetente_id').notNull(),
        conteudoCriptografado: text('conteudo_criptografado').notNull(),
        criadoEm: timestamp('criado_em', { withTimezone: true })
            .notNull()
            .default(sql`timezone('utc'::text, now())`),
    },
    (table) => [index('idx_chat_mensagens_conversa_id').on(table.conversaId)]
);

export const clientes = pgTable(
    'clientes',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        idFace: varchar('id_face').notNull(),
        nome: varchar('nome'),
        cepPadrao: varchar('cep_padrao'),
        criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow(),
        resumo: text('resumo'),
        contaId: varchar('conta_id'),
        empresa: varchar('empresa'),
        tipoCliente: varchar('tipo_cliente'),
        username: varchar('username'),
    },
    (table) => [
        index('idx_clientes_conta').on(table.contaId),
        unique('clientes_id_face_key').on(table.idFace),
    ]
);

export const atendimentos = pgTable(
    'atendimentos',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        clienteId: uuid('cliente_id').references(() => clientes.id, { onDelete: 'cascade' }),
        canal: varchar('canal').default('Facebook'),
        statusFunil: varchar('status_funil').default('Iniciou'),
        notaFeedback: smallint('nota_feedback'),
        categoriaFeedback: varchar('categoria_feedback'),
        qualidadeIa: numeric('qualidade_ia', { precision: 3, scale: 1, mode: 'number' }),
        insightsIa: jsonb('insights_ia'),
        criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow(),
        atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow(),
        contaId: varchar('conta_id'),
        origem: varchar('origem'),
        categoriaComentario: varchar('categoria_comentario'),
        // Sinalização de atendimento sensível (cliente pedindo desconto
        // insistentemente, muito irritado, etc.) — enquanto true, a IA do bot
        // para de responder esse cliente até um humano fechar o atendimento.
        precisaAtencaoHumana: boolean('precisa_atencao_humana').notNull().default(false),
        motivoAtencao: varchar('motivo_atencao'),
        atencaoSinalizadaEm: timestamp('atencao_sinalizada_em', { withTimezone: true }),
    },
    (table) => [index('idx_atendimentos_conta').on(table.contaId, table.criadoEm)]
);

// Log de conversa cliente↔bot (WhatsApp/Facebook/Instagram), escrito pelo n8n.
// Sem criptografia — diferente de chat_mensagens (chat interno entre funcionários).
export const mensagens = pgTable(
    'mensagens',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        atendimentoId: uuid('atendimento_id').references(() => atendimentos.id, { onDelete: 'cascade' }),
        remetente: varchar('remetente'),
        conteudo: text('conteudo'),
        enviadoEm: timestamp('enviado_em', { withTimezone: true }).defaultNow(),
        formato: varchar('formato'),
    },
    // Transcrição de um atendimento, "última mensagem" e contagem por atendimento
    // (lista do painel): sem isso cada uma varreria a tabela inteira.
    (table) => [index('idx_mensagens_atendimento').on(table.atendimentoId, table.enviadoEm)]
);

export const vendas = pgTable(
    'vendas',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        atendimentoId: uuid('atendimento_id').references(() => atendimentos.id, { onDelete: 'cascade' }),
        itensPedido: text('itens_pedido'),
        valorProdutos: numeric('valor_produtos', { precision: 10, scale: 2, mode: 'number' }),
        valorFrete: numeric('valor_frete', { precision: 10, scale: 2, mode: 'number' }),
        valorTotal: numeric('valor_total', { precision: 10, scale: 2, mode: 'number' }),
        transportadora: varchar('transportadora'),
        statusVenda: varchar('status_venda').default('Aguardando Pagamento'),
        criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow(),
        // Preenchidos quando um admin confere o pagamento no painel (a API não
        // valida PIX sozinha). Ver POST /api/vendas/:id/pagamento.
        pagoEm: timestamp('pago_em', { withTimezone: true }),
        pagamentoConfirmadoPor: varchar('pagamento_confirmado_por'),
    },
    (table) => [
        // "Tem venda?" e vendas por atendimento (lista de atendimentos do painel).
        index('idx_vendas_atendimento').on(table.atendimentoId),
        // Paginação por cursor da lista de vendas (mais recentes primeiro).
        index('idx_vendas_criado').on(table.criadoEm, table.id),
    ]
);

// Texto que a loja escreve e o bot manda SEM chamar o modelo, quando a mensagem
// do cliente contém um dos gatilhos. O n8n lê direto desta tabela a cada
// mensagem (colar-no-n8n/11-Buscar-Resposta-Rapida.sql, no repo do n8n); esta
// API só faz o CRUD para o dono editar pela tela do deskcomm.
// Já existia no banco (criada via SQL do n8n).
export const respostasRapidas = pgTable(
    'respostas_rapidas',
    {
        id: bigserial('id', { mode: 'number' }).primaryKey(),
        // NULL = vale para qualquer conta.
        contaId: varchar('conta_id'),
        titulo: varchar('titulo').notNull(),
        // Aceita o marcador [cumprimento] (o n8n troca por Bom dia/Boa tarde/Boa noite).
        corpo: text('corpo').notNull(),
        // Frases do CLIENTE, já normalizadas como normalizar_texto() do banco.
        gatilhos: text('gatilhos').array().notNull().default(sql`'{}'::text[]`),
        contexto: varchar('contexto').notNull().default('qualquer'),
        midiaChave: varchar('midia_chave'),
        prioridade: integer('prioridade').notNull().default(100),
        maxCharsMsg: integer('max_chars_msg').notNull().default(60),
        ativo: boolean('ativo').notNull().default(true),
        criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
        atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).notNull().defaultNow(),
        // id da resposta salva (message_templates) no deskcomm, que espelha para
        // cá a cada salvamento. NULL = criada direto aqui (SQL ou esta API); o
        // espelho nunca toca nessas.
        origemId: uuid('origem_id'),
    },
    (table) => [
        uniqueIndex('respostas_rapidas_origem_uidx').on(table.origemId).where(sql`${table.origemId} is not null`),
        index('idx_respostas_rapidas_busca').on(table.ativo, table.contexto, table.prioridade),
        index('idx_respostas_rapidas_gatilhos').using('gin', table.gatilhos),
        check('respostas_rapidas_contexto_check', sql`${table.contexto} in ('abertura', 'qualquer')`),
    ]
);

export const dashboardMetricsDiarias = pgTable('dashboard_metrics_diarias', {
    dataReferencia: date('data_referencia').primaryKey(),
    totalClientes: integer('total_clientes').default(0),
    totalAtendimentos: integer('total_atendimentos').default(0),
    faturamentoTotal: numeric('faturamento_total', { precision: 10, scale: 2, mode: 'number' }).default(0),
    atualizadoEm: timestamp('atualizado_em', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations — habilitam a query API relacional do Drizzle (db.query.vendas.findMany
// com "with"), usada em dashboard.service.js para reproduzir o embed aninhado
// vendas -> atendimentos -> clientes que antes era feito via supabase-js.
// ---------------------------------------------------------------------------

export const chatConversasRelations = relations(chatConversas, ({ many }) => ({
    mensagens: many(chatMensagens),
}));

export const chatMensagensRelations = relations(chatMensagens, ({ one }) => ({
    conversa: one(chatConversas, { fields: [chatMensagens.conversaId], references: [chatConversas.id] }),
}));

export const clientesRelations = relations(clientes, ({ many }) => ({
    atendimentos: many(atendimentos),
}));

export const atendimentosRelations = relations(atendimentos, ({ one, many }) => ({
    cliente: one(clientes, { fields: [atendimentos.clienteId], references: [clientes.id] }),
    vendas: many(vendas),
    mensagens: many(mensagens),
}));

export const vendasRelations = relations(vendas, ({ one }) => ({
    atendimento: one(atendimentos, { fields: [vendas.atendimentoId], references: [atendimentos.id] }),
}));

export const mensagensRelations = relations(mensagens, ({ one }) => ({
    atendimento: one(atendimentos, { fields: [mensagens.atendimentoId], references: [atendimentos.id] }),
}));

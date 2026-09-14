import { sql, relations } from 'drizzle-orm';
import {
    pgTable,
    pgEnum,
    uuid,
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
    unique,
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

export const vendas = pgTable('vendas', {
    id: uuid('id').primaryKey().defaultRandom(),
    atendimentoId: uuid('atendimento_id').references(() => atendimentos.id, { onDelete: 'cascade' }),
    itensPedido: text('itens_pedido'),
    valorProdutos: numeric('valor_produtos', { precision: 10, scale: 2, mode: 'number' }),
    valorFrete: numeric('valor_frete', { precision: 10, scale: 2, mode: 'number' }),
    valorTotal: numeric('valor_total', { precision: 10, scale: 2, mode: 'number' }),
    transportadora: varchar('transportadora'),
    statusVenda: varchar('status_venda').default('Aguardando Pagamento'),
    criadoEm: timestamp('criado_em', { withTimezone: true }).defaultNow(),
});

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
}));

export const vendasRelations = relations(vendas, ({ one }) => ({
    atendimento: one(atendimentos, { fields: [vendas.atendimentoId], references: [atendimentos.id] }),
}));

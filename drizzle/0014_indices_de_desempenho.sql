-- Índices de desempenho (só leitura mais rápida; nenhuma coluna ou regra muda).
-- Idempotente: pode ser aplicado à mão no SQL Editor do Supabase do BOT antes
-- do deploy e depois pelo db:migrate sem erro.
-- ATENCAO: CREATE INDEX comum trava escrita na tabela por instantes. Com volume
-- maior, aplique antes, à mão, no SQL Editor com CREATE INDEX CONCURRENTLY IF NOT
-- EXISTS (mesmos nomes e colunas), um comando por vez, fora de transação (o
-- migrator do drizzle roda em transação e não aceita CONCURRENTLY).

-- Lista de atendimentos: ordena por "última atividade". A expressão precisa ser
-- IGUAL à de src/services/atendimento.service.js (atividadeEm), senão não é usada.
CREATE INDEX IF NOT EXISTS "idx_atendimentos_atividade" ON "atendimentos" ((coalesce("atualizado_em", "criado_em", 'epoch'::timestamptz)) DESC, "id" DESC);--> statement-breakpoint
-- Lista de vendas filtrada por status ("Aguardando Pagamento" / "Paga"), mais recentes primeiro.
CREATE INDEX IF NOT EXISTS "idx_vendas_status_criado" ON "vendas" ("status_venda", "criado_em" DESC, "id" DESC);--> statement-breakpoint
-- Chat da equipe: conversas de um usuário (admin_id OU funcionario_id).
CREATE INDEX IF NOT EXISTS "idx_chat_conversas_admin" ON "chat_conversas" ("admin_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_conversas_funcionario" ON "chat_conversas" ("funcionario_id");--> statement-breakpoint
-- Chat da equipe: última mensagem / histórico de uma conversa.
CREATE INDEX IF NOT EXISTS "idx_chat_mensagens_conversa_criado" ON "chat_mensagens" ("conversa_id", "criado_em" DESC);

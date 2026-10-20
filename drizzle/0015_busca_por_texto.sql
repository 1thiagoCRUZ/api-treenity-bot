-- Busca por texto nas listas do painel (vendas e atendimentos): ilike '%termo%'
-- só é rápido com índice trigrama. Só leitura mais rápida; nenhuma coluna muda.
-- Idempotente: pode ser aplicado à mão no SQL Editor do Supabase do BOT antes
-- do deploy e depois pelo db:migrate sem erro.
-- ATENCAO: CREATE INDEX comum trava escrita na tabela enquanto cria (mensagens é a
-- maior). Com volume grande, rode à mão com CREATE INDEX CONCURRENTLY IF NOT EXISTS
-- (mesmos nomes), um por vez, fora de transação.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clientes_nome_trgm" ON "clientes" USING gin ("nome" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_clientes_id_face_trgm" ON "clientes" USING gin ("id_face" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_mensagens_conteudo_trgm" ON "mensagens" USING gin ("conteudo" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_vendas_itens_trgm" ON "vendas" USING gin ("itens_pedido" gin_trgm_ops);

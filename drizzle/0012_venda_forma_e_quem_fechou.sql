-- Forma de pagamento e quem fechou a venda. Idempotente: a forma já pode ter sido
-- criada à mão (atendimento/pagamento.sql do n8n) antes do db:migrate.
ALTER TABLE "vendas" ADD COLUMN IF NOT EXISTS "forma_pagamento" varchar;--> statement-breakpoint
ALTER TABLE "vendas" ADD COLUMN IF NOT EXISTS "fechada_por" varchar;

-- Até onde cada participante leu a conversa do chat da equipe. Alimenta o
-- contador de mensagens novas do Chat da equipe no DeskComm. Idempotente: pode
-- ter sido aplicado à mão no SQL Editor antes do db:migrate.
ALTER TABLE "chat_conversas" ADD COLUMN IF NOT EXISTS "admin_lido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_conversas" ADD COLUMN IF NOT EXISTS "funcionario_lido_em" timestamp with time zone;

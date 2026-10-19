-- Empresa (organização do DeskComm) a que cada usuário pertence. O Chat da
-- equipe só mostra e só deixa conversar quem é da MESMA empresa. Preenchida a
-- cada SSO pelo DeskComm; usuário antigo fica nulo até o próximo acesso (e,
-- nulo, ninguém o enxerga por engano). Idempotente: pode ter sido aplicado à
-- mão no SQL Editor antes do db:migrate.
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "organizacao_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usuarios_organizacao_idx" ON "usuarios" ("organizacao_id");

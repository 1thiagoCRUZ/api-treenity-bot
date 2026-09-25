-- respostas_rapidas JÁ EXISTE no banco do bot: foi criada pelo SQL do n8n
-- (atendimento/respostas-rapidas.sql, no repo do n8n). Esta migration traz a
-- tabela para o schema do Drizzle, por isso é toda IF NOT EXISTS: num banco
-- novo cria do zero; no de produção, a única mudança é a coluna origem_id.
--
-- origem_id é o id da resposta salva no deskcomm, que espelha para cá a cada
-- salvamento (PUT /api/respostas-rapidas/origem/:origemId). NULL = linha criada
-- direto aqui; o espelho nunca toca nessas.
--
-- A função normalizar_texto() e as sementes continuam no SQL do n8n: quem
-- depende delas é o fluxo do bot, não esta API.
CREATE TABLE IF NOT EXISTS "respostas_rapidas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"conta_id" varchar,
	"titulo" varchar NOT NULL,
	"corpo" text NOT NULL,
	"gatilhos" text[] DEFAULT '{}'::text[] NOT NULL,
	"contexto" varchar DEFAULT 'qualquer' NOT NULL,
	"midia_chave" varchar,
	"prioridade" integer DEFAULT 100 NOT NULL,
	"max_chars_msg" integer DEFAULT 60 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"origem_id" uuid,
	CONSTRAINT "respostas_rapidas_contexto_check" CHECK ("respostas_rapidas"."contexto" in ('abertura', 'qualquer'))
);
--> statement-breakpoint
ALTER TABLE "respostas_rapidas" ADD COLUMN IF NOT EXISTS "origem_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "respostas_rapidas_origem_uidx" ON "respostas_rapidas" USING btree ("origem_id") WHERE "origem_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_respostas_rapidas_busca" ON "respostas_rapidas" USING btree ("ativo","contexto","prioridade");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_respostas_rapidas_gatilhos" ON "respostas_rapidas" USING gin ("gatilhos");

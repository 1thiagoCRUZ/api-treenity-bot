-- respostas_rapidas JÁ EXISTE no banco do bot: foi criada pelo SQL do n8n
-- (atendimento/respostas-rapidas.sql, no repo do n8n). Esta migration só traz a
-- tabela para o schema do Drizzle, por isso é toda IF NOT EXISTS — no banco de
-- produção ela não altera nada; num banco novo, cria do zero.
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
	CONSTRAINT "respostas_rapidas_contexto_check" CHECK ("respostas_rapidas"."contexto" in ('abertura', 'qualquer'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_respostas_rapidas_busca" ON "respostas_rapidas" USING btree ("ativo","contexto","prioridade");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_respostas_rapidas_gatilhos" ON "respostas_rapidas" USING gin ("gatilhos");
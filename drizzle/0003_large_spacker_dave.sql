ALTER TABLE "atendimentos" ADD COLUMN "precisa_atencao_humana" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "motivo_atencao" varchar;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD COLUMN "atencao_sinalizada_em" timestamp with time zone;
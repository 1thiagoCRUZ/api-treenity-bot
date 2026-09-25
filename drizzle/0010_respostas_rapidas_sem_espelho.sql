-- Fim do espelho: o deskcomm deixou de guardar uma cópia em message_templates e
-- passou a ler e gravar direto aqui, então origem_id (o id da cópia de lá) não
-- tem mais uso. Nenhuma linha chegou a ser espelhada em produção.
DROP INDEX IF EXISTS "respostas_rapidas_origem_uidx";--> statement-breakpoint
ALTER TABLE "respostas_rapidas" DROP COLUMN IF EXISTS "origem_id";

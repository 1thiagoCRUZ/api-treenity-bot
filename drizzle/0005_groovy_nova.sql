CREATE INDEX "idx_mensagens_atendimento" ON "mensagens" USING btree ("atendimento_id","enviado_em");--> statement-breakpoint
CREATE INDEX "idx_vendas_atendimento" ON "vendas" USING btree ("atendimento_id");--> statement-breakpoint
CREATE INDEX "idx_vendas_criado" ON "vendas" USING btree ("criado_em","id");
-- Baseline: a tabela "mensagens" já existia no banco (criada pelo n8n do bot
-- de atendimento, fora deste repositório). Esta migration não executa DDL —
-- só faz o histórico do Drizzle "alcançar" o schema.js atual.
SELECT 1;

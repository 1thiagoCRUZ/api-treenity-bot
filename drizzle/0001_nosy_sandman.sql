-- Baseline: as tabelas abaixo já existiam no banco (criadas fora deste
-- repositório, pelo bot/pelo chat_schema.sql) antes de entrarem no schema do
-- Drizzle. Esta migration não executa DDL nenhum — ela só faz o histórico de
-- migrations do Drizzle "alcançar" o schema.js atual, para que futuras
-- alterações nessas tabelas gerem ALTER TABLE corretos em vez de tentar
-- recriá-las.
--
-- Tabelas cobertas: atendimentos, chat_conversas, chat_mensagens, clientes,
-- dashboard_metrics_diarias, vendas.
SELECT 1;

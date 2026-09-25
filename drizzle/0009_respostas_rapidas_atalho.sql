-- Uma tabela só para as respostas rápidas: a mesma linha serve à equipe, pelo
-- "/" do Inbox do deskcomm, e ao bot, pelos gatilhos. `atalho` é o que a equipe
-- digita depois da barra (sem a barra). O n8n não lê esta coluna.
ALTER TABLE "respostas_rapidas" ADD COLUMN IF NOT EXISTS "atalho" varchar(40);

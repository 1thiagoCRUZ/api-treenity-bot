-- Tempo real do painel admin: avisa (LISTEN/NOTIFY) quando o n8n grava mensagens,
-- atendimentos ou vendas. O n8n escreve direto no Postgres, sem passar por esta
-- API — então o único gancho possível é no banco, e ele não muda nada no n8n.
--
-- O payload leva SÓ ids (tipo, operação, id e atendimento_id). Nenhum dado de
-- cliente trafega no NOTIFY: quem escuta busca os detalhes pela API, que confere
-- a permissão de painel.
--
-- A função engole qualquer erro de propósito: um aviso de painel jamais pode
-- derrubar a gravação do n8n, que é a operação que importa.
--
-- Para desfazer: DROP TRIGGER treenity_painel_{mensagens,atendimentos,vendas} ON
-- as respectivas tabelas e DROP FUNCTION public.treenity_painel_notificar().
CREATE OR REPLACE FUNCTION public.treenity_painel_notificar() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tipo text := TG_ARGV[0];
    v_id uuid;
    v_atendimento uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_id := OLD.id;
    ELSE
        v_id := NEW.id;
    END IF;

    -- mensagens e vendas apontam para o atendimento; atendimentos É o atendimento.
    IF v_tipo = 'atendimento' THEN
        v_atendimento := v_id;
    ELSIF TG_OP = 'DELETE' THEN
        v_atendimento := OLD.atendimento_id;
    ELSE
        v_atendimento := NEW.atendimento_id;
    END IF;

    PERFORM pg_notify(
        'treenity_painel',
        json_build_object('t', v_tipo, 'op', TG_OP, 'id', v_id, 'atendimento_id', v_atendimento)::text
    );
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$;--> statement-breakpoint
DROP TRIGGER IF EXISTS treenity_painel_mensagens ON public.mensagens;--> statement-breakpoint
CREATE TRIGGER treenity_painel_mensagens
    AFTER INSERT ON public.mensagens
    FOR EACH ROW EXECUTE FUNCTION public.treenity_painel_notificar('mensagem');--> statement-breakpoint
DROP TRIGGER IF EXISTS treenity_painel_atendimentos ON public.atendimentos;--> statement-breakpoint
CREATE TRIGGER treenity_painel_atendimentos
    AFTER INSERT OR UPDATE OR DELETE ON public.atendimentos
    FOR EACH ROW EXECUTE FUNCTION public.treenity_painel_notificar('atendimento');--> statement-breakpoint
DROP TRIGGER IF EXISTS treenity_painel_vendas ON public.vendas;--> statement-breakpoint
CREATE TRIGGER treenity_painel_vendas
    AFTER INSERT OR UPDATE OR DELETE ON public.vendas
    FOR EACH ROW EXECUTE FUNCTION public.treenity_painel_notificar('venda');

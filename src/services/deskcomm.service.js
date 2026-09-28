import '../config/env.js';

// Avisos da API do bot para o DeskComm (TreenityCRM), onde o Inbox mostra as
// conversas do WhatsApp. Hoje só um: "o bot chamou o especialista", para a
// conversa ir para a Fila do Inbox com o bot calado.
//
// OPCIONAL: sem DESKCOMM_URL e DESKCOMM_CHAVE_WHATSAPP o aviso não é mandado e
// o resto funciona como antes (o gate do n8n continua calando o bot). A chave é
// a gerada no DeskComm em Treenity Bot › Automações › "WhatsApp no Inbox".
//
// Nunca lança e nunca atrasa quem chamou por mais que TEMPO_MAXIMO_MS: quem
// chama é a ferramenta chamar_especialista do n8n, e o bot não pode travar
// porque o DeskComm está lento ou fora do ar.

const TEMPO_MAXIMO_MS = 5_000;

export const deskcommService = {
    async avisarPediuAjuda({ idFace, motivo }) {
        const url = process.env.DESKCOMM_URL;
        const chave = process.env.DESKCOMM_CHAVE_WHATSAPP;
        if (!url || !chave) return 'nao_configurado';

        try {
            const res = await fetch(`${url.replace(/\/$/, '')}/api/treenity-bot/whatsapp/pediu-ajuda`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_face: idFace, motivo }),
                signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
            });
            if (!res.ok) {
                console.error(`[deskcomm] aviso de pedido de ajuda recusado: HTTP ${res.status}`);
                return 'falhou';
            }
            return 'avisado';
        } catch (err) {
            console.error('[deskcomm] aviso de pedido de ajuda falhou:', err?.message ?? err);
            return 'falhou';
        }
    },
};

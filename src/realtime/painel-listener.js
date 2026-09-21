import os from 'os';
import pg from 'pg';
import { requireEnv } from '../config/env.js';
import { emitPainelEvento } from '../sockets/realtime.js';

// Ponte banco -> tempo real do painel admin.
//
// O n8n grava mensagens, atendimentos e vendas DIRETO no Postgres, sem passar
// por esta API — então não há um ponto de código onde "avisar que mudou". O
// gancho é do banco: triggers (drizzle/0006_painel_tempo_real.sql) fazem
// pg_notify('treenity_painel', {ids}) a cada gravação, e este módulo mantém UMA
// conexão dedicada em LISTEN e converte cada aviso num evento Socket.io para a
// sala do painel admin (ver realtime.js). O payload só tem ids: os detalhes o
// painel busca pela API, que confere a permissão.
//
// A conexão precisa ser sessão fixa (LISTEN não funciona em pool de transação):
// a DATABASE_URL usa o Session Pooler do Supabase, que serve.
const CANAL = 'treenity_painel';
const TIPOS_VALIDOS = new Set(['mensagem', 'atendimento', 'venda']);
const HEARTBEAT_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const BACKOFF_INICIAL_MS = 1_000;
const BACKOFF_MAXIMO_MS = 30_000;

let cliente = null;
let heartbeat = null;
let reconexao = null;
let tentativas = 0;
let parado = true;

const log = (mensagem) => console.log(`[Painel] ${mensagem}`);

// O hostname distingue quem está escutando (a instância do Render, a máquina de
// dev). Só caracteres seguros: o nome vai dentro de um literal SQL.
export const nomeDaSessao = () => `treenity_painel_listener:${os.hostname().replace(/[^a-zA-Z0-9_.-]/g, '_')}`;

function limparTimers() {
    if (heartbeat) clearInterval(heartbeat);
    if (reconexao) clearTimeout(reconexao);
    heartbeat = null;
    reconexao = null;
}

function converterAviso(bruto) {
    try {
        const dado = JSON.parse(bruto);
        if (!TIPOS_VALIDOS.has(dado.t)) return null;
        return { tipo: dado.t, op: dado.op, id: dado.id, atendimentoId: dado.atendimento_id };
    } catch {
        return null;
    }
}

function agendarReconexao(motivo) {
    if (parado) return;
    const espera = Math.min(BACKOFF_MAXIMO_MS, BACKOFF_INICIAL_MS * 2 ** tentativas);
    tentativas += 1;
    log(`conexão perdida (${motivo}) — nova tentativa em ${Math.round(espera / 1000)}s`);
    if (reconexao) clearTimeout(reconexao);
    reconexao = setTimeout(conectar, espera);
}

async function conectar() {
    if (parado) return;

    const novo = new pg.Client({
        connectionString: requireEnv('DATABASE_URL'),
        ssl: { rejectUnauthorized: false },
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        application_name: nomeDaSessao(),
    });

    let caiu = false;
    const aoCair = (motivo) => {
        if (caiu) return;
        caiu = true;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        if (cliente === novo) cliente = null;
        novo.removeAllListeners();
        novo.on('error', () => {}); // um 'error' sem ouvinte derrubaria o processo
        novo.end().catch(() => {});
        agendarReconexao(motivo);
    };

    novo.on('error', (erro) => aoCair(erro.message));
    novo.on('end', () => aoCair('conexão encerrada'));
    novo.on('notification', (aviso) => {
        if (aviso.channel !== CANAL || !aviso.payload) return;
        const evento = converterAviso(aviso.payload);
        if (evento) emitPainelEvento(evento);
    });

    try {
        await novo.connect();
        // O pooler do Supabase não repassa o application_name do handshake; um SET
        // na sessão (fixa) faz a conexão aparecer identificada em pg_stat_activity.
        await novo.query(`SET application_name = '${nomeDaSessao()}'`);
        await novo.query(`LISTEN ${CANAL}`);
    } catch (erro) {
        aoCair(erro.message);
        return;
    }

    if (parado) {
        novo.removeAllListeners();
        novo.on('error', () => {});
        await novo.end().catch(() => {});
        return;
    }

    cliente = novo;
    const eraReconexao = tentativas > 0;
    tentativas = 0;
    log('escutando avisos de mensagens, atendimentos e vendas');

    // Uma conexão morta em silêncio (pooler que derruba ociosa, rede) não dispara
    // 'error' nem 'end': o heartbeat é o que percebe.
    heartbeat = setInterval(async () => {
        let timer;
        try {
            await Promise.race([
                novo.query('SELECT 1'),
                new Promise((_, rejeitar) => {
                    timer = setTimeout(() => rejeitar(new Error('heartbeat sem resposta')), HEARTBEAT_TIMEOUT_MS);
                }),
            ]);
        } catch (erro) {
            aoCair(erro.message);
        } finally {
            clearTimeout(timer);
        }
    }, HEARTBEAT_MS);

    // Avisos que chegaram enquanto a conexão estava fora se perderam: manda os
    // painéis buscarem tudo de novo.
    if (eraReconexao) emitPainelEvento({ tipo: 'reconectado' });
}

export function iniciarPainelListener() {
    if (!parado) return;
    parado = false;
    void conectar();
}

export async function pararPainelListener() {
    parado = true;
    limparTimers();
    if (cliente) {
        const atual = cliente;
        cliente = null;
        atual.removeAllListeners();
        atual.on('error', () => {});
        await atual.end().catch(() => {});
    }
}

import { z } from 'zod';
import { respostaRapidaService } from '../services/resposta-rapida.service.js';
import { normalizarGatilhos } from '../utils/normalizar.util.js';

const idSchema = z.coerce.number().int().positive();

const listarSchema = z.object({
    conta_id: z.string().trim().min(1).max(100).optional(),
    ativo: z.enum(['true', 'false']).optional(),
});

// As travas abaixo existem porque o n8n falha EM SILÊNCIO com valor fora delas:
// - contexto: só 'abertura' e 'qualquer' são avaliados; outro valor nunca casa.
// - max_chars_msg: é o que impede o atalho de roubar uma pergunta de verdade
//   ("oi" casa, "oi, queria o preço do kit de 20" não pode casar).
const campos = {
    titulo: z.string().trim().min(1).max(200),
    corpo: z.string().trim().min(1).max(4096),
    gatilhos: z.array(z.string().max(200)).max(100),
    contexto: z.enum(['abertura', 'qualquer']),
    max_chars_msg: z.number().int().min(10).max(400),
    prioridade: z.number().int().min(0).max(10000),
    conta_id: z.string().trim().min(1).max(100).nullable(),
    midia_chave: z.string().trim().min(1).max(200).nullable(),
    // O que a equipe digita depois da barra no Inbox. Chega com ou sem a barra;
    // vazio vira null (a resposta fica sem atalho).
    atalho: z
        .string()
        .trim()
        .max(41)
        .transform((valor) => valor.replace(/^\//, '').trim() || null)
        .pipe(z.string().max(40).nullable())
        .nullable(),
    ativo: z.boolean(),
};

const criarSchema = z.object({
    ...campos,
    contexto: campos.contexto.default('qualquer'),
    max_chars_msg: campos.max_chars_msg.default(60),
    prioridade: campos.prioridade.default(100),
    conta_id: campos.conta_id.optional(),
    midia_chave: campos.midia_chave.optional(),
    atalho: campos.atalho.optional(),
    ativo: campos.ativo.default(true),
});

// Campo ausente não é alterado — nunca zerar o que não veio.
const atualizarSchema = z.object(campos).partial();

// Uma resposta ligada sem gatilho nunca dispara: melhor recusar na hora do que
// deixar o dono procurando o defeito.
const ERRO_SEM_GATILHO = 'Para o bot responder sozinho, informe ao menos um gatilho (com 2 letras ou mais).';

// Corpo da requisição (snake_case, como as colunas) -> campos do Drizzle.
function paraColunas(dados) {
    const colunas = {
        titulo: dados.titulo,
        corpo: dados.corpo,
        gatilhos: dados.gatilhos === undefined ? undefined : normalizarGatilhos(dados.gatilhos),
        contexto: dados.contexto,
        maxCharsMsg: dados.max_chars_msg,
        prioridade: dados.prioridade,
        contaId: dados.conta_id,
        midiaChave: dados.midia_chave,
        atalho: dados.atalho,
        ativo: dados.ativo,
    };
    return Object.fromEntries(Object.entries(colunas).filter(([, valor]) => valor !== undefined));
}

function formatar(linha) {
    return {
        id: linha.id,
        conta_id: linha.contaId,
        titulo: linha.titulo,
        corpo: linha.corpo,
        atalho: linha.atalho,
        gatilhos: linha.gatilhos,
        contexto: linha.contexto,
        midia_chave: linha.midiaChave,
        prioridade: linha.prioridade,
        max_chars_msg: linha.maxCharsMsg,
        ativo: linha.ativo,
        criado_em: linha.criadoEm,
        atualizado_em: linha.atualizadoEm,
    };
}

function erroValidacao(res, parsed) {
    return res.status(400).json({ success: false, error: 'Dados inválidos', detalhes: parsed.error.flatten() });
}

export const respostaRapidaController = {
    async listar(req, res) {
        const parsed = listarSchema.safeParse(req.query);
        if (!parsed.success) return erroValidacao(res, parsed);

        const { conta_id: contaId, ativo } = parsed.data;
        const linhas = await respostaRapidaService.listar({
            contaId,
            ativo: ativo === undefined ? undefined : ativo === 'true',
        });
        res.json({ success: true, count: linhas.length, data: linhas.map(formatar) });
    },

    async criar(req, res) {
        const parsed = criarSchema.safeParse(req.body);
        if (!parsed.success) return erroValidacao(res, parsed);

        const valores = paraColunas(parsed.data);
        if (valores.ativo && valores.gatilhos.length === 0) {
            return res.status(422).json({ success: false, error: ERRO_SEM_GATILHO });
        }

        const criada = await respostaRapidaService.criar(valores);
        res.status(201).json({ success: true, data: formatar(criada) });
    },

    async atualizar(req, res) {
        const id = idSchema.safeParse(req.params.id);
        if (!id.success) return res.status(400).json({ success: false, error: 'Id inválido' });

        const parsed = atualizarSchema.safeParse(req.body);
        if (!parsed.success) return erroValidacao(res, parsed);

        const valores = paraColunas(parsed.data);
        if (Object.keys(valores).length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum campo para alterar' });
        }

        const atual = await respostaRapidaService.buscar(id.data);
        if (!atual) return res.status(404).json({ success: false, error: 'Resposta rápida não encontrada' });

        // A regra vale para o resultado final: ligar uma resposta que já estava
        // sem gatilho, ou apagar os gatilhos de uma que está ligada.
        const ficaAtivo = valores.ativo ?? atual.ativo;
        const ficaGatilhos = valores.gatilhos ?? atual.gatilhos;
        if (ficaAtivo && ficaGatilhos.length === 0) {
            return res.status(422).json({ success: false, error: ERRO_SEM_GATILHO });
        }

        const atualizada = await respostaRapidaService.atualizar(id.data, valores);
        if (!atualizada) return res.status(404).json({ success: false, error: 'Resposta rápida não encontrada' });
        res.json({ success: true, data: formatar(atualizada) });
    },

    async remover(req, res) {
        const id = idSchema.safeParse(req.params.id);
        if (!id.success) return res.status(400).json({ success: false, error: 'Id inválido' });

        const existia = await respostaRapidaService.remover(id.data);
        if (!existia) return res.status(404).json({ success: false, error: 'Resposta rápida não encontrada' });
        res.status(204).end();
    },
};

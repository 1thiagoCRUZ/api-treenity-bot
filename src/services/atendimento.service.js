import { and, asc, count, desc, eq, exists, gte, inArray, lt, ne, notExists, or, sql, sum } from 'drizzle-orm';
import { db } from '../db/client.js';
import { atendimentos, clientes, mensagens, vendas } from '../db/schema.js';
import { codificarCursor } from '../utils/cursor.util.js';

const LISTA_LIMITE_PADRAO = 30;
const LISTA_LIMITE_MAXIMO = 100;
const PREVIA_MAX_CARACTERES = 140;

// "Última atividade" do atendimento: a mesma coluna que o n8n atualiza a cada
// mensagem. O coalesce evita que uma linha sem `atualizado_em` (a coluna aceita
// null) quebre a ordenação e o cursor.
const atividadeEm = sql`coalesce(${atendimentos.atualizadoEm}, ${atendimentos.criadoEm}, 'epoch'::timestamptz)`;

export const atendimentoService = {
    // Lista TODOS os atendimentos (a IA e o cliente), do mais ativo pro menos,
    // com o que um painel precisa numa linha: cliente, canal, etapa do funil,
    // nota da IA, se teve venda e a última mensagem. Paginada por cursor.
    //
    // options: { limit, canal, etapa, comVenda (bool), desde (Date, inclusivo),
    //            ate (Date, exclusivo), cursor ({ t, id } — ver cursor.util.js) }
    // Devolve { itens, proximoCursor }.
    async listarTodos(options = {}) {
        const limit = Math.min(Math.max(Number(options.limit) || LISTA_LIMITE_PADRAO, 1), LISTA_LIMITE_MAXIMO);

        const condicoes = [];
        if (options.canal) condicoes.push(eq(atendimentos.canal, options.canal));
        if (options.etapa) condicoes.push(eq(atendimentos.statusFunil, options.etapa));
        if (options.desde) condicoes.push(gte(atividadeEm, options.desde));
        if (options.ate) condicoes.push(lt(atividadeEm, options.ate));
        if (options.comVenda !== undefined) {
            const temVenda = db
                .select({ um: sql`1` })
                .from(vendas)
                .where(eq(vendas.atendimentoId, atendimentos.id));
            condicoes.push(options.comVenda ? exists(temVenda) : notExists(temVenda));
        }
        if (options.cursor) {
            condicoes.push(
                or(
                    sql`${atividadeEm} < ${options.cursor.t}::timestamptz`,
                    and(
                        sql`${atividadeEm} = ${options.cursor.t}::timestamptz`,
                        sql`${atendimentos.id} < ${options.cursor.id}`
                    )
                )
            );
        }

        const linhasComUma = await db
            .select({
                atendimento: atendimentos,
                cliente: clientes,
                cursorTs: sql`${atividadeEm}::text`.as('cursor_ts'),
            })
            .from(atendimentos)
            .leftJoin(clientes, eq(atendimentos.clienteId, clientes.id))
            .where(condicoes.length ? and(...condicoes) : undefined)
            .orderBy(desc(atividadeEm), desc(atendimentos.id))
            .limit(limit + 1); // uma a mais só pra saber se existe próxima página

        const temProxima = linhasComUma.length > limit;
        const linhas = temProxima ? linhasComUma.slice(0, limit) : linhasComUma;
        if (linhas.length === 0) return { itens: [], proximoCursor: null };

        const ultima = linhas[linhas.length - 1];
        const proximoCursor = temProxima ? codificarCursor(ultima.cursorTs, ultima.atendimento.id) : null;

        // Enriquecimento só da página: última mensagem, total de mensagens e vendas.
        const ids = linhas.map((l) => l.atendimento.id);
        const [ultimas, totais, vendasPorAtendimento] = await Promise.all([
            db
                .selectDistinctOn([mensagens.atendimentoId], {
                    atendimentoId: mensagens.atendimentoId,
                    remetente: mensagens.remetente,
                    conteudo: mensagens.conteudo,
                    formato: mensagens.formato,
                    enviadoEm: mensagens.enviadoEm,
                })
                .from(mensagens)
                .where(inArray(mensagens.atendimentoId, ids))
                .orderBy(mensagens.atendimentoId, desc(mensagens.enviadoEm)),
            db
                .select({ atendimentoId: mensagens.atendimentoId, total: count() })
                .from(mensagens)
                .where(inArray(mensagens.atendimentoId, ids))
                .groupBy(mensagens.atendimentoId),
            db
                .select({ atendimentoId: vendas.atendimentoId, quantidade: count(), total: sum(vendas.valorTotal) })
                .from(vendas)
                .where(inArray(vendas.atendimentoId, ids))
                .groupBy(vendas.atendimentoId),
        ]);
        const ultimaPorAtendimento = new Map(ultimas.map((m) => [m.atendimentoId, m]));
        const totalPorAtendimento = new Map(totais.map((t) => [t.atendimentoId, t.total]));
        const vendaPorAtendimento = new Map(vendasPorAtendimento.map((v) => [v.atendimentoId, v]));

        const itens = linhas.map(({ atendimento: a, cliente }) => {
            const msg = ultimaPorAtendimento.get(a.id);
            const venda = vendaPorAtendimento.get(a.id);
            const conteudo = msg?.conteudo ?? '';
            return {
                id: a.id,
                cliente: cliente ? { id: cliente.id, nome: cliente.nome, idFace: cliente.idFace } : null,
                canal: a.canal,
                origem: a.origem,
                statusFunil: a.statusFunil,
                qualidadeIa: a.qualidadeIa,
                categoriaFeedback: a.categoriaFeedback,
                precisaAtencaoHumana: a.precisaAtencaoHumana,
                criadoEm: a.criadoEm,
                atualizadoEm: a.atualizadoEm,
                totalMensagens: totalPorAtendimento.get(a.id) ?? 0,
                ultimaMensagem: msg
                    ? {
                          remetente: msg.remetente,
                          formato: msg.formato,
                          conteudo:
                              conteudo.length > PREVIA_MAX_CARACTERES
                                  ? `${conteudo.slice(0, PREVIA_MAX_CARACTERES)}…`
                                  : conteudo,
                          enviadoEm: msg.enviadoEm,
                      }
                    : null,
                venda: venda ? { quantidade: venda.quantidade, total: Number(venda.total) || 0 } : null,
            };
        });

        return { itens, proximoCursor };
    },

    // Busca um atendimento pelo id, já com o nome/id_face do cliente — usado
    // pra dar contexto (quem é, qual canal) junto com as mensagens.
    async buscarComCliente(atendimentoId) {
        const [linha] = await db
            .select({ atendimento: atendimentos, clienteNome: clientes.nome, idFace: clientes.idFace })
            .from(atendimentos)
            .innerJoin(clientes, eq(atendimentos.clienteId, clientes.id))
            .where(eq(atendimentos.id, atendimentoId))
            .limit(1);

        if (!linha) return null;
        return { ...linha.atendimento, clienteNome: linha.clienteNome, idFace: linha.idFace };
    },

    // Transcrição completa (cliente + bot) de um atendimento, do mais antigo
    // pro mais recente — é o que permite ir direto da sinalização pra conversa.
    async listarMensagens(atendimentoId) {
        return db
            .select()
            .from(mensagens)
            .where(eq(mensagens.atendimentoId, atendimentoId))
            .orderBy(asc(mensagens.enviadoEm));
    },

    // Atendimentos que precisam de atenção humana agora (sinalizados e ainda
    // abertos) — pro painel listar sem depender só de ter pego o evento em
    // tempo real no momento exato em que ele disparou.
    async listarSinalizados() {
        const linhas = await db
            .select({
                id: atendimentos.id,
                clienteId: atendimentos.clienteId,
                clienteNome: clientes.nome,
                idFace: clientes.idFace,
                canal: atendimentos.canal,
                motivoAtencao: atendimentos.motivoAtencao,
                atencaoSinalizadaEm: atendimentos.atencaoSinalizadaEm,
            })
            .from(atendimentos)
            .innerJoin(clientes, eq(atendimentos.clienteId, clientes.id))
            .where(and(eq(atendimentos.precisaAtencaoHumana, true), ne(atendimentos.statusFunil, 'Fechada')))
            .orderBy(asc(atendimentos.atencaoSinalizadaEm));

        return linhas;
    },
    // Sinaliza o atendimento ABERTO (status_funil != 'Fechada') do cliente
    // identificado por id_face — é sempre no máximo um, pela mesma regra que
    // o bot já usa para não abrir dois atendimentos simultâneos pro mesmo cliente.
    async sinalizar(idFace, motivo) {
        const [linha] = await db
            .select({ atendimento: atendimentos, clienteNome: clientes.nome })
            .from(atendimentos)
            .innerJoin(clientes, eq(atendimentos.clienteId, clientes.id))
            .where(and(eq(clientes.idFace, idFace), ne(atendimentos.statusFunil, 'Fechada')))
            .orderBy(desc(atendimentos.criadoEm))
            .limit(1);

        if (!linha) return null;

        const [atualizado] = await db
            .update(atendimentos)
            .set({
                precisaAtencaoHumana: true,
                motivoAtencao: motivo,
                atencaoSinalizadaEm: new Date(),
            })
            .where(eq(atendimentos.id, linha.atendimento.id))
            .returning();

        return { ...atualizado, clienteNome: linha.clienteNome };
    },

    // Encerra manualmente um atendimento (sem passar pelo fechamento de venda).
    // Ao virar 'Fechada', a próxima mensagem daquele cliente abre um
    // atendimento novo (sem sinalização) — é assim que a IA volta a responder.
    // `precisaAtencaoHumana` também zera aqui: `listarSinalizados` já filtra por
    // `statusFunil != 'Fechada'` e não precisaria disso, mas quem lê o campo
    // direto (ex: a tela de transcrição do deskcomm) senão continuaria vendo
    // "precisa de atenção" num atendimento que acabou de ser fechado.
    async encerrar(atendimentoId) {
        const [atualizado] = await db
            .update(atendimentos)
            .set({ statusFunil: 'Fechada', precisaAtencaoHumana: false, atualizadoEm: new Date() })
            .where(eq(atendimentos.id, atendimentoId))
            .returning();

        return atualizado || null;
    },
};

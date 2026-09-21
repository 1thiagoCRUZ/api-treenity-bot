import { and, count, desc, eq, gte, lt, or, sql, sum } from 'drizzle-orm';
import { db } from '../db/client.js';
import { clientes, atendimentos, vendas, dashboardMetricsDiarias } from '../db/schema.js';
import { codificarCursor } from '../utils/cursor.util.js';

async function countTotalCustomers() {
    const [{ total }] = await db.select({ total: count() }).from(clientes);
    return total || 0;
}

async function countTotalAppointments() {
    const [{ total }] = await db.select({ total: count() }).from(atendimentos);
    return total || 0;
}

async function countTotalRevenue() {
    // Soma feita no próprio Postgres (antes era feita em memória no Node, puxando a tabela inteira)
    const [{ total }] = await db.select({ total: sum(vendas.valorTotal) }).from(vendas);
    return Number(total) || 0;
}

export async function consolidateMetrics() {
    console.log('Starting background calculation of metrics... ');
    try {
        const [totalClientes, totalAtendimentos, faturamentoTotal] = await Promise.all([
            countTotalCustomers(),
            countTotalAppointments(),
            countTotalRevenue(),
        ]);

        const dataHoje = new Date().toISOString().split('T')[0];

        const metricasConsolidadas = {
            dataReferencia: dataHoje,
            totalClientes,
            totalAtendimentos,
            faturamentoTotal,
            atualizadoEm: new Date(),
        };

        await db
            .insert(dashboardMetricsDiarias)
            .values(metricasConsolidadas)
            .onConflictDoUpdate({
                target: dashboardMetricsDiarias.dataReferencia,
                set: {
                    totalClientes: metricasConsolidadas.totalClientes,
                    totalAtendimentos: metricasConsolidadas.totalAtendimentos,
                    faturamentoTotal: metricasConsolidadas.faturamentoTotal,
                    atualizadoEm: metricasConsolidadas.atualizadoEm,
                },
            });

        console.log('Consolidated metrics saved successfully!');
        return metricasConsolidadas;
    } catch (erro) {
        console.error('Error consolidating metrics:', erro.message);
        throw erro;
    }
}

export async function getMetrics() {
    const linhas = await db
        .select()
        .from(dashboardMetricsDiarias)
        .orderBy(desc(dashboardMetricsDiarias.dataReferencia))
        .limit(30);

    // Mantém o contrato de resposta em snake_case (compatibilidade com o frontend já existente)
    return linhas.map((linha) => ({
        data_referencia: linha.dataReferencia,
        total_clientes: linha.totalClientes,
        total_atendimentos: linha.totalAtendimentos,
        faturamento_total: linha.faturamentoTotal,
        atualizado_em: linha.atualizadoEm,
    }));
}

const VENDAS_LIMITE_PADRAO = 50;
const VENDAS_LIMITE_MAXIMO = 200;
const arredondar = (valor) => Number((Number(valor) || 0).toFixed(2));

// Lista paginada de vendas (mais recentes primeiro) + resumo do CONJUNTO filtrado.
//
// options: { limit, status, canal, desde (Date, inclusivo), ate (Date, exclusivo),
//            cursor ({ t, id } já decodificado — ver cursor.util.js) }
// Devolve { itens, proximoCursor, resumo }. O resumo cobre TODAS as vendas que
// casam com os filtros (não só a página), pra os totais de um painel não mudarem
// conforme a paginação.
export async function getSalesDetails(options = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || VENDAS_LIMITE_PADRAO, 1), VENDAS_LIMITE_MAXIMO);

    // Filtros que definem o conjunto — valem pra lista e pro resumo.
    const filtros = [];
    if (options.status) filtros.push(eq(vendas.statusVenda, options.status));
    if (options.canal) filtros.push(eq(atendimentos.canal, options.canal)); // filtrado no banco, antes do limit
    if (options.desde) filtros.push(gte(vendas.criadoEm, options.desde));
    if (options.ate) filtros.push(lt(vendas.criadoEm, options.ate));

    // O cursor só restringe a página, nunca o resumo.
    const condicoesDaPagina = [...filtros];
    if (options.cursor) {
        condicoesDaPagina.push(
            or(
                sql`${vendas.criadoEm} < ${options.cursor.t}::timestamptz`,
                and(
                    sql`${vendas.criadoEm} = ${options.cursor.t}::timestamptz`,
                    sql`${vendas.id} < ${options.cursor.id}`
                )
            )
        );
    }

    const linhasComUma = await db
        .select({
            venda: vendas,
            atendimento: atendimentos,
            cliente: clientes,
            cursorTs: sql`${vendas.criadoEm}::text`.as('cursor_ts'),
        })
        .from(vendas)
        .leftJoin(atendimentos, eq(vendas.atendimentoId, atendimentos.id))
        .leftJoin(clientes, eq(atendimentos.clienteId, clientes.id))
        .where(condicoesDaPagina.length ? and(...condicoesDaPagina) : undefined)
        .orderBy(desc(vendas.criadoEm), desc(vendas.id))
        .limit(limit + 1); // uma a mais só pra saber se existe próxima página

    const temProxima = linhasComUma.length > limit;
    const linhas = temProxima ? linhasComUma.slice(0, limit) : linhasComUma;
    const ultima = linhas[linhas.length - 1];
    const proximoCursor = temProxima ? codificarCursor(ultima.cursorTs, ultima.venda.id) : null;

    const [totais] = await db
        .select({
            quantidade: count(),
            faturamento: sum(vendas.valorTotal),
            frete: sum(vendas.valorFrete),
            produtos: sum(vendas.valorProdutos),
        })
        .from(vendas)
        .leftJoin(atendimentos, eq(vendas.atendimentoId, atendimentos.id))
        .where(filtros.length ? and(...filtros) : undefined);

    const quantidade = totais.quantidade || 0;
    const resumo = {
        quantidade,
        faturamento_total: arredondar(totais.faturamento),
        frete_total: arredondar(totais.frete),
        valor_produtos_total: arredondar(totais.produtos),
        ticket_medio: quantidade > 0 ? arredondar(Number(totais.faturamento) / quantidade) : 0,
    };

    const itens = linhas.map(({ venda, atendimento, cliente }) => {
        const nomeCliente = cliente?.nome || 'Desconhecido';

        return {
            id_venda: venda.id,
            data_venda: venda.criadoEm,
            cliente: nomeCliente,
            cep: cliente?.cepPadrao || null,
            canal: atendimento?.canal || null,
            itens: venda.itensPedido || '',
            frete: Number(venda.valorFrete) || 0,
            total: Number(venda.valorTotal) || 0,
            status: venda.statusVenda || 'Desconhecido',
            transportadora: venda.transportadora || null,
            valor_produtos: Number(venda.valorProdutos) || 0,
            cliente_detalhes: {
                id: cliente?.id || null,
                nome: nomeCliente,
                cep_padrao: cliente?.cepPadrao || null,
                id_face: cliente?.idFace || null,
                resumo: cliente?.resumo || null,
                cliente_desde: cliente?.criadoEm || null,
            },
            atendimento_detalhes: {
                id: atendimento?.id || null,
                canal: atendimento?.canal || null,
                status_funil: atendimento?.statusFunil || null,
                iniciado_em: atendimento?.criadoEm || null,
                nota_feedback: atendimento?.notaFeedback ?? null,
                categoria_feedback: atendimento?.categoriaFeedback || null,
                qualidade_ia: atendimento?.qualidadeIa ?? null,
                insights_ia: atendimento?.insightsIa || null,
            },
        };
    });

    return { itens, proximoCursor, resumo };
}

import { and, count, desc, eq, sum } from 'drizzle-orm';
import { db } from '../db/client.js';
import { clientes, atendimentos, vendas, dashboardMetricsDiarias } from '../db/schema.js';

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

export async function getSalesDetails(options = {}) {
    const limit = options.limit ? Number(options.limit) : 50;
    const status = options.status;
    const canal = options.canal;

    const condicoes = [];
    if (status) condicoes.push(eq(vendas.statusVenda, status));
    if (canal) condicoes.push(eq(atendimentos.canal, canal)); // filtrado no banco, antes do limit

    const linhas = await db
        .select({ venda: vendas, atendimento: atendimentos, cliente: clientes })
        .from(vendas)
        .leftJoin(atendimentos, eq(vendas.atendimentoId, atendimentos.id))
        .leftJoin(clientes, eq(atendimentos.clienteId, clientes.id))
        .where(condicoes.length ? and(...condicoes) : undefined)
        .orderBy(desc(vendas.criadoEm))
        .limit(limit);

    return linhas.map(({ venda, atendimento, cliente }) => {
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
}

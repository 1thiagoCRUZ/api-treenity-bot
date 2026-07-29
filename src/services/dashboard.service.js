import { supabase } from "../config/supabase.js";

async function countTotalCustomers() {
    const { count, error } = await supabase
        .from('clientes')
        .select('*', { count: 'exact', head: true} );
    if (error) throw new Error(`Error customers: ${error.message}`);
    return count || 0;
}

async function countTotalAppointments() {
    const { count, error } = await supabase
        .from('atendimentos')
        .select('*', { count: 'exact', head: true} );
    if (error) throw new Error(`Error appointments: ${error.message}`);
    return count || 0;
}

async function countTotalRevenue() {
    const { data, error } = await supabase
        .from('vendas')
        .select('valor_total');
    if (error) throw new Error(`Error sales: ${error.message}`);
    return (data || []).reduce((acc, venda) => acc + (Number(venda.valor_total) || 0), 0);
}

export async function consolidateMetrics() {
    console.log('Starting background calculation of metrics... ');
    try {
        const [totalClientes, totalAtendimentos, faturamentoTotal] = await Promise.all([
            countTotalCustomers(),
            countTotalAppointments(),
            countTotalRevenue()
        ]);

        const dataHoje = new Date().toISOString().split('T')[0];

        const metricasConsolidadas = {
            data_referencia: dataHoje,
            total_clientes: totalClientes,
            total_atendimentos: totalAtendimentos,
            faturamento_total: faturamentoTotal,
            atualizado_em: new Date().toISOString()
        };

        const { error } = await supabase
            .from('dashboard_metrics_diarias')
            .upsert(metricasConsolidadas, { onConflict: 'data_referencia' });

        if (error) throw error;
        console.log('Consolidated metrics saved successfully!');
        return metricasConsolidadas;
    } catch (erro) {
        console.error('Error consolidating metrics:', erro.message);
        throw erro;
    }
}

export async function getMetrics() {
    const { data, error } = await supabase
        .from('dashboard_metrics_diarias')
        .select('*')
        .order('data_referencia', { ascending: false })
        .limit(30);

    if (error) throw new Error(`Erro ao buscar métricas: ${error.message}`);
    return data;
}

export async function getSalesDetails(options = {}) {
    const limit = options.limit ? Number(options.limit) : 50;
    const status = options.status;
    const canal = options.canal;

    let query = supabase
        .from('vendas')
        .select(`
            id,
            itens_pedido,
            valor_produtos,
            valor_frete,
            valor_total,
            transportadora,
            status_venda,
            criado_em,
            atendimentos (
                id,
                canal,
                status_funil,
                nota_feedback,
                categoria_feedback,
                qualidade_ia,
                insights_ia,
                criado_em,
                clientes (
                    id,
                    nome,
                    cep_padrao,
                    id_face,
                    resumo,
                    criado_em
                )
            )
        `)
        .order('criado_em', { ascending: false })
        .limit(limit);

    if (status) {
        query = query.eq('status_venda', status);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro ao buscar detalhes das vendas: ${error.message}`);

    const vendasFormatadas = (data || []).map(venda => {
        const atendimento = Array.isArray(venda.atendimentos) ? venda.atendimentos[0] : (venda.atendimentos || {});
        const cliente = Array.isArray(atendimento.clientes) ? atendimento.clientes[0] : (atendimento.clientes || {});

        const canalAtendimento = atendimento.canal || null;
        const cepCliente = cliente.cep_padrao || null;
        const nomeCliente = cliente.nome || 'Desconhecido';

        if (canal && canalAtendimento !== canal) {
            return null;
        }

        return {
            id_venda: venda.id,
            data_venda: venda.criado_em,
            cliente: nomeCliente,
            cep: cepCliente,
            canal: canalAtendimento,
            itens: venda.itens_pedido || '',
            frete: Number(venda.valor_frete) || 0,
            total: Number(venda.valor_total) || 0,
            status: venda.status_venda || 'Desconhecido',
            transportadora: venda.transportadora || null,
            valor_produtos: Number(venda.valor_produtos) || 0,
            cliente_detalhes: {
                id: cliente.id || null,
                nome: nomeCliente,
                cep_padrao: cepCliente,
                id_face: cliente.id_face || null,
                resumo: cliente.resumo || null,
                cliente_desde: cliente.criado_em || null
            },
            atendimento_detalhes: {
                id: atendimento.id || null,
                canal: canalAtendimento,
                status_funil: atendimento.status_funil || null,
                iniciado_em: atendimento.criado_em || null,
                nota_feedback: atendimento.nota_feedback ?? null,
                categoria_feedback: atendimento.categoria_feedback || null,
                qualidade_ia: atendimento.qualidade_ia ?? null,
                insights_ia: atendimento.insights_ia || null
            }
        };
    }).filter(Boolean);

    return vendasFormatadas;
}

export {
    getSalesDetails as getSalesDetailsService,
    getSalesDetails as obterDetalhesVendas
};
import { supabase } from "../config/supabase";

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
        .select('valor');
    if (error) throw new Error(`Error sales: ${error.mesagge}`);
    return data.reduce((acc, venda) => acc + (Number(venda.valor) || 0), 0);
}

async function consolidateMetrics() {
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
        
    } catch (erro) {
        console.error('Error:', erro.message);
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
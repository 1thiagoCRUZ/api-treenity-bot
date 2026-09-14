import { and, asc, desc, eq, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { atendimentos, clientes, mensagens } from '../db/schema.js';

export const atendimentoService = {
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
    async encerrar(atendimentoId) {
        const [atualizado] = await db
            .update(atendimentos)
            .set({ statusFunil: 'Fechada', atualizadoEm: new Date() })
            .where(eq(atendimentos.id, atendimentoId))
            .returning();

        return atualizado || null;
    },
};

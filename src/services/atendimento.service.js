import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { atendimentos, clientes } from '../db/schema.js';

export const atendimentoService = {
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

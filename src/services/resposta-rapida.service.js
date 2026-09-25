import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { respostasRapidas } from '../db/schema.js';

// Mesma ordem em que o dono pensa nelas: primeiro as de abertura, depois as
// demais, cada grupo na ordem em que o n8n as testa (menor prioridade ganha).
const ORDEM = [asc(respostasRapidas.contexto), asc(respostasRapidas.prioridade), asc(respostasRapidas.id)];

export const respostaRapidaService = {
    async listar({ contaId, ativo } = {}) {
        const condicoes = [];
        if (contaId !== undefined) condicoes.push(eq(respostasRapidas.contaId, contaId));
        if (ativo !== undefined) condicoes.push(eq(respostasRapidas.ativo, ativo));

        return db
            .select()
            .from(respostasRapidas)
            .where(condicoes.length ? and(...condicoes) : undefined)
            .orderBy(...ORDEM);
    },

    async buscar(id) {
        const [linha] = await db.select().from(respostasRapidas).where(eq(respostasRapidas.id, id)).limit(1);
        return linha ?? null;
    },

    async criar(valores) {
        const [criada] = await db.insert(respostasRapidas).values(valores).returning();
        return criada;
    },

    // Só os campos presentes em `valores` mudam. Retorna `null` se não existe.
    async atualizar(id, valores) {
        const [atualizada] = await db
            .update(respostasRapidas)
            .set({ ...valores, atualizadoEm: new Date() })
            .where(eq(respostasRapidas.id, id))
            .returning();
        return atualizada ?? null;
    },

    // Retorna `false` se a linha não existia.
    async remover(id) {
        const removidas = await db
            .delete(respostasRapidas)
            .where(eq(respostasRapidas.id, id))
            .returning({ id: respostasRapidas.id });
        return removidas.length > 0;
    },
};

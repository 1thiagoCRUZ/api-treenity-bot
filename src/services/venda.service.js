import { and, eq, ne } from 'drizzle-orm';
import { db } from '../db/client.js';
import { vendas } from '../db/schema.js';

export const STATUS_AGUARDANDO = 'Aguardando Pagamento';
export const STATUS_PAGA = 'Paga';

// Confirmação de pagamento feita por um humano (a API não valida PIX sozinha).
//
// Idempotente: repetir a mesma chamada não altera nada — importante porque o
// deskcomm repete a chamada até dar certo. Retorna `null` se a venda não existe.
//
// Desfazer só age em vendas que estão "Paga": se o n8n já levou a venda para
// outro status (ex: enviada), não sobrescrevemos.
export const vendaService = {
    async definirPagamento(idVenda, { pago, confirmadoPor }) {
        const condicao = pago
            ? and(eq(vendas.id, idVenda), ne(vendas.statusVenda, STATUS_PAGA))
            : and(eq(vendas.id, idVenda), eq(vendas.statusVenda, STATUS_PAGA));

        const valores = pago
            ? { statusVenda: STATUS_PAGA, pagoEm: new Date(), pagamentoConfirmadoPor: confirmadoPor }
            : { statusVenda: STATUS_AGUARDANDO, pagoEm: null, pagamentoConfirmadoPor: null };

        const [alterada] = await db.update(vendas).set(valores).where(condicao).returning();
        if (alterada) return { venda: alterada, alterou: true };

        const [existente] = await db.select().from(vendas).where(eq(vendas.id, idVenda)).limit(1);
        return existente ? { venda: existente, alterou: false } : null;
    },
};

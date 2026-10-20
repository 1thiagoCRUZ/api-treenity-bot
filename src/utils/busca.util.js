import { ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

// Busca por texto das listas do painel (vendas e atendimentos).
// Sem a extensão unaccent no banco, a comparação é ilike simples: ignora
// maiúscula/minúscula, mas "Joao" não casa com "João".

export const BUSCA_MAX_CARACTERES = 80;
const TRECHO_MAX_CARACTERES = 120;

// Query string: 1 a 80 caracteres depois do trim. "busca=" ou "busca=   " (o campo
// do painel vazio) vale como "sem busca" — ver normalizarBusca.
export const buscaSchema = z.string().trim().max(BUSCA_MAX_CARACTERES).optional();

// Aparar e juntar espaços repetidos; vazio vira undefined (= sem filtro).
export function normalizarBusca(valor) {
    if (typeof valor !== 'string') return undefined;
    const termo = valor.trim().replace(/\s+/g, ' ');
    return termo ? termo : undefined;
}

// Escapa o que o LIKE trata como curinga (% e _) e o próprio escape (\), para que
// "50%" procure o texto "50%" e não "50 seguido de qualquer coisa".
export function escaparLike(termo) {
    return termo.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function padraoContem(termo) {
    return `%${escaparLike(termo)}%`;
}

// Telefone: só se o termo for um número (dígitos, espaço, +, -, ., parênteses) com
// ao menos 3 dígitos. "João 2" não vira a busca "2" por telefone.
export function digitosDoTelefone(termo) {
    if (!/^[\d\s+().-]+$/.test(termo)) return null;
    const digitos = termo.replace(/\D/g, '');
    return digitos.length >= 3 ? digitos : null;
}

// Condição para o nome do cliente e o id_face (telefone): id_face casa pelo texto
// digitado e, quando o termo é um número, também só pelos dígitos ("(11) 98888-7777"
// acha o id_face 5511988887777 — e vice-versa, se o id_face estiver formatado).
export function condicaoCliente(termo, colunaNome, colunaIdFace) {
    const padrao = padraoContem(termo);
    const condicoes = [ilike(colunaNome, padrao), ilike(colunaIdFace, padrao)];
    const digitos = digitosDoTelefone(termo);
    if (digitos) {
        condicoes.push(sql`regexp_replace(${colunaIdFace}, '\\D', '', 'g') like ${padraoContem(digitos)}`);
    }
    return or(...condicoes);
}

// Um pedaço da mensagem em volta do trecho que casou (~120 caracteres), com
// reticências onde cortou. null se o texto não contém o termo.
export function extrairTrecho(conteudo, termo, max = TRECHO_MAX_CARACTERES) {
    if (typeof conteudo !== 'string' || !termo) return null;
    const texto = conteudo.replace(/\s+/g, ' ').trim();
    const posicao = texto.toLowerCase().indexOf(termo.toLowerCase());
    if (posicao < 0) return null;
    if (texto.length <= max) return texto;
    const sobra = Math.max(max - termo.length, 0);
    let inicio = Math.max(posicao - Math.floor(sobra / 3), 0);
    let fim = Math.min(inicio + max, texto.length);
    inicio = Math.max(fim - max, 0);
    return `${inicio > 0 ? '…' : ''}${texto.slice(inicio, fim)}${fim < texto.length ? '…' : ''}`;
}

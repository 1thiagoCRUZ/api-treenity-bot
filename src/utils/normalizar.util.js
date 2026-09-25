// Espelho em JS da função normalizar_texto() do banco do bot, que o n8n usa para
// comparar a mensagem do cliente com os gatilhos de respostas_rapidas:
//
//   btrim(regexp_replace(lower(translate(t, 'áà...Ç', 'aa...C')), '[^a-z0-9 ]', ' ', 'g'))
//
// Se as duas divergirem, o gatilho gravado nunca casa e ninguém entende por quê.
// Por isso a mesma tabela de acentos, e não normalize('NFD'): o NFD transformaria
// "ñ" em "n", enquanto o banco transforma em espaço.
const COM_ACENTO = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
const SEM_ACENTO = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC';
const MAPA_ACENTOS = new Map([...COM_ACENTO].map((letra, i) => [letra, SEM_ACENTO[i]]));

// Única diferença proposital: aqui os espaços repetidos viram um só. O n8n
// procura ' gatilho ' dentro de ' mensagem ', então um gatilho com espaço duplo
// ("bom  dia") nunca casaria com uma mensagem normal.
export function normalizarGatilho(valor) {
    const semAcento = [...String(valor)].map((letra) => MAPA_ACENTOS.get(letra) ?? letra).join('');
    return semAcento
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/ +/g, ' ')
        .trim();
}

// Normaliza, descarta os curtos demais (um gatilho de 1 letra casaria com quase
// tudo) e remove duplicatas, preservando a ordem em que o dono digitou.
export function normalizarGatilhos(lista) {
    const vistos = new Set();
    for (const item of lista) {
        const gatilho = normalizarGatilho(item);
        if (gatilho.length >= 2) vistos.add(gatilho);
    }
    return [...vistos];
}

// Cursor de paginação opaco para listas ordenadas por (timestamp desc, id desc).
//
// Guarda o timestamp COMO TEXTO do Postgres (`coluna::text`, com microssegundos),
// e não como Date: o Date do JS tem só milissegundos, e comparar um cursor
// truncado contra a coluna pularia ou repetiria linhas gravadas no mesmo
// milissegundo (o n8n grava várias por segundo).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;

export function codificarCursor(timestampTexto, id) {
    return Buffer.from(JSON.stringify({ t: timestampTexto, id })).toString('base64url');
}

// Devolve { t, id } ou null se o texto não for um cursor válido — quem chama
// responde 400. Validar o formato aqui é o que permite passar `t` e `id` como
// parâmetros da query com segurança.
export function decodificarCursor(texto) {
    try {
        const { t, id } = JSON.parse(Buffer.from(String(texto), 'base64url').toString('utf8'));
        if (typeof t !== 'string' || typeof id !== 'string') return null;
        if (!TIMESTAMP_REGEX.test(t) || !UUID_REGEX.test(id)) return null;
        return { t, id };
    } catch {
        return null;
    }
}

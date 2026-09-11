import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega o .env da raiz do projeto uma única vez. Qualquer módulo que
// precise de variáveis de ambiente deve importar este arquivo primeiro
// (ou importar `requireEnv`, que já cobre o mesmo efeito colateral).
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(
            `Variável de ambiente obrigatória ausente: ${name}. Verifique o arquivo .env (veja .env.example).`
        );
    }
    return value;
}

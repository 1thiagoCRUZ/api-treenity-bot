import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tenta carregar o arquivo .env tanto da raiz do projeto quanto da pasta src/
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config(); // Fallback para process.cwd()

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('SUPABASE_URL e SUPABASE_KEY não encontrados. Verifique se o arquivo .env está presente em /src/.env ou na raiz do projeto e possui as credenciais.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
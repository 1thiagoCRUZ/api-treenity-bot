import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { requireEnv } from '../config/env.js';
import * as schema from './schema.js';

const { Pool } = pg;

const pool = new Pool({
    connectionString: requireEnv('DATABASE_URL'),
    ssl: { rejectUnauthorized: false },
    // Padrão do pg: fecha conexão ociosa em 10 s e sem keepAlive. Num tráfego
    // esparso quase toda requisição pagava TCP+TLS+login novos no banco.
    max: 10, // + 1 conexão dedicada do painel-listener (Client próprio, fora do pool)
    idleTimeoutMillis: 120_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    connectionTimeoutMillis: 10_000,
});

// Erro numa conexão ociosa (ex.: banco reiniciou) não pode derrubar o processo.
pool.on('error', (erro) => console.error('[DB] Erro em conexão ociosa do pool:', erro.message));

export const db = drizzle(pool, { schema });

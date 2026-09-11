import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { requireEnv } from '../config/env.js';

const pool = new pg.Pool({
    connectionString: requireEnv('DATABASE_URL'),
    ssl: { rejectUnauthorized: false },
});
const db = drizzle(pool);

console.log('[Migrate] Aplicando migrations pendentes...');
await migrate(db, { migrationsFolder: './drizzle' });
console.log('[Migrate] Migrations aplicadas com sucesso!');

await pool.end();

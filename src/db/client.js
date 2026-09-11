import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { requireEnv } from '../config/env.js';
import * as schema from './schema.js';

const { Pool } = pg;

const pool = new Pool({
    connectionString: requireEnv('DATABASE_URL'),
    ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });

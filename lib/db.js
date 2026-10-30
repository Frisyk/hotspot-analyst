import { Pool } from 'pg';

let pool;

/** Satu connection pool bersama untuk semua route handler. */
export function getPool() {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      const isSsl = process.env.DATABASE_URL.includes('supabase') || process.env.DB_SSL === 'true';
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 12,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      });
    } else {
      const host = process.env.DB_HOST || 'db';
      const isSsl = host.includes('supabase') || process.env.DB_SSL === 'true';
      pool = new Pool({
        host,
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        database: process.env.POSTGRES_DB || 'geonode_data',
        max: 12,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      });
    }
  }
  return pool;
}

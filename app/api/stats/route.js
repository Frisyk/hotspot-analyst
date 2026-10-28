import { NextResponse } from 'next/server';
import { Pool } from 'pg';

let pool;
function getPool() {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      const isSsl = process.env.DATABASE_URL.includes('supabase') || process.env.DB_SSL === 'true';
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      });
    } else {
      const host = process.env.DB_HOST || 'db';
      const isSsl = host.includes('supabase') || process.env.DB_SSL === 'true';
      pool = new Pool({
        host: host,
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        database: process.env.POSTGRES_DB || 'geonode_data',
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      });
    }
  }
  return pool;
}

let statsCache = null;
let statsCacheTs = 0;
const STATS_TTL = 300_000; // 5 menit cache in-memory

export async function GET() {
  if (statsCache && Date.now() - statsCacheTs < STATS_TTL) {
    return NextResponse.json(statsCache, {
      headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT' },
    });
  }

  const client = await getPool().connect();
  try {
    const tableCheckRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'monitoring' 
        AND table_name IN ('alert_fire_firms', 'alert_fire_viirssnpp_raw', 'alert_fire_sipongi_raw')
    `);
    const availableTables = new Set(tableCheckRes.rows.map(r => r.table_name));

    const queries = [];
    if (availableTables.has('alert_fire_firms')) {
      queries.push(`
        SELECT 
          'firms' AS source, 
          COUNT(*)::int AS count, 
          to_char(MIN(datetm_loc), 'YYYY-MM-DD"T"HH24:MI') AS min_time, 
          to_char(MAX(datetm_loc), 'YYYY-MM-DD"T"HH24:MI') AS max_time 
        FROM monitoring.alert_fire_firms
      `);
    } else if (availableTables.has('alert_fire_viirssnpp_raw')) {
      queries.push(`
        SELECT 
          'firms' AS source, 
          COUNT(*)::int AS count, 
          to_char(MIN(datetm_loc), 'YYYY-MM-DD"T"HH24:MI') AS min_time, 
          to_char(MAX(datetm_loc), 'YYYY-MM-DD"T"HH24:MI') AS max_time 
        FROM monitoring.alert_fire_viirssnpp_raw
      `);
    }
    if (availableTables.has('alert_fire_sipongi_raw')) {
      queries.push(`
        SELECT 
          'sipongi' AS source, 
          COUNT(*)::int AS count, 
          to_char(MIN(datetm_loc), 'YYYY-MM-DD"T"HH24:MI') AS min_time, 
          to_char(MAX(datetm_loc), 'YYYY-MM-DD"T"HH24:MI') AS max_time 
        FROM monitoring.alert_fire_sipongi_raw
      `);
    }

    if (queries.length === 0) {
      return NextResponse.json({
        sources: {},
        min_time: null,
        max_time: null,
        total: 0,
      });
    }

    const result = await client.query(queries.join(' UNION ALL '));

    let overallMin = null;
    let overallMax = null;
    let total = 0;
    const sources = {};

    result.rows.forEach(r => {
      sources[r.source] = r.count;
      total += r.count;
      if (r.min_time && (!overallMin || r.min_time < overallMin)) overallMin = r.min_time;
      if (r.max_time && (!overallMax || r.max_time > overallMax)) overallMax = r.max_time;
    });

    const payload = {
      sources,
      min_time: overallMin,
      max_time: overallMax,
      total,
      density_levels: [
        { label: 'Jarang (1 deteksi)', color: '#7F0000', minCount: 1 },
        { label: 'Sedikit (2-5)', color: '#E52B1E', minCount: 2 },
        { label: 'Menumpuk (6-15)', color: '#FF6B00', minCount: 6 },
        { label: 'Sering (16-40)', color: '#FFB300', minCount: 16 },
        { label: 'Sangat Padat (>40)', color: '#FFFFFF', minCount: 41 },
      ],
    };

    statsCache = payload;
    statsCacheTs = Date.now();

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Error in /api/stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

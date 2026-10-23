import { NextResponse } from 'next/server';
import { Pool } from 'pg';

// Initialize connection pool
let pool;
function getPool() {
  if (!pool) {
    if (process.env.DATABASE_URL) {
      const isSsl = process.env.DATABASE_URL.includes('supabase') || process.env.DB_SSL === 'true';
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
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
        max: 10,
        idleTimeoutMillis: 30000,
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      });
    }
  }
  return pool;
}

// Cache table availability check to avoid extra queries per request
let hasCheckedTables = false;
let hasFirmsView = true;
let hasSipongi = true;

async function checkTables(client) {
  if (hasCheckedTables) return;
  try {
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'monitoring' 
        AND table_name IN ('alert_fire_firms', 'alert_fire_sipongi_raw')
    `);
    const tables = new Set(res.rows.map(r => r.table_name));
    hasFirmsView = tables.has('alert_fire_firms');
    hasSipongi = tables.has('alert_fire_sipongi_raw');
    hasCheckedTables = true;
  } catch (e) {
    console.warn('Could not query information_schema, using defaults:', e.message);
    hasCheckedTables = true;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start'); // e.g. '2026-10-20 00:00:00'
  const end = searchParams.get('end');     // e.g. '2026-10-23 23:59:59'
  const source = searchParams.get('source') || 'all'; // 'all', 'firms', 'sipongi'
  const limit = Math.min(parseInt(searchParams.get('limit') || '15000', 10), 50000);

  const client = await getPool().connect();
  try {
    await checkTables(client);

    const queries = [];
    const params = [];
    let paramIndex = 1;

    let timeFilterFirms = '';
    let timeFilterSipongi = '';

    if (start && end) {
      timeFilterFirms = `WHERE datetm_loc >= $${paramIndex} AND datetm_loc <= $${paramIndex + 1}`;
      timeFilterSipongi = `WHERE datetm_loc >= $${paramIndex} AND datetm_loc <= $${paramIndex + 1}`;
      params.push(start.replace('T', ' '), end.replace('T', ' '));
      paramIndex += 2;
    } else if (start) {
      timeFilterFirms = `WHERE datetm_loc >= $${paramIndex}`;
      timeFilterSipongi = `WHERE datetm_loc >= $${paramIndex}`;
      params.push(start.replace('T', ' '));
      paramIndex += 1;
    } else if (end) {
      timeFilterFirms = `WHERE datetm_loc <= $${paramIndex}`;
      timeFilterSipongi = `WHERE datetm_loc <= $${paramIndex}`;
      params.push(end.replace('T', ' '));
      paramIndex += 1;
    }

    // 1. FIRMS query (menggunakan view monitoring.alert_fire_firms yang menggabungkan 4 sensor FIRMS)
    if ((source === 'all' || source === 'firms') && hasFirmsView) {
      queries.push(`
        SELECT 
          'firms' AS source_type,
          source AS sensor,
          COALESCE(uid_alert, gen_random_uuid()::text) AS id,
          latitude::float,
          longitude::float,
          to_char(datetm_loc, 'YYYY-MM-DD HH24:MI:SS') AS datetm_loc,
          to_char(date_loc, 'YYYY-MM-DD') AS date_str,
          EXTRACT(HOUR FROM datetm_loc)::int AS hour,
          confidence::text AS confidence,
          COALESCE(brightness, 0)::float AS brightness,
          'Kalimantan' AS province
        FROM monitoring.alert_fire_firms
        ${timeFilterFirms}
      `);
    }

    // 2. SIPONGI query
    if ((source === 'all' || source === 'sipongi') && hasSipongi) {
      queries.push(`
        SELECT 
          'sipongi' AS source_type,
          COALESCE(sumber, 'SIPONGI') AS sensor,
          COALESCE(uid_alert, gen_random_uuid()::text) AS id,
          lat::float AS latitude,
          long::float AS longitude,
          to_char(datetm_loc, 'YYYY-MM-DD HH24:MI:SS') AS datetm_loc,
          to_char(date_loc, 'YYYY-MM-DD') AS date_str,
          EXTRACT(HOUR FROM datetm_loc)::int AS hour,
          COALESCE(confidence_level, confidence::text, 'unknown') AS confidence,
          0::float AS brightness,
          COALESCE(nama_provinsi, 'Kalimantan') AS province
        FROM monitoring.alert_fire_sipongi_raw
        ${timeFilterSipongi}
      `);
    }

    if (queries.length === 0) {
      return NextResponse.json({
        type: 'FeatureCollection',
        features: [],
        metadata: { total: 0, dateStats: {}, minDatetm: null, maxDatetm: null }
      });
    }

    const finalQuery = `${queries.join(' UNION ALL ')} ORDER BY datetm_loc ASC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await client.query(finalQuery, params);

    // Compute date statistics and geojson features
    const dateStats = {};
    let minDatetm = null;
    let maxDatetm = null;

    const features = result.rows.map((row) => {
      const d = row.date_str;
      dateStats[d] = (dateStats[d] || 0) + 1;

      if (!minDatetm || row.datetm_loc < minDatetm) minDatetm = row.datetm_loc;
      if (!maxDatetm || row.datetm_loc > maxDatetm) maxDatetm = row.datetm_loc;

      return {
        type: 'Feature',
        id: row.id,
        geometry: {
          type: 'Point',
          coordinates: [row.longitude, row.latitude],
        },
        properties: {
          id: row.id,
          source: row.source_type,
          sensor: row.sensor,
          latitude: row.latitude,
          longitude: row.longitude,
          datetm_loc: row.datetm_loc,
          date: row.date_str,
          hour: row.hour,
          confidence: row.confidence,
          brightness: row.brightness,
          province: row.province,
        },
      };
    });

    return NextResponse.json({
      type: 'FeatureCollection',
      features,
      metadata: {
        total: features.length,
        dateStats,
        minDatetm,
        maxDatetm,
        returned: features.length,
        limit,
      },
    });

  } catch (error) {
    console.error('Error in /api/hotspots:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hotspots', details: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

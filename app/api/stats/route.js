import { NextResponse } from 'next/server';
import { getPool } from '../../../lib/db';

let statsCache = null;
let statsCacheTs = 0;
let statsInflight = null;
const STATS_TTL = 300_000; // 5 menit cache in-memory

const DENSITY_LEVELS = [
  { label: 'Jarang (1 deteksi)', color: '#7F0000', minCount: 1 },
  { label: 'Sedikit (2-5)', color: '#E52B1E', minCount: 2 },
  { label: 'Menumpuk (6-15)', color: '#FF6B00', minCount: 6 },
  { label: 'Sering (16-40)', color: '#FFB300', minCount: 16 },
  { label: 'Sangat Padat (>40)', color: '#FFFFFF', minCount: 41 },
];

export async function GET() {
  if (statsCache && Date.now() - statsCacheTs < STATS_TTL) {
    return NextResponse.json(statsCache, {
      headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT' },
    });
  }

  if (statsInflight) {
    try {
      const payload = await statsInflight;
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT' },
      });
    } catch {
      // Lanjut coba ulang jika gagal
    }
  }

  statsInflight = (async () => {
    const client = await getPool().connect();
    try {
      // Ambil daftar tabel/view beserta estimasi jumlah baris instan dari katalog pg_class (< 1ms)
      const metaRes = await client.query(`
        SELECT c.relname AS table_name,
               c.relkind AS kind,
               GREATEST(c.reltuples::bigint, 0)::int AS est_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'monitoring'
          AND c.relname IN (
            'alert_fire_firms',
            'alert_fire_viirssnpp_raw',
            'alert_fire_viirsnoaa20_raw',
            'alert_fire_viirsnoaa21_raw',
            'alert_fire_modis_raw',
            'alert_fire_sipongi_raw'
          )
      `);

      const available = new Map(metaRes.rows.map((r) => [r.table_name, r]));
      const firmsRawTables = [
        'alert_fire_viirssnpp_raw',
        'alert_fire_viirsnoaa20_raw',
        'alert_fire_viirsnoaa21_raw',
        'alert_fire_modis_raw',
      ].filter((t) => available.has(t));

      const hasFirmsViewOrTable = available.has('alert_fire_firms') || firmsRawTables.length > 0;
      const hasSipongi = available.has('alert_fire_sipongi_raw');

      if (!hasFirmsViewOrTable && !hasSipongi) {
        return {
          sources: {},
          min_time: null,
          max_time: null,
          total: 0,
          density_levels: DENSITY_LEVELS,
        };
      }

      // Gunakan MIN(datetm) dan MAX(datetm) di subquery terpisah agar PostgreSQL
      // melakukan Index Only Scan (Backward/Forward LIMIT 1) pada B-Tree index `datetm` (~1ms),
      // tanpa melakukan Full Table Scan untuk COUNT(*) dan MIN/MAX(datetm_loc).
      const queries = [];

      if (hasFirmsViewOrTable) {
        let firmsEst = available.get('alert_fire_firms')?.est_count || 0;
        if (firmsEst <= 0 && firmsRawTables.length > 0) {
          firmsEst = firmsRawTables.reduce((acc, t) => acc + (available.get(t)?.est_count || 0), 0);
        }
        const targetFirms = available.has('alert_fire_firms') ? 'alert_fire_firms' : firmsRawTables[0];
        const countExpr = firmsEst > 0
          ? `${firmsEst}::int`
          : `(SELECT COUNT(*)::int FROM monitoring.${targetFirms})`;

        queries.push(`
          SELECT
            'firms' AS source,
            ${countExpr} AS count,
            (SELECT to_char(datetm_loc, 'YYYY-MM-DD"T"HH24:MI') FROM monitoring.${targetFirms} WHERE datetm IS NOT NULL ORDER BY datetm ASC LIMIT 1) AS min_time,
            (SELECT to_char(datetm_loc, 'YYYY-MM-DD"T"HH24:MI') FROM monitoring.${targetFirms} WHERE datetm IS NOT NULL ORDER BY datetm DESC LIMIT 1) AS max_time
        `);
      }

      if (hasSipongi) {
        const sipEst = available.get('alert_fire_sipongi_raw')?.est_count || 0;
        const countExpr = sipEst > 0
          ? `${sipEst}::int`
          : `(SELECT COUNT(*)::int FROM monitoring.alert_fire_sipongi_raw)`;

        queries.push(`
          SELECT
            'sipongi' AS source,
            ${countExpr} AS count,
            (SELECT to_char(datetm_loc, 'YYYY-MM-DD"T"HH24:MI') FROM monitoring.alert_fire_sipongi_raw WHERE datetm IS NOT NULL ORDER BY datetm ASC LIMIT 1) AS min_time,
            (SELECT to_char(datetm_loc, 'YYYY-MM-DD"T"HH24:MI') FROM monitoring.alert_fire_sipongi_raw WHERE datetm IS NOT NULL ORDER BY datetm DESC LIMIT 1) AS max_time
        `);
      }

      const result = await client.query(queries.join(' UNION ALL '));

      let overallMin = null;
      let overallMax = null;
      let total = 0;
      const sources = {};

      result.rows.forEach((r) => {
        sources[r.source] = r.count || 0;
        total += r.count || 0;
        if (r.min_time && (!overallMin || r.min_time < overallMin)) overallMin = r.min_time;
        if (r.max_time && (!overallMax || r.max_time > overallMax)) overallMax = r.max_time;
      });

      const payload = {
        sources,
        min_time: overallMin,
        max_time: overallMax,
        total,
        density_levels: DENSITY_LEVELS,
      };

      statsCache = payload;
      statsCacheTs = Date.now();
      return payload;
    } finally {
      client.release();
    }
  })();

  try {
    const payload = await statsInflight;
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Error in /api/stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    statsInflight = null;
  }
}

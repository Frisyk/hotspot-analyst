// Tujuan: app/api/hotspots/spread/route.js
import { NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

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
        host,
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

const ARROW_LIMIT = 5000;
const CELL_LIMIT = 5000;

const spreadCache = new Map();
const SPREAD_CACHE_TTL = 60_000;
const SPREAD_CACHE_MAX = 16;

/**
 * GET /api/hotspots/spread
 *   start, end   'YYYY-MM-DDTHH:mm' (WIB, sama seperti /api/hotspots)
 *   source       all | firms | sipongi
 *   bbox         west,south,east,north (opsional)
 *   minDist      jarak minimum panah dalam meter (default 50; menyaring titik kembar antar sensor)
 *   layers       origin,arrows,grid,order (opsional; hanya query layer yang aktif)
 *
 * Respons JSON:
 *   arrows  [{ from:[lon,lat], to:[lon,lat], bearing, dist, lagMin, cluster, hop, tm }]
 *   cells   [{ cluster, ix, iy, lon, lat, order, count, origin, tm }]   (ukuran sel = cellDeg)
 *   origins [{ lon, lat, cluster, size, children, t, tm }]
 */
export async function GET(request) {
  const cacheKey = request.url;
  const hit = spreadCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < SPREAD_CACHE_TTL) {
    return NextResponse.json(hit.value, {
      headers: { 'Cache-Control': 'private, max-age=30', 'X-Cache': 'HIT' },
    });
  }

  const sp = new URL(request.url).searchParams;
  const start = sp.get('start') || null;
  const end = sp.get('end') || null;
  for (const [k, v] of [['start', start], ['end', end]]) {
    if (v && (v.includes('NaN') || isNaN(Date.parse(v)))) {
      return NextResponse.json({ error: `Invalid ${k} parameter` }, { status: 400 });
    }
  }
  const sourceParam = sp.get('source') || 'all';
  const source = ['all', 'firms', 'sipongi'].includes(sourceParam) ? sourceParam : 'all';
  const minDist = Math.max(0, Number(sp.get('minDist') ?? 50) || 0);

  const layersParam = sp.get('layers') || 'all';
  const wantOrigin = layersParam === 'all' || layersParam.includes('origin');
  const wantArrows = layersParam === 'all' || layersParam.includes('arrows');
  const wantGrid = layersParam === 'all' || layersParam.includes('grid') || layersParam.includes('order');

  let bbox = null;
  const bboxParam = sp.get('bbox');
  if (bboxParam) {
    const b = bboxParam.split(',').map(Number);
    if (b.length === 4 && b.every(Number.isFinite)) bbox = b;
  }

  // datetm disimpan UTC; filter masukan WIB -> ubah parameter (-7 jam)
  // (BUKAN mengubah kolom s.datetm agar PostgreSQL bisa memakai B-TREE INDEX pada datetm!)
  const where = [`s.datetm >= (COALESCE($1::timestamp, '-infinity') - interval '7 hours')`,
                 `s.datetm <= (COALESCE($2::timestamp, 'infinity') - interval '7 hours')`,
                 `($3 = 'all' OR s.source = $3)`];
  const params = [start, end, source];
  if (bbox) {
    params.push(...bbox);
    where.push(`s.lon BETWEEN $4 AND $6 AND s.lat BETWEEN $5 AND $7`);
  }
  const W = where.join(' AND ');

  const client = await getPool().connect();
  try {
    const arrowsQ = wantArrows ? client.query(
      `SELECT s.lon, s.lat, s.parent_lon AS plon, s.parent_lat AS plat, s.bearing_deg, s.parent_dist_m,
              s.parent_lag_min, s.cluster_id, s.hop,
              (EXTRACT(EPOCH FROM (s.datetm + interval '7 hours')) / 60)::float8 AS tm
         FROM monitoring.fire_spread s
        WHERE ${W} AND s.parent_uid IS NOT NULL AND s.parent_lon IS NOT NULL
          AND s.parent_dist_m >= ${minDist}
        ORDER BY s.datetm LIMIT ${ARROW_LIMIT}`, params) : Promise.resolve({ rows: [] });

    // ORDER BY s.cluster_id memanfaatkan fire_spread_cluster_idx (eksekusi ~38ms dibanding 4000ms+)
    const cellsQ = wantGrid ? client.query(
      `SELECT s.cluster_id, s.grid_ix, s.grid_iy, MIN(s.grid_order) AS ord,
              AVG(s.lon)::float8 AS lon, AVG(s.lat)::float8 AS lat,
              COUNT(*)::int AS cnt, BOOL_OR(s.grid_is_origin) AS origin,
              (MIN(EXTRACT(EPOCH FROM (s.datetm + interval '7 hours'))) / 60)::float8 AS tm
         FROM monitoring.fire_spread s
        WHERE ${W} AND s.role <> 'isolated'
        GROUP BY s.cluster_id, s.grid_ix, s.grid_iy
        ORDER BY s.cluster_id LIMIT ${CELL_LIMIT}`, params) : Promise.resolve({ rows: [] });

    const originsQ = wantOrigin ? client.query(
      `SELECT s.lon, s.lat, s.cluster_id, s.cluster_size, s.child_count,
              to_char(s.datetm + interval '7 hours', 'YYYY-MM-DD"T"HH24:MI') AS t,
              (EXTRACT(EPOCH FROM (s.datetm + interval '7 hours')) / 60)::float8 AS tm
         FROM monitoring.fire_spread s
        WHERE ${W} AND s.is_origin
        LIMIT 4000`, params) : Promise.resolve({ rows: [] });

    const [a, c, o] = await Promise.all([arrowsQ, cellsQ, originsQ]);
    const payload = {
      cellDeg: 0.0027,
      arrows: a.rows.map((r) => ({
        from: [r.plon, r.plat], to: [r.lon, r.lat], bearing: r.bearing_deg,
        dist: r.parent_dist_m, lagMin: r.parent_lag_min, cluster: r.cluster_id, hop: r.hop, tm: r.tm,
      })),
      cells: c.rows.map((r) => ({
        cluster: r.cluster_id, ix: r.grid_ix, iy: r.grid_iy, lon: r.lon, lat: r.lat,
        order: r.ord, count: r.cnt, origin: r.origin, tm: r.tm,
      })),
      origins: o.rows.map((r) => ({
        lon: r.lon, lat: r.lat, cluster: r.cluster_id, size: r.cluster_size, children: r.child_count, t: r.t, tm: r.tm,
      })),
      truncated: a.rows.length >= ARROW_LIMIT || c.rows.length >= CELL_LIMIT,
    };

    spreadCache.set(cacheKey, { ts: Date.now(), value: payload });
    while (spreadCache.size > SPREAD_CACHE_MAX) {
      spreadCache.delete(spreadCache.keys().next().value);
    }

    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=30', 'X-Cache': 'MISS' },
    });
  } catch (error) {
    console.error('Error in /api/hotspots/spread:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}
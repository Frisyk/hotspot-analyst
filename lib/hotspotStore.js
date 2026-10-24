import { getPool } from './db';

/**
 * Query layer hotspot. Tiga bentuk keluaran:
 *   - raw     : titik mentah (opsional dibatasi bbox) -> kolom
 *   - grid    : agregasi per (sel, jam, sumber) di dalam PostGIS/SQL -> kolom
 *   - summary : agregasi per (jam, sumber) untuk legenda, header & histogram timeline
 *
 * Tidak ada ORDER BY+LIMIT di atas UNION besar seperti sebelumnya; tidak ada gen_random_uuid()
 * per baris; dan tidak ada to_char() per baris (epoch dihitung integer).
 */

export const RAW_LIMIT = 800000;

// ---------- cek tabel (di-cache) ----------
let checked = false;
let hasFirms = true;
let hasSipongi = true;

async function ensureTables() {
  if (checked) return;
  const client = await getPool().connect();
  try {
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'monitoring'
        AND table_name IN ('alert_fire_firms', 'alert_fire_sipongi_raw')
    `);
    const names = new Set(res.rows.map((r) => r.table_name));
    hasFirms = names.has('alert_fire_firms');
    hasSipongi = names.has('alert_fire_sipongi_raw');
  } catch (e) {
    console.warn('Tidak bisa membaca information_schema, memakai default:', e.message);
  } finally {
    client.release();
  }
  checked = true;
}

async function prepare(opts) {
  await ensureTables();
  return buildSource(opts);
}

// ---------- cache TTL kecil (melindungi DB saat user menggeser peta/timeline) ----------
const cache = new Map();
const CACHE_TTL = 60_000;
const CACHE_MAX = 8;

export async function cached(key, producer) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    cache.delete(key);
    cache.set(key, hit); // LRU bump
    return hit.value;
  }
  const value = await producer();
  cache.set(key, { ts: Date.now(), value });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return value;
}

// ---------- builder SQL ----------
function buildSource({ start, end, source, bbox }) {
  const params = [];
  const p = (v, cast) => {
    params.push(v);
    return `$${params.length}${cast ? '::' + cast : ''}`;
  };

  const sT = start ? p(start.replace('T', ' ')) : null;
  const eT = end ? p(end.replace('T', ' ')) : null;
  const bb = bbox
    ? { w: p(bbox[0], 'float8'), s: p(bbox[1], 'float8'), e: p(bbox[2], 'float8'), n: p(bbox[3], 'float8') }
    : null;

  const where = (lat, lon) => {
    const c = [];
    if (sT) c.push(`datetm_loc >= ${sT}`);
    if (eT) c.push(`datetm_loc <= ${eT}`);
    if (bb) c.push(`${lon} BETWEEN ${bb.w} AND ${bb.e}`, `${lat} BETWEEN ${bb.s} AND ${bb.n}`);
    return c.length ? 'WHERE ' + c.join(' AND ') : '';
  };

  const legs = [];
  if ((source === 'all' || source === 'firms') && hasFirms) {
    legs.push(`
      SELECT 0 AS kind, source::text AS sensor, latitude::float8 AS lat, longitude::float8 AS lon,
             datetm_loc, COALESCE(brightness, 0)::float8 AS bright,
             COALESCE(confidence::text, '-') AS conf, 'Kalimantan'::text AS prov
      FROM monitoring.alert_fire_firms ${where('latitude', 'longitude')}`);
  }
  if ((source === 'all' || source === 'sipongi') && hasSipongi) {
    legs.push(`
      SELECT 1, COALESCE(sumber, 'SIPONGI')::text, lat::float8, long::float8,
             datetm_loc, 0::float8,
             COALESCE(confidence_level, confidence::text, 'unknown')::text,
             COALESCE(nama_provinsi, 'Kalimantan')::text
      FROM monitoring.alert_fire_sipongi_raw ${where('lat', 'long')}`);
  }
  if (legs.length === 0) return null;
  return { cte: `WITH src AS (${legs.join(' UNION ALL ')})`, params, p };
}

async function withClient(fn) {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// ---------- kamus string -> indeks uint8 ----------
function makeDict() {
  const map = new Map();
  const list = [];
  return {
    list,
    id(key, payload) {
      let i = map.get(key);
      if (i === undefined) {
        i = Math.min(list.length, 255);
        if (list.length < 255) list.push(payload ?? key);
        map.set(key, i);
      }
      return i;
    },
  };
}

function emptyCols() {
  return {
    n: 0,
    lon: new Float32Array(0), lat: new Float32Array(0), tMin: new Float64Array(0),
    cnt: new Float32Array(0), bright: new Float32Array(0),
    sensor: new Uint8Array(0), confIdx: new Uint8Array(0), provIdx: new Uint8Array(0),
    sensors: [], conf: [], prov: [],
  };
}

// ---------- RAW ----------
export async function queryRaw(opts, limit = RAW_LIMIT) {
  const built = await prepare(opts);
  if (!built) return { cols: emptyCols(), truncated: false };

  const sql = `${built.cte}
    SELECT kind, sensor, lat, lon, floor(extract(epoch FROM datetm_loc::timestamp) / 60)::int AS tmin,
           bright, conf, prov
    FROM src
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    ORDER BY tmin
    LIMIT ${Number(limit) + 1}`;

  const res = await withClient((c) => c.query({ text: sql, values: built.params, rowMode: 'array' }));
  let rows = res.rows;
  const truncated = rows.length > limit;
  if (truncated) rows = rows.slice(0, limit);

  const n = rows.length;
  const sensors = makeDict();
  const confs = makeDict();
  const provs = makeDict();
  const cols = {
    n,
    lon: new Float32Array(n), lat: new Float32Array(n), tMin: new Float64Array(n),
    cnt: null, bright: new Float32Array(n),
    sensor: new Uint8Array(n), confIdx: new Uint8Array(n), provIdx: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const r = rows[i]; // [kind, sensor, lat, lon, tmin, bright, conf, prov]
    cols.lat[i] = r[2];
    cols.lon[i] = r[3];
    cols.tMin[i] = r[4];
    cols.bright[i] = r[5];
    cols.sensor[i] = sensors.id(`${r[0]}|${r[1]}`, [r[1], r[0]]);
    cols.confIdx[i] = confs.id(r[6]);
    cols.provIdx[i] = provs.id(r[7]);
  }
  cols.sensors = sensors.list;
  cols.conf = confs.list;
  cols.prov = provs.list;
  return { cols, truncated };
}

// ---------- GRID ----------
export async function queryGrid(opts, cell) {
  const built = await prepare(opts);
  if (!built) return { cols: emptyCols(), truncated: false };
  const c = built.p(cell, 'float8');

  const sql = `${built.cte}
    SELECT kind,
           floor(lon / ${c})::int AS gx,
           floor(lat / ${c})::int AS gy,
           floor(extract(epoch FROM datetm_loc::timestamp) / 3600)::int AS hr,
           count(*)::int AS cnt,
           max(bright) AS bright
    FROM src
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    GROUP BY 1, 2, 3, 4
    ORDER BY hr`;

  const res = await withClient((cl) => cl.query({ text: sql, values: built.params, rowMode: 'array' }));
  const rows = res.rows;
  const n = rows.length;
  const cols = {
    n,
    lon: new Float32Array(n), lat: new Float32Array(n), tMin: new Float64Array(n),
    cnt: new Float32Array(n), bright: new Float32Array(n),
    sensor: new Uint8Array(n), confIdx: new Uint8Array(n), provIdx: new Uint8Array(n),
    sensors: [['FIRMS', 0], ['SIPONGI', 1]], conf: ['-'], prov: ['Kalimantan'],
  };
  for (let i = 0; i < n; i++) {
    const r = rows[i]; // [kind, gx, gy, hr, cnt, bright]
    cols.sensor[i] = r[0];
    cols.lon[i] = (r[1] + 0.5) * cell;
    cols.lat[i] = (r[2] + 0.5) * cell;
    cols.tMin[i] = r[3] * 60;
    cols.cnt[i] = r[4];
    cols.bright[i] = r[5] || 0;
  }
  return { cols, truncated: false };
}

// ---------- SUMMARY ----------
export async function querySummary(opts) {
  const built = await prepare({ ...opts, bbox: null });
  if (!built) return { total: 0, hr0: 0, firms: [], sipongi: [], dateStats: {}, bbox: null };

  const sql = `${built.cte}
    SELECT kind,
           floor(extract(epoch FROM datetm_loc::timestamp) / 3600)::int AS hr,
           count(*)::int AS cnt,
           min(lon) AS w, max(lon) AS e, min(lat) AS s, max(lat) AS n
    FROM src
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    GROUP BY 1, 2
    ORDER BY 2`;

  const res = await withClient((c) => c.query({ text: sql, values: built.params, rowMode: 'array' }));
  const rows = res.rows;
  if (rows.length === 0) return { total: 0, hr0: 0, firms: [], sipongi: [], dateStats: {}, bbox: null };

  const hr0 = rows[0][1];
  const hr1 = rows[rows.length - 1][1];
  const len = Math.min(hr1 - hr0 + 1, 24 * 800);
  const firms = new Array(len).fill(0);
  const sipongi = new Array(len).fill(0);
  const dateStats = {};
  let total = 0;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;

  for (const [kind, hr, cnt, rw, re, rs, rn] of rows) {
    const idx = hr - hr0;
    if (idx < len) (kind === 0 ? firms : sipongi)[idx] += cnt;
    const d = new Date(hr * 3600000).toISOString().slice(0, 10);
    dateStats[d] = (dateStats[d] || 0) + cnt;
    total += cnt;
    if (rw < w) w = rw;
    if (re > e) e = re;
    if (rs < s) s = rs;
    if (rn > n) n = rn;
  }
  return { total, hr0, firms, sipongi, dateStats, bbox: [w, s, e, n] };
}

// ---------- DETAIL (Satu titik spesifik) ----------
export async function queryDetail({ lat, lon, radius = 0.008 }) {
  await discoverTables();
  const rows = [];
  const r = Math.max(0.001, Math.min(0.05, radius));

  if (hasFirms) {
    try {
      const sql = `
        SELECT 0 AS kind,
               source::text AS sensor,
               uid_alert::text AS uid,
               latitude::float8 AS lat,
               longitude::float8 AS lon,
               brightness::float8 AS bright,
               confidence::text AS conf,
               COALESCE(frp, 0)::float8 AS frp,
               COALESCE(daynight::text, '-') AS daynight,
               COALESCE(satellite::text, '-') AS satellite,
               COALESCE(instrument::text, '-') AS instrument,
               to_char(datetm_loc, 'YYYY-MM-DD HH24:MI:SS') AS datetm_loc
        FROM monitoring.alert_fire_firms
        WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4
        ORDER BY (abs(latitude - $5) + abs(longitude - $6))
        LIMIT 6`;
      const res = await withClient((c) =>
        c.query(sql, [lat - r, lat + r, lon - r, lon + r, lat, lon])
      );
      rows.push(...res.rows);
    } catch (err) {
      console.warn('Gagal mengambil detail FIRMS:', err.message);
    }
  }

  if (hasSipongi) {
    try {
      const sql = `
        SELECT 1 AS kind,
               COALESCE(sumber, 'SIPONGI')::text AS sensor,
               NULL::text AS uid,
               lat::float8,
               long::float8 AS lon,
               0::float8 AS bright,
               COALESCE(confidence_level, confidence::text, 'unknown')::text AS conf,
               0::float8 AS frp,
               '-'::text AS daynight,
               COALESCE(sumber, 'SIPONGI')::text AS satellite,
               '-'::text AS instrument,
               to_char(datetm_loc, 'YYYY-MM-DD HH24:MI:SS') AS datetm_loc,
               nama_provinsi::text,
               nama_kabupaten::text,
               nama_kecamatan::text,
               nama_kelurahan::text
        FROM monitoring.alert_fire_sipongi_raw
        WHERE lat BETWEEN $1 AND $2 AND long BETWEEN $3 AND $4
        ORDER BY (abs(lat - $5) + abs(long - $6))
        LIMIT 6`;
      const res = await withClient((c) =>
        c.query(sql, [lat - r, lat + r, lon - r, lon + r, lat, lon])
      );
      rows.push(...res.rows);
    } catch (err) {
      console.warn('Gagal mengambil detail SIPONGI:', err.message);
    }
  }

  return rows;
}

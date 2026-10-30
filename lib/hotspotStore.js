import { getPool } from './db';

/**
 * Query layer hotspot. Tiga bentuk keluaran:
 *   - raw     : titik mentah (opsional dibatasi bbox) -> kolom
 *   - grid    : agregasi per (sel, jam, sumber) di dalam PostGIS/SQL -> kolom
 *   - summary : agregasi per (jam, sumber) untuk legenda, header & histogram timeline
 *
 * Optimasi performa:
 *   1. Filter waktu memakai kolom `datetm` (UTC) yang memiliki B-Tree Index (parameter WIB digeser -7 jam),
 *      sama seperti /api/hotspots/spread, menghindari Full Table Scan pada `datetm_loc`.
 *   2. Tidak ada ORDER BY ekspresi di atas UNION ALL pada queryRaw.
 *   3. queryDetail memakai GIST spatial index (`geometry && ST_MakeEnvelope`) + eksekusi paralel.
 */

export const RAW_LIMIT = 60000;

// ---------- metadata skema & tabel (di-cache sekali saat startup) ----------
let ensurePromise = null;
let firmsTable = 'alert_fire_firms';
let hasFirms = true;
let hasSipongi = true;

let firmsHasDatetm = true;
let firmsDatetmTz = true; // default di backfill_alert_fire_firms.py adalah timestamptz
let firmsHasGeom = true;

let sipongiHasDatetm = true;
let sipongiDatetmTz = false; // default di backfill_alert_fire_sipongi.py adalah timestamp naive UTC
let sipongiHasGeom = true;
let sipongiCols = new Set(['nama_provinsi', 'kabkota', 'kecamatan', 'desa', 'uid_alert']);

async function ensureIndexesInBackground(baseTables, colsByTable) {
  const client = await getPool().connect();
  try {
    for (const tbl of baseTables) {
      const cols = colsByTable.get(tbl);
      if (!cols) continue;
      if (cols.has('datetm')) {
        await client
          .query(`CREATE INDEX IF NOT EXISTS ${tbl}_datetm_idx ON monitoring.${tbl} (datetm)`)
          .catch(() => {});
      }
      if (cols.has('geometry')) {
        await client
          .query(`CREATE INDEX IF NOT EXISTS ${tbl}_geom_idx ON monitoring.${tbl} USING GIST (geometry)`)
          .catch(() => {});
      }
    }
  } catch {
    // Abaikan jika user DB read-only atau index sedang dibuat
  } finally {
    client.release();
  }
}

export async function ensureTables() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    const client = await getPool().connect();
    try {
      const [tblRes, colRes] = await Promise.all([
        client.query(`
          SELECT table_name, table_type
          FROM information_schema.tables
          WHERE table_schema = 'monitoring'
            AND table_name IN (
              'alert_fire_firms',
              'alert_fire_viirssnpp_raw',
              'alert_fire_viirsnoaa20_raw',
              'alert_fire_viirsnoaa21_raw',
              'alert_fire_modis_raw',
              'alert_fire_sipongi_raw'
            )
        `),
        client.query(`
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'monitoring'
            AND table_name IN (
              'alert_fire_firms',
              'alert_fire_viirssnpp_raw',
              'alert_fire_viirsnoaa20_raw',
              'alert_fire_viirsnoaa21_raw',
              'alert_fire_modis_raw',
              'alert_fire_sipongi_raw'
            )
        `),
      ]);

      const tableTypes = new Map(tblRes.rows.map((r) => [r.table_name, r.table_type]));
      const colsByTable = new Map();
      const typeByTableCol = new Map();

      for (const r of colRes.rows) {
        if (!colsByTable.has(r.table_name)) colsByTable.set(r.table_name, new Set());
        colsByTable.get(r.table_name).add(r.column_name);
        typeByTableCol.set(`${r.table_name}.${r.column_name}`, (r.data_type || '').toLowerCase());
      }

      if (tableTypes.has('alert_fire_firms')) {
        firmsTable = 'alert_fire_firms';
        hasFirms = true;
      } else if (tableTypes.has('alert_fire_viirssnpp_raw')) {
        firmsTable = 'alert_fire_viirssnpp_raw';
        hasFirms = true;
      } else {
        hasFirms = false;
      }

      hasSipongi = tableTypes.has('alert_fire_sipongi_raw');

      if (hasFirms) {
        const fc = colsByTable.get(firmsTable) || new Set();
        firmsHasDatetm = fc.has('datetm');
        const dtType = typeByTableCol.get(`${firmsTable}.datetm`) || 'timestamp with time zone';
        firmsDatetmTz = dtType.includes('with time zone');
        firmsHasGeom = fc.has('geometry');
      }

      if (hasSipongi) {
        const sc = colsByTable.get('alert_fire_sipongi_raw') || new Set();
        sipongiCols = sc;
        sipongiHasDatetm = sc.has('datetm');
        const dtType = typeByTableCol.get('alert_fire_sipongi_raw.datetm') || 'timestamp without time zone';
        sipongiDatetmTz = dtType.includes('with time zone');
        sipongiHasGeom = sc.has('geometry');
      }

      // Pastikan index datetm & geometry tersedia di tabel fisik tanpa memblokir request
      const baseTables = [];
      for (const [tName, tType] of tableTypes.entries()) {
        if (tType === 'BASE TABLE') baseTables.push(tName);
      }
      if (baseTables.length > 0) {
        ensureIndexesInBackground(baseTables, colsByTable);
      }
    } catch (e) {
      console.warn('Tidak bisa membaca information_schema, memakai default:', e.message);
    } finally {
      client.release();
    }
  })();
  return ensurePromise;
}

async function prepare(opts) {
  await ensureTables();
  return buildSource(opts);
}

// ---------- cache TTL + in-flight deduplication ----------
const cache = new Map();
const inflight = new Map();
const CACHE_TTL = 120_000;
const CACHE_MAX = 32;

export async function cached(key, producer, ttlSec) {
  const ttl = ttlSec ? ttlSec * 1000 : CACHE_TTL;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttl) {
    cache.delete(key);
    cache.set(key, hit); // LRU bump
    return hit.value;
  }
  if (inflight.has(key)) {
    return inflight.get(key);
  }
  const p = (async () => {
    try {
      const value = await producer();
      cache.set(key, { ts: Date.now(), value });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/**
 * Ekspresi filter waktu yang ramah B-Tree Index pada `datetm` (UTC).
 * Masukan `paramRef` adalah string waktu WIB ('YYYY-MM-DD HH:mm').
 */
function buildTimeCond(op, paramRef, hasDatetm, isTz) {
  if (!hasDatetm) {
    return `datetm_loc ${op} ${paramRef}::timestamp`;
  }
  if (isTz) {
    return `datetm ${op} ((${paramRef}::timestamp - interval '7 hours') AT TIME ZONE 'UTC')`;
  }
  return `datetm ${op} (${paramRef}::timestamp - interval '7 hours')`;
}

// ---------- builder SQL ----------
function buildSource({ start, end, source, bbox, perLegLimit = null }) {
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

  const where = (lat, lon, hasDatetm, isTz) => {
    const c = [`${lat} IS NOT NULL`, `${lon} IS NOT NULL`];
    if (sT) c.push(buildTimeCond('>=', sT, hasDatetm, isTz));
    if (eT) c.push(buildTimeCond('<=', eT, hasDatetm, isTz));
    if (bb) c.push(`${lon} BETWEEN ${bb.w} AND ${bb.e}`, `${lat} BETWEEN ${bb.s} AND ${bb.n}`);
    return 'WHERE ' + c.join(' AND ');
  };

  const limitClause = perLegLimit ? `LIMIT ${Number(perLegLimit)}` : '';

  const legs = [];
  if ((source === 'all' || source === 'firms') && hasFirms) {
    legs.push(`
      (SELECT 0 AS kind, COALESCE(source::text, 'FIRMS') AS sensor, latitude::float8 AS lat, longitude::float8 AS lon,
              datetm_loc, COALESCE(brightness, 0)::float8 AS bright,
              COALESCE(confidence::text, '-') AS conf, 'Kalimantan'::text AS prov
       FROM monitoring.${firmsTable}
       ${where('latitude', 'longitude', firmsHasDatetm, firmsDatetmTz)}
       ${limitClause})`);
  }
  if ((source === 'all' || source === 'sipongi') && hasSipongi) {
    legs.push(`
      (SELECT 1 AS kind, COALESCE(sumber, 'SIPONGI')::text AS sensor, lat::float8 AS lat, long::float8 AS lon,
              datetm_loc, 0::float8 AS bright,
              COALESCE(confidence_level, confidence::text, 'unknown')::text AS conf,
              COALESCE(nama_provinsi, 'Kalimantan')::text AS prov
       FROM monitoring.alert_fire_sipongi_raw
       ${where('lat', 'long', sipongiHasDatetm, sipongiDatetmTz)}
       ${limitClause})`);
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
  const cap = Number(limit) + 1;
  const built = await prepare({ ...opts, perLegLimit: cap });
  if (!built) return { cols: emptyCols(), truncated: false };

  // Tanpa ORDER BY tmin di SQL agar PostgreSQL tidak perlu men-sort ratusan ribu baris hasil UNION ALL
  const sql = `${built.cte}
    SELECT kind, sensor, lat, lon, floor(extract(epoch FROM datetm_loc::timestamp) / 60)::int AS tmin,
           bright, conf, prov
    FROM src
    LIMIT ${cap}`;

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
    GROUP BY 1, 2, 3, 4`;

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
  const bbox = opts.bbox || [108.0, -4.5, 119.5, 4.5];
  const built = await prepare({ ...opts, bbox });
  if (!built) return { total: 0, hr0: 0, firms: [], sipongi: [], dateStats: {}, bbox: null };

  const sql = `${built.cte}
    SELECT kind,
           floor(extract(epoch FROM datetm_loc::timestamp) / 3600)::int AS hr,
           count(*)::int AS cnt,
           min(lon) AS w, max(lon) AS e, min(lat) AS s, max(lat) AS n
    FROM src
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
export async function queryDetail({ lat, lon, radius = 0.008, start = null, end = null }) {
  await ensureTables();
  const r = Math.max(0.001, Math.min(0.05, radius));
  const sClean = start ? start.replace('T', ' ') : null;
  const eClean = end ? end.replace('T', ' ') : null;

  const tasks = [];

  if (hasFirms) {
    tasks.push(
      (async () => {
        try {
          const params = [lat - r, lat + r, lon - r, lon + r, lat, lon];
          const conds = [
            firmsHasGeom ? `geometry && ST_MakeEnvelope($3, $1, $4, $2, 4326)` : null,
            `latitude BETWEEN $1 AND $2`,
            `longitude BETWEEN $3 AND $4`,
          ].filter(Boolean);

          if (sClean) {
            params.push(sClean);
            conds.push(buildTimeCond('>=', `$${params.length}`, firmsHasDatetm, firmsDatetmTz));
          }
          if (eClean) {
            params.push(eClean);
            conds.push(buildTimeCond('<=', `$${params.length}`, firmsHasDatetm, firmsDatetmTz));
          }

          const sql = `
            SELECT 0 AS kind,
                   COALESCE(source::text, 'FIRMS') AS sensor,
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
            FROM monitoring.${firmsTable}
            WHERE ${conds.join(' AND ')}
            ORDER BY (abs(latitude - $5) + abs(longitude - $6))
            LIMIT 6`;
          const res = await withClient((c) => c.query(sql, params));
          return res.rows;
        } catch (err) {
          console.warn('Gagal mengambil detail FIRMS:', err.message);
          return [];
        }
      })()
    );
  }

  if (hasSipongi) {
    tasks.push(
      (async () => {
        try {
          const params = [lat - r, lat + r, lon - r, lon + r, lat, lon];
          const conds = [
            sipongiHasGeom ? `geometry && ST_MakeEnvelope($3, $1, $4, $2, 4326)` : null,
            `lat BETWEEN $1 AND $2`,
            `long BETWEEN $3 AND $4`,
          ].filter(Boolean);

          if (sClean) {
            params.push(sClean);
            conds.push(buildTimeCond('>=', `$${params.length}`, sipongiHasDatetm, sipongiDatetmTz));
          }
          if (eClean) {
            params.push(eClean);
            conds.push(buildTimeCond('<=', `$${params.length}`, sipongiHasDatetm, sipongiDatetmTz));
          }

          const uidExpr = sipongiCols.has('uid_alert') ? 'uid_alert::text' : 'NULL::text';
          const provExpr = sipongiCols.has('nama_provinsi') ? 'nama_provinsi::text' : 'NULL::text';
          const kabExpr = sipongiCols.has('nama_kabupaten')
            ? 'nama_kabupaten::text'
            : sipongiCols.has('kabkota')
            ? 'kabkota::text'
            : 'NULL::text';
          const kecExpr = sipongiCols.has('nama_kecamatan')
            ? 'nama_kecamatan::text'
            : sipongiCols.has('kecamatan')
            ? 'kecamatan::text'
            : 'NULL::text';
          const kelExpr = sipongiCols.has('nama_kelurahan')
            ? 'nama_kelurahan::text'
            : sipongiCols.has('desa')
            ? 'desa::text'
            : 'NULL::text';

          const sql = `
            SELECT 1 AS kind,
                   COALESCE(sumber, 'SIPONGI')::text AS sensor,
                   ${uidExpr} AS uid,
                   lat::float8,
                   long::float8 AS lon,
                   0::float8 AS bright,
                   COALESCE(confidence_level, confidence::text, 'unknown')::text AS conf,
                   0::float8 AS frp,
                   '-'::text AS daynight,
                   COALESCE(sumber, 'SIPONGI')::text AS satellite,
                   '-'::text AS instrument,
                   to_char(datetm_loc, 'YYYY-MM-DD HH24:MI:SS') AS datetm_loc,
                   ${provExpr} AS nama_provinsi,
                   ${kabExpr} AS nama_kabupaten,
                   ${kecExpr} AS nama_kecamatan,
                   ${kelExpr} AS nama_kelurahan
            FROM monitoring.alert_fire_sipongi_raw
            WHERE ${conds.join(' AND ')}
            ORDER BY (abs(lat - $5) + abs(long - $6))
            LIMIT 6`;
          const res = await withClient((c) => c.query(sql, params));
          return res.rows;
        } catch (err) {
          console.warn('Gagal mengambil detail SIPONGI:', err.message);
          return [];
        }
      })()
    );
  }

  const results = await Promise.all(tasks);
  return results.flat();
}

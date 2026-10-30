/**
 * Format biner kolom (columnar) untuk hotspot.
 *
 * Kenapa bukan GeoJSON?
 *  - GeoJSON ~350 byte/titik (properti diulang). 300rb titik = ~100 MB JSON + parse + 300rb objek JS.
 *  - Biner ini ~23 byte/titik, di-decode tanpa parse (zero-copy typed array) dan langsung
 *    dipakai sebagai attribute buffer GPU oleh deck.gl.
 *
 * Layout:
 *   [u32 headerLen][header JSON, dipad spasi sampai kelipatan 4]
 *   lonlat  Float32 x 2n   (lon, lat interleaved)
 *   tRel    Float32 x n    (menit relatif terhadap header.t0Min)
 *   cnt     Float32 x n    (jumlah deteksi; 1 untuk titik mentah, N untuk sel agregat)
 *   bright  Float32 x n    (brightness K; 0 untuk SIPONGI)
 *   sensor  Uint8   x n    (indeks ke header.sensors)
 *   conf    Uint8   x n    (indeks ke header.conf)
 *   prov    Uint8   x n    (indeks ke header.prov)
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeHotspots(cols, meta = {}) {
  const n = cols.n;

  // t0 = menit absolut terkecil (data sudah terurut menaik, tapi jangan diasumsikan).
  let t0 = Infinity;
  for (let i = 0; i < n; i++) if (cols.tMin[i] < t0) t0 = cols.tMin[i];
  if (!isFinite(t0)) t0 = 0;

  const header = {
    v: 1,
    n,
    t0Min: t0,
    sensors: cols.sensors, // [[nama, kind(0=firms,1=sipongi)], ...]
    conf: cols.conf,
    prov: cols.prov,
    ...meta,
  };
  let headerBytes = enc.encode(JSON.stringify(header));
  const padded = Math.ceil(headerBytes.length / 4) * 4;
  if (padded !== headerBytes.length) {
    const tmp = new Uint8Array(padded).fill(0x20);
    tmp.set(headerBytes);
    headerBytes = tmp;
  }

  const total = 4 + padded + n * (8 + 4 + 4 + 4 + 3);
  const buf = new ArrayBuffer(total);
  new DataView(buf).setUint32(0, padded, true);
  new Uint8Array(buf, 4, padded).set(headerBytes);

  let off = 4 + padded;
  const lonlat = new Float32Array(buf, off, n * 2); off += n * 8;
  const tRel = new Float32Array(buf, off, n); off += n * 4;
  const cnt = new Float32Array(buf, off, n); off += n * 4;
  const bright = new Float32Array(buf, off, n); off += n * 4;
  const sensor = new Uint8Array(buf, off, n); off += n;
  const conf = new Uint8Array(buf, off, n); off += n;
  const prov = new Uint8Array(buf, off, n);

  for (let i = 0; i < n; i++) {
    lonlat[i * 2] = cols.lon[i];
    lonlat[i * 2 + 1] = cols.lat[i];
    tRel[i] = cols.tMin[i] - t0;
    cnt[i] = cols.cnt ? cols.cnt[i] : 1;
    bright[i] = cols.bright[i];
    sensor[i] = cols.sensor[i];
    conf[i] = cols.confIdx[i];
    prov[i] = cols.provIdx[i];
  }
  return buf;
}

export function decodeHotspots(buf) {
  const headerLen = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(dec.decode(new Uint8Array(buf, 4, headerLen)));
  const n = header.n;

  let off = 4 + headerLen;
  const lonlat = new Float32Array(buf, off, n * 2); off += n * 8;
  const tRel = new Float32Array(buf, off, n); off += n * 4;
  const cnt = new Float32Array(buf, off, n); off += n * 4;
  const bright = new Float32Array(buf, off, n); off += n * 4;
  const sensor = new Uint8Array(buf, off, n); off += n;
  const conf = new Uint8Array(buf, off, n); off += n;
  const prov = new Uint8Array(buf, off, n);

  return { header, n, lonlat, tRel, cnt, bright, sensor, conf, prov };
}

/**
 * Menggabungkan dua dataset biner hotspot secara instan (zero-copy TypedArray set).
 * Digunakan untuk progressive streaming loading: memuat batch pertama segera,
 * lalu menggabungkan batch data berikutnya tanpa me-reset peta.
 */
export function mergeHotspotDatasets(d1, d2) {
  if (!d1 && !d2) return null;
  if (!d1) return d2;
  if (!d2) return d1;

  const n1 = d1.n;
  const n2 = d2.n;
  if (n1 === 0) return d2;
  if (n2 === 0) return d1;

  const totalN = n1 + n2;
  const t0 = Math.min(d1.header.t0Min, d2.header.t0Min);
  const header = {
    ...d1.header,
    ...d2.header,
    n: totalN,
    t0Min: t0,
  };

  const lonlat = new Float32Array(totalN * 2);
  lonlat.set(d1.lonlat, 0);
  lonlat.set(d2.lonlat, n1 * 2);

  const tRel = new Float32Array(totalN);
  const dt1 = d1.header.t0Min - t0;
  for (let i = 0; i < n1; i++) tRel[i] = d1.tRel[i] + dt1;
  const dt2 = d2.header.t0Min - t0;
  for (let i = 0; i < n2; i++) tRel[n1 + i] = d2.tRel[i] + dt2;

  const cnt = new Float32Array(totalN);
  if (d1.cnt) cnt.set(d1.cnt, 0); else cnt.fill(1, 0, n1);
  if (d2.cnt) cnt.set(d2.cnt, n1); else cnt.fill(1, n1, totalN);

  const bright = new Float32Array(totalN);
  if (d1.bright) bright.set(d1.bright, 0);
  if (d2.bright) bright.set(d2.bright, n1);

  const sensor = new Uint8Array(totalN);
  sensor.set(d1.sensor, 0);
  sensor.set(d2.sensor, n1);

  const conf = new Uint8Array(totalN);
  conf.set(d1.conf, 0);
  conf.set(d2.conf, n1);

  const prov = new Uint8Array(totalN);
  prov.set(d1.prov, 0);
  prov.set(d2.prov, n1);

  return { header, n: totalN, lonlat, tRel, cnt, bright, sensor, conf, prov };
}

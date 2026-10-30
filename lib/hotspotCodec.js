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

function makeMergeDict(keyFn) {
  const map = new Map();
  const list = [];
  return {
    list,
    remapTable(srcList) {
      if (!srcList || !srcList.length) return null;
      const lut = new Uint8Array(srcList.length);
      for (let i = 0; i < srcList.length; i++) {
        const item = srcList[i];
        const k = keyFn ? keyFn(item) : String(item);
        let idx = map.get(k);
        if (idx === undefined) {
          idx = Math.min(list.length, 255);
          if (list.length < 255) list.push(item);
          map.set(k, idx);
        }
        lut[i] = idx;
      }
      return lut;
    },
  };
}

/**
 * Menggabungkan N dataset biner hotspot dengan satu kali alokasi memori O(N) (Langkah 5c).
 */
export function mergeMany(parts, maxPoints = 400000) {
  const valid = (parts || []).filter((p) => p && p.n > 0);
  if (valid.length === 0) return parts?.find(Boolean) || null;
  if (valid.length === 1) return valid[0];

  let totalN = 0;
  let t0 = Infinity;
  let truncated = false;
  for (const p of valid) {
    totalN += p.n;
    if (p.header.t0Min < t0) t0 = p.header.t0Min;
    if (p.header.truncated) truncated = true;
  }
  if (!isFinite(t0)) t0 = 0;
  if (totalN > maxPoints) {
    totalN = maxPoints;
    truncated = true;
  }

  const lonlat = new Float32Array(totalN * 2);
  const tRel = new Float32Array(totalN);
  const cnt = new Float32Array(totalN);
  const bright = new Float32Array(totalN);
  const sensor = new Uint8Array(totalN);
  const conf = new Uint8Array(totalN);
  const prov = new Uint8Array(totalN);

  const sensorDict = makeMergeDict((s) => (Array.isArray(s) ? `${s[1]}|${s[0]}` : String(s)));
  const confDict = makeMergeDict();
  const provDict = makeMergeDict();

  let offset = 0;
  for (const p of valid) {
    if (offset >= totalN) break;
    const count = Math.min(p.n, totalN - offset);

    lonlat.set(count === p.n ? p.lonlat : p.lonlat.subarray(0, count * 2), offset * 2);

    const dt = p.header.t0Min - t0;
    for (let i = 0; i < count; i++) {
      tRel[offset + i] = p.tRel[i] + dt;
    }

    if (p.cnt) {
      cnt.set(count === p.n ? p.cnt : p.cnt.subarray(0, count), offset);
    } else {
      cnt.fill(1, offset, offset + count);
    }

    if (p.bright) {
      bright.set(count === p.n ? p.bright : p.bright.subarray(0, count), offset);
    }

    const sLut = sensorDict.remapTable(p.header.sensors);
    const cLut = confDict.remapTable(p.header.conf);
    const pLut = provDict.remapTable(p.header.prov);

    for (let i = 0; i < count; i++) {
      sensor[offset + i] = sLut ? sLut[p.sensor[i]] ?? 0 : p.sensor[i];
      conf[offset + i] = cLut ? cLut[p.conf[i]] ?? 0 : p.conf[i];
      prov[offset + i] = pLut ? pLut[p.prov[i]] ?? 0 : p.prov[i];
    }

    offset += count;
  }

  const baseHeader = valid[valid.length - 1].header;
  const header = {
    ...baseHeader,
    n: totalN,
    t0Min: t0,
    truncated,
    sensors: sensorDict.list.length ? sensorDict.list : baseHeader.sensors,
    conf: confDict.list.length ? confDict.list : baseHeader.conf,
    prov: provDict.list.length ? provDict.list : baseHeader.prov,
  };

  return { header, n: totalN, lonlat, tRel, cnt, bright, sensor, conf, prov };
}

/**
 * Menggabungkan dua dataset biner hotspot secara instan.
 */
export function mergeHotspotDatasets(d1, d2) {
  if (!d1 && !d2) return null;
  if (!d1) return d2;
  if (!d2) return d1;
  return mergeMany([d1, d2]);
}

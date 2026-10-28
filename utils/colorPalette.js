/**
 * Skala Warna Kronologis Titik Api (Recency Color Scheme):
 * - Paling terbaru  -> MERAH  (#FF2222)
 * - Semakin lama    -> ORANGE (#FF7A00)
 * - Semakin lama    -> KUNING (#FFD200)
 * - Semakin lama    -> HIJAU  (#10B981)
 * - Paling lama     -> BIRU   (#0091FF)
 *
 * Mendukung resolusi gradien kontinu sampai tingkat PER JAM (hourly gradient).
 */

export const RECENCY_STOPS = [
  { t: 0.00, hex: '#0091FF', r: 0,   g: 145, b: 255, label: 'Biru (Paling lama)' },
  { t: 0.25, hex: '#10B981', r: 16,  g: 185, b: 129, label: 'Hijau' },
  { t: 0.50, hex: '#FFD200', r: 255, g: 210, b: 0,   label: 'Kuning' },
  { t: 0.75, hex: '#FF7A00', r: 255, g: 122, b: 0,   label: 'Orange' },
  { t: 1.00, hex: '#FF2222', r: 255, g: 34,  b: 34,  label: 'Merah (Paling terbaru)' },
];

export const RECENCY_COLORS = [
  '#0091FF', // 0: Biru (Paling lama)
  '#10B981', // 1: Hijau
  '#FFD200', // 2: Kuning
  '#FF7A00', // 3: Orange
  '#FF2222', // 4: Merah (Paling terbaru)
];

const STOPS = RECENCY_STOPS;

/**
 * Skala Warna Densitas / Intensitas Frekuensi Hotspot (Thermal Ember Ramp):
 * Menggambarkan intensitas frekuensi seringnya titik api pada wilayah tertentu:
 * - 0.00: 1 deteksi (kejadian terisolasi / jarang)    -> Merah Bara Gelap / Maroon  #7F0000 [127, 0, 0]
 * - 0.25: 2-5 deteksi (mulai terdeteksi)              -> Merah Menyala              #E52B1E [229, 43, 30]
 * - 0.50: 6-15 deteksi (menumpuk / moderat)           -> Oranye Terang              #FF6B00 [255, 107, 0]
 * - 0.75: 16-40 deteksi (sering terbakar)             -> Oranye Keemasan / Kuning   #FFB300 [255, 179, 0]
 * - 0.90: 41-90 deteksi (sangat padat / persisten)    -> Kuning Terang              #FFF033 [255, 240, 51]
 * - 1.00: > 90 deteksi (titik api intensif/ekstrem)   -> Putih Pijar / White-Hot    #FFFFFF [255, 255, 255]
 */
export const DENSITY_STOPS = [
  { t: 0.00, hex: '#7F0000', r: 127, g: 0,   b: 0,   label: '1 deteksi (jarang)' },
  { t: 0.25, hex: '#E52B1E', r: 229, g: 43,  b: 30,  label: 'Sedikit' },
  { t: 0.50, hex: '#FF6B00', r: 255, g: 107, b: 0,   label: 'Menumpuk' },
  { t: 0.75, hex: '#FFB300', r: 255, g: 179, b: 0,   label: 'Sering' },
  { t: 0.90, hex: '#FFF033', r: 255, g: 240, b: 51,  label: 'Sangat padat' },
  { t: 1.00, hex: '#FFFFFF', r: 255, g: 255, b: 255, label: 'Puncak intensitas' },
];

/**
 * Interpolasi RGB untuk rasio intensitas densitas t [0.0 = jarang s.d. 1.0 = sangat sering/padat].
 * @param {number} t
 * @returns {[number, number, number]} [r, g, b] (0-255)
 */
export function getRgbForDensity(t) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  for (let i = 0; i < DENSITY_STOPS.length - 1; i++) {
    const s0 = DENSITY_STOPS[i];
    const s1 = DENSITY_STOPS[i + 1];
    if (clamped <= s1.t) {
      const f = (clamped - s0.t) / (s1.t - s0.t);
      const r = Math.round(s0.r + (s1.r - s0.r) * f);
      const g = Math.round(s0.g + (s1.g - s0.g) * f);
      const b = Math.round(s0.b + (s1.b - s0.b) * f);
      return [r, g, b];
    }
  }
  return [255, 255, 255];
}

/**
 * Interpolasi Hex untuk rasio intensitas densitas t [0, 1].
 * @param {number} t
 * @returns {string} '#RRGGBB'
 */
export function getColorForDensity(t) {
  const [r, g, b] = getRgbForDensity(t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

/**
 * Interpolasi RGB untuk rasio t [0.0 = paling lama / Biru s.d. 1.0 = paling terbaru / Merah].
 * @param {number} t
 * @returns {[number, number, number]} [r, g, b] (0-255)
 */
export function getRgbForRatio(t) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 1));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const s0 = STOPS[i];
    const s1 = STOPS[i + 1];
    if (clamped <= s1.t) {
      const f = (clamped - s0.t) / (s1.t - s0.t);
      const r = Math.round(s0.r + (s1.r - s0.r) * f);
      const g = Math.round(s0.g + (s1.g - s0.g) * f);
      const b = Math.round(s0.b + (s1.b - s0.b) * f);
      return [r, g, b];
    }
  }
  return [255, 34, 34];
}

/**
 * Interpolasi warna Hex '#RRGGBB' untuk rasio t [0, 1].
 * @param {number} t
 * @returns {string} '#RRGGBB'
 */
export function getColorForRatio(t) {
  const [r, g, b] = getRgbForRatio(t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

/**
 * Mengambil warna RGB [r, g, b] untuk jam tertentu dalam rentang [minHour, maxHour].
 * - Jam maxHour (terbaru)  -> Merah [255, 34, 34]
 * - Jam minHour (terlama)  -> Biru [0, 145, 255]
 *
 * @param {number} hour
 * @param {number} minHour
 * @param {number} maxHour
 * @returns {[number, number, number]}
 */
export function getRgbForHour(hour, minHour, maxHour) {
  const span = maxHour - minHour;
  const ratio = span > 0 ? (hour - minHour) / span : 1;
  return getRgbForRatio(ratio);
}

/**
 * Mengambil warna Hex '#RRGGBB' untuk jam tertentu dalam rentang [minHour, maxHour].
 * @param {number} hour
 * @param {number} minHour
 * @param {number} maxHour
 * @returns {string}
 */
export function getColorForHour(hour, minHour, maxHour) {
  const span = maxHour - minHour;
  const ratio = span > 0 ? (hour - minHour) / span : 1;
  return getColorForRatio(ratio);
}

/**
 * Memberikan warna unik kronologis pada setiap tanggal (kompatibilitas date-level).
 * Tanggal paling terbaru mendapatkan warna paling MERAH.
 * Semakin lama tanggalnya, berubah bertahap menjadi ORANGE, KUNING, HIJAU, BIRU (paling lama).
 *
 * @param {string[]} uniqueDates - daftar 'YYYY-MM-DD'
 * @returns {Record<string, string>} map tanggal ke hex color
 */
export function generateDateColorMap(uniqueDates = []) {
  const map = {};
  if (!uniqueDates || uniqueDates.length === 0) return map;

  // Urutkan kronologis menaik: index 0 = tanggal paling lama, index n-1 = tanggal paling baru
  const sorted = [...uniqueDates].sort();
  const n = sorted.length;

  if (n === 1) {
    map[sorted[0]] = '#FF2222'; // 1 tanggal tunggal = Merah (paling terbaru)
    return map;
  }

  // Untuk rentang 2 s.d. 5 hari: gunakan warna diskret tegas
  if (n <= 5) {
    const subset = RECENCY_COLORS.slice(5 - n);
    sorted.forEach((dateStr, idx) => {
      map[dateStr] = subset[idx];
    });
    return map;
  }

  // Jika n > 5 hari: interpolasi kontinu sepanjang spektrum Biru -> Hijau -> Kuning -> Orange -> Merah
  sorted.forEach((dateStr, idx) => {
    const t = idx / (n - 1); // 0.0 (paling lama) s.d. 1.0 (paling terbaru)
    map[dateStr] = getColorForRatio(t);
  });

  return map;
}

/**
 * Mengambil warna untuk tanggal tertentu dari map
 */
export function getColorForDate(dateStr, dateColorMap = {}) {
  if (dateColorMap && dateColorMap[dateStr]) {
    return dateColorMap[dateStr];
  }
  return '#FF2222'; // Default fallback: flame red
}

/**
 * Convert Hex to RGBA string
 */
export function hexToRgba(hex, alpha = 1) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('');
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * '#rrggbb' | '#rgb' | 'hsl(h, s%, l%)' -> [r, g, b] (0-255).
 * Dipakai untuk mengisi buffer warna GPU (deck.gl).
 */
export function colorToRgb(color) {
  if (!color) return [255, 34, 34];
  if (color.startsWith('#')) {
    let c = color.slice(1);
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const num = parseInt(c, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }
  const m = color.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i);
  if (m) {
    const h = parseFloat(m[1]) / 360;
    const s = parseFloat(m[2]) / 100;
    const l = parseFloat(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }
  return [255, 34, 34];
}

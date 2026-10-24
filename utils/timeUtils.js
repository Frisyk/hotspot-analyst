/**
 * Semua waktu di aplikasi ini adalah "wall-clock WIB" (datetm_loc).
 * Agar bebas dari zona waktu browser, string diparse sebagai UTC lalu diperlakukan
 * sebagai jam dinding. Server memakai konvensi yang sama (epoch dari timestamp tanpa zona).
 */

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD HH:mm[:ss]' atau 'YYYY-MM-DDTHH:mm' -> milidetik (wall-clock sebagai UTC) */
export function parseWall(str) {
  if (!str) return NaN;
  const [d, t = '00:00:00'] = String(str).replace('T', ' ').split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = t.split(':').map(Number);
  return Date.UTC(y, m - 1, day, hh, mm, ss);
}

/** ms -> 'YYYY-MM-DD HH:mm:ss' */
export function formatWall(ms) {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** ms -> 'YYYY-MM-DDTHH:mm' (untuk input datetime-local) */
export function formatInput(ms) {
  if (!Number.isFinite(ms)) return '';
  return formatWall(ms).slice(0, 16).replace(' ', 'T');
}

export function dateOfHour(hr) {
  return new Date(hr * 3600000).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** ms -> '23 Okt 2026' */
export function formatDay(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** ms -> '23 Okt · 14:00' */
export function formatShort(ms) {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

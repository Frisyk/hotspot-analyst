// Pre-curated high-contrast neon palette tailored for dark maps
const BASE_COLORS = [
  '#FF3838', // Vibrant Red / Neon Crimson
  '#FF9F1A', // Bright Amber / Orange
  '#FFE600', // Electric Yellow
  '#17C964', // Emerald / Mint Green
  '#00F0FF', // Cyber Cyan
  '#7828C8', // Deep Violet
  '#F31260', // Hot Pink
  '#3880FF', // Electric Blue
  '#2DD4BF', // Bright Teal
  '#FB923C', // Coral Orange
  '#C084FC', // Lavender Purple
  '#F43F5E', // Rose Red
];

// Cache for consistent date-to-color assignment
const colorCache = new Map();

/**
 * Convert Hex to RGBA string
 */
export function hexToRgba(hex, alpha = 1) {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Assign a unique color to each date
 * @param {string[]} uniqueDates - sorted array of 'YYYY-MM-DD'
 * @returns {Record<string, string>} map of date string to hex color
 */
export function generateDateColorMap(uniqueDates = []) {
  const map = {};
  const sorted = [...uniqueDates].sort();

  sorted.forEach((dateStr, idx) => {
    if (colorCache.has(dateStr)) {
      map[dateStr] = colorCache.get(dateStr);
      return;
    }

    let color;
    if (idx < BASE_COLORS.length) {
      color = BASE_COLORS[idx];
    } else {
      // Procedural golden-ratio HSL distribution for more than 12 dates
      const hue = Math.round((idx * 137.5) % 360);
      color = `hsl(${hue}, 90%, 62%)`;
    }
    colorCache.set(dateStr, color);
    map[dateStr] = color;
  });

  return map;
}

/**
 * Get color for a specific date string
 */
export function getColorForDate(dateStr, dateColorMap = {}) {
  if (dateColorMap[dateStr]) {
    return dateColorMap[dateStr];
  }
  if (colorCache.has(dateStr)) {
    return colorCache.get(dateStr);
  }
  return '#FF4500'; // Default fallback flame orange
}

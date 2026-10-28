import { LineLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { DataFilterExtension } from '@deck.gl/extensions';

/** Kunci sub-layer yang bisa di-show/hide. */
export const SPREAD_LAYERS = [
  { key: 'origin', label: 'Titik awal', desc: 'Deteksi pertama tiap klaster', color: '#FFD65A', shape: 'ring' },
  { key: 'arrows', label: 'Arah penyebaran', desc: 'Panah induk → anak', color: '#60DCFF', shape: 'arrow' },
  { key: 'grid', label: 'Kotak grid', desc: 'Sel 300m × 300m', color: '#FFFFFF', shape: 'box' },
  { key: 'order', label: 'Nomor kotak', desc: 'Urutan kronologis (1 = titik awal)', color: '#EBF0F5', shape: 'num' },
];

export const SPREAD_DEFAULT = { origin: true, arrows: false, grid: false, order: false };

const NO_DEPTH = { depthCompare: 'always', depthWriteEnabled: false };
const ARROW_COLOR = [96, 220, 255, 235];
const HEAD_PX = 11;

// GPU DataFilterExtension agar filtering waktu diproses di WebGL shader tanpa filter array JS
const spreadFilterExt = new DataFilterExtension({ filterSize: 1 });

/** Rentang filter waktu untuk GPU shader (menit dinding WIB). */
export function getSpreadFilterRange(curMin, cumulative = true) {
  if (!Number.isFinite(curMin)) return [-1e9, 1e9];
  const hs = Math.floor(curMin / 60) * 60;
  return cumulative ? [-1e9, hs + 60.01] : [hs - 0.01, hs + 60.01];
}

/** Segitiga kepala panah di ujung `to`, ukuran tetap dalam piksel. */
function arrowHead(a, zoom) {
  const degPerPx = 360 / (512 * Math.pow(2, zoom));
  const L = HEAD_PX * degPerPx;
  const cosLat = Math.max(0.2, Math.cos(((a.to[1]) * Math.PI) / 180));
  const dx = (a.to[0] - a.from[0]) * cosLat;
  const dy = a.to[1] - a.from[1];
  const len = Math.hypot(dx, dy);
  if (!len) return null;
  const ux = dx / len, uy = dy / len;
  const bx = a.to[0] - (ux * L) / cosLat, by = a.to[1] - uy * L;
  const px = (-uy * L * 0.45) / cosLat, py = ux * L * 0.45;
  return [a.to, [bx + px, by + py], [bx - px, by - py]];
}

/**
 * @param {{arrows:Array,cells:Array,origins:Array,cellDeg:number}|null} data
 * @param {{origin:boolean,arrows:boolean,grid:boolean,order:boolean}} vis
 */
export function buildSpreadLayers({ data, vis, zoom, curMin, cumulative = true }) {
  if (!data) return [];
  const filterRange = getSpreadFilterRange(curMin, cumulative);
  const cellDeg = data.cellDeg || 0.0027;
  const layers = [];
  const commonFilter = {
    extensions: [spreadFilterExt],
    filterRange,
    getFilterValue: (d) => (d.tm != null ? d.tm : 0),
  };

  if ((vis.grid || vis.order) && data.cells && data.cells.length > 0) {
    const half = cellDeg / 2;
    if (vis.grid) {
      layers.push(new PolygonLayer({
        ...commonFilter,
        id: 'spread-grid',
        data: data.cells,
        visible: vis.grid,
        pickable: false,
        stroked: true,
        filled: true,
        lineWidthUnits: 'pixels',
        getLineWidth: (c) => (c.origin ? 2 : 1),
        getPolygon: (c) => {
          // Berpusat di titik koordinat centroid hotspot (300m x 300m)
          const cx = c.lon ?? (c.ix + 0.5) * cellDeg;
          const cy = c.lat ?? (c.iy + 0.5) * cellDeg;
          return [
            [cx - half, cy - half],
            [cx + half, cy - half],
            [cx + half, cy + half],
            [cx - half, cy + half],
          ];
        },
        getFillColor: (c) => (c.origin ? [255, 214, 90, 95] : [255, 255, 255, 14]),
        getLineColor: (c) => (c.origin ? [255, 214, 90, 255] : [255, 255, 255, 70]),
        parameters: NO_DEPTH,
        updateTriggers: { getPolygon: [cellDeg] },
      }));
    }

    // TextLayer sangat mahal di WebGL: hanya tampilkan saat zoom tinggi (>= 10.5)
    if (vis.order && zoom >= 10.5) {
      // Jika data sangat banyak, prioritaskan origin dan top 400 sel agar memori GPU tetap ringan
      const orderData = data.cells.length > 500
        ? data.cells.filter((c) => c.origin || c.order <= 5)
        : data.cells;

      layers.push(new TextLayer({
        ...commonFilter,
        id: 'spread-order',
        data: orderData,
        pickable: false,
        getPosition: (c) => [
          c.lon ?? (c.ix + 0.5) * cellDeg,
          c.lat ?? (c.iy + 0.5) * cellDeg,
        ],
        getText: (c) => (c.origin ? '1' : String(c.order)),
        getSize: (c) => (c.origin ? 15 : 11),
        sizeUnits: 'pixels',
        getColor: (c) => (c.origin ? [255, 232, 140, 255] : [235, 240, 245, 210]),
        fontWeight: 700,
        outlineWidth: 2,
        outlineColor: [10, 12, 16, 220],
        fontSettings: { sdf: true },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        parameters: NO_DEPTH,
      }));
    }
  }

  if (vis.arrows && data.arrows && data.arrows.length > 0) {
    const zr = Math.round(zoom * 2) / 2;
    layers.push(
      new LineLayer({
        ...commonFilter,
        id: 'spread-arrow-shaft',
        data: data.arrows,
        pickable: false,
        getSourcePosition: (a) => a.from,
        getTargetPosition: (a) => a.to,
        getColor: ARROW_COLOR,
        getWidth: 1.6,
        widthUnits: 'pixels',
        parameters: NO_DEPTH,
      }),
      new SolidPolygonLayer({
        ...commonFilter,
        id: 'spread-arrow-head',
        data: data.arrows,
        pickable: false,
        getPolygon: (a) => arrowHead(a, zr) || [a.to, a.to, a.to],
        getFillColor: ARROW_COLOR,
        parameters: NO_DEPTH,
        updateTriggers: { getPolygon: [zr] },
      }),
    );
  }

  if (vis.origin && data.origins && data.origins.length > 0) {
    layers.push(
      new ScatterplotLayer({
        ...commonFilter,
        id: 'spread-origin',
        data: data.origins,
        pickable: false,
        stroked: true,
        filled: true,
        radiusUnits: 'pixels',
        getRadius: 9,
        lineWidthUnits: 'pixels',
        getLineWidth: 2.5,
        getPosition: (o) => [o.lon, o.lat],
        getFillColor: [255, 214, 90, 70],
        getLineColor: [255, 214, 90, 255],
        parameters: NO_DEPTH,
      }),
    );
  }

  return layers;
}

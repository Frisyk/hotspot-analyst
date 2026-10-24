'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer } from '@deck.gl/layers';
import { DataFilterExtension } from '@deck.gl/extensions';
import { Minus, Plus, Crosshair, Mountain, Compass, Flame } from 'lucide-react';

import GlowLayer, { ADDITIVE_PARAMS } from './map/GlowLayer';
import HotspotDetailPopup from './HotspotDetailPopup';
import { createPortal } from 'react-dom';
import { decodeHotspots } from '../lib/hotspotCodec';
import { colorToRgb, getColorForDate, getColorForHour, getRgbForRatio } from '../utils/colorPalette';
import { expandTileUrls, getBasemapConfig } from '../utils/basemaps';
import { formatShort, parseWall } from '../utils/timeUtils';

/** Di bawah zoom ini data diagregasi di server (sel jam x sumber); di atasnya titik mentah per viewport. */
const GRID_MAX_ZOOM = 8;
const KALIMANTAN = { center: [114.0, 0.0], zoom: 5.6 };
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const KIND_COLOR = ['#ffb13b', '#3fd1c0'];
const KIND_LABEL = ['FIRMS', 'SIPONGI'];

const filterExt = new DataFilterExtension({ filterSize: 2 });

function cellForZoom(z) {
  if (z <= 5) return 0.1;
  if (z <= 6.5) return 0.05;
  if (z <= 7.5) return 0.025;
  return 0.0125;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- konversi dataset biner -> buffer GPU ----------
function buildGeometry(d) {
  const { n, lonlat, tRel, header } = d;
  const t0 = header.t0Min;
  const d0 = Math.floor(t0 / 1440);
  const pos = new Float32Array(n * 3);
  const fv = new Float32Array(n * 2); // [menit relatif, indeks hari relatif]
  for (let i = 0; i < n; i++) {
    pos[i * 3] = lonlat[i * 2];
    pos[i * 3 + 1] = lonlat[i * 2 + 1];
    // filter waktu per JAM (bukan menit): konsisten dengan sel agregat & angka di header
    fv[i * 2] = Math.floor((t0 + tRel[i]) / 60) * 60 - t0;
    fv[i * 2 + 1] = Math.floor((t0 + tRel[i]) / 1440) - d0;
  }
  return { pos, fv, t0, d0, zApplied: false };
}

function buildColors(ds, minHour, maxHour) {
  const { n, cnt, bright, header, tRel } = ds.decoded;
  const t0 = header.t0Min;
  const isGrid = header.tier === 'grid';
  const glow = new Uint8Array(n * 4);
  const dots = new Uint8Array(n * 4);
  const span = Math.max(1, maxHour - minHour);
  const hourRgb = new Map();

  for (let i = 0; i < n; i++) {
    const ptHour = Math.floor((t0 + tRel[i]) / 60);
    let rgb = hourRgb.get(ptHour);
    if (!rgb) {
      const ratio = clamp((ptHour - minHour) / span, 0, 1);
      rgb = getRgbForRatio(ratio);
      hourRgb.set(ptHour, rgb);
    }
    const o = i * 4;
    dots[o] = rgb[0]; dots[o + 1] = rgb[1]; dots[o + 2] = rgb[2]; dots[o + 3] = 255;

    let a;
    if (isGrid) a = Math.min(255, 56 + 44 * Math.log2(cnt[i] || 1));
    else a = 48 + clamp((bright[i] - 300) / 150, 0, 1) * 34;
    glow[o] = rgb[0]; glow[o + 1] = rgb[1]; glow[o + 2] = rgb[2]; glow[o + 3] = a;
  }
  return { glow, dots };
}

// ---------- style peta ----------
function baseStyle() {
  return {
    version: 8,
    sources: {
      dem: {
        type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15,
        attribution: 'Elevasi: Mapzen / AWS Terrain Tiles',
      },
      hs: { type: 'raster-dem', tiles: [TERRAIN_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 15 },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0a0908' } },
      {
        id: 'hillshade', type: 'hillshade', source: 'hs', layout: { visibility: 'none' },
        paint: {
          'hillshade-exaggeration': 0.6,
          'hillshade-shadow-color': '#000000',
          'hillshade-highlight-color': '#a8927a',
          'hillshade-accent-color': '#3a2d22',
        },
      },
    ],
  };
}

function applyBasemap(map, type) {
  const cfg = getBasemapConfig(type);
  if (map.getLayer('base')) map.removeLayer('base');
  if (map.getSource('base')) map.removeSource('base');
  map.addSource('base', {
    type: 'raster', tiles: expandTileUrls(cfg.url), tileSize: 256, maxzoom: 19, attribution: cfg.attributions,
  });
  map.addLayer({ id: 'base', type: 'raster', source: 'base' }, 'hillshade');
}

export default function MapView({
  filter,
  cursor,
  isCumulative = true,
  selectedDate = null,
  dateColorMap = {},
  activeMapType = 'dark',
  layerMode = 'both',
  glowRadius = 16,
  glowOpacity = 0.9,
  terrain = { enabled: false, exaggeration: 1.6 },
  bbox = null,
  hideUI = false,
  onToggleTerrain,
  onLoadingChange,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const hudRef = useRef(null);
  const compassRef = useRef(null);

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(KALIMANTAN.zoom);
  const [dataset, setDataset] = useState(null); // { decoded, geom }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hover, setHover] = useState(null);
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [elevVersion, setElevVersion] = useState(0);
  const [elevRun, setElevRun] = useState(0);
  const [elevProgress, setElevProgress] = useState(null);

  const loadedRef = useRef(null);
  const abortRef = useRef(null);
  const seqRef = useRef(0);
  const datasetRef = useRef(null);
  datasetRef.current = dataset;
  const terrainWasOn = useRef(false);
  const popupRef = useRef(null);
  const popupNodeRef = useRef(null);

  useEffect(() => {
    if (typeof document !== 'undefined' && !popupNodeRef.current) {
      popupNodeRef.current = document.createElement('div');
    }
  }, []);

  // Reset hover state saat dataset berganti agar indeks titik lama tidak out-of-bounds
  useEffect(() => {
    setHover(null);
  }, [dataset]);

  const filterKey = `${filter?.start || ''}|${filter?.end || ''}|${filter?.source || 'all'}`;
  const filterKeyRef = useRef(filterKey);
  filterKeyRef.current = filterKey;
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // ---------- init peta + overlay deck.gl ----------
  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle(),
      center: KALIMANTAN.center,
      zoom: KALIMANTAN.zoom,
      minZoom: 3.5,
      maxZoom: 17,
      maxPitch: 78,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      renderWorldCopies: false,
    });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);

    mapRef.current = map;
    overlayRef.current = overlay;

    map.on('load', () => {
      applyBasemap(map, 'dark');
      setReady(true);
    });

    let zoomRaf = 0;
    map.on('movestart', () => {
      setHover(null);
    });

    map.on('move', () => {
      cancelAnimationFrame(zoomRaf);
      zoomRaf = requestAnimationFrame(() => {
        setZoom(Math.round(map.getZoom() * 10) / 10);
        if (compassRef.current) compassRef.current.style.transform = `rotate(${-map.getBearing()}deg)`;
      });
    });

    // Readout koordinat + elevasi di bawah kursor (tanpa re-render React)
    let hudRaf = 0;
    map.on('mousemove', (e) => {
      cancelAnimationFrame(hudRaf);
      hudRaf = requestAnimationFrame(() => {
        if (!hudRef.current || !e.lngLat) return;
        const { lng, lat } = e.lngLat;
        if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
        const elev = map.getTerrain() ? map.queryTerrainElevation(e.lngLat) : null;
        const ex = map.getTerrain() ? map.getTerrain().exaggeration || 1 : 1;
        hudRef.current.textContent =
          `${lat.toFixed(4)}°, ${lng.toFixed(4)}°` +
          (elev != null ? `  ·  ${Math.round(elev / ex)} m dpl` : '');
      });
    });

    return () => {
      cancelAnimationFrame(zoomRaf);
      cancelAnimationFrame(hudRaf);
      if (abortRef.current) abortRef.current.abort();
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      setReady(false);
    };
  }, []);

  // ---------- ganti basemap ----------
  useEffect(() => {
    if (ready) applyBasemap(mapRef.current, activeMapType);
  }, [ready, activeMapType]);

  // ---------- terrain 3D ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (terrain.enabled) {
      map.setTerrain({ source: 'dem', exaggeration: terrain.exaggeration });
      map.setLayoutProperty('hillshade', 'visibility', 'visible');
      if (!terrainWasOn.current) map.easeTo({ pitch: 62, bearing: -18, duration: 1100 });
      terrainWasOn.current = true;
    } else {
      map.setTerrain(null);
      map.setLayoutProperty('hillshade', 'visibility', 'none');
      if (terrainWasOn.current) map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
      terrainWasOn.current = false;
    }
  }, [ready, terrain.enabled, terrain.exaggeration]);

  // ---------- pengambilan data bertingkat ----------
  const load = useCallback(async (force = false) => {
    const map = mapRef.current;
    const f = filterRef.current;
    if (!map || !f) return;

    const z = map.getZoom();
    const tier = z < GRID_MAX_ZOOM ? 'grid' : 'raw';
    const key = filterKeyRef.current;
    const params = new URLSearchParams();
    if (f.start) params.set('start', f.start);
    if (f.end) params.set('end', f.end);
    if (f.source && f.source !== 'all') params.set('source', f.source);
    params.set('tier', tier);

    let meta;
    if (tier === 'grid') {
      const cell = cellForZoom(z);
      params.set('cell', String(cell));
      meta = { key, tier, cell };
      const cur = loadedRef.current;
      if (!force && cur && cur.key === key && cur.tier === 'grid' && cur.cell === cell) return;
    } else {
      const b = map.getBounds();
      const w = b.getWest(), s = b.getSouth(), e = b.getEast(), n = b.getNorth();
      const padX = (e - w) * 0.5, padY = (n - s) * 0.5;
      const q = (v, fn) => (fn(v / 0.05) * 0.05).toFixed(2);
      const box = [q(w - padX, Math.floor), q(s - padY, Math.floor), q(e + padX, Math.ceil), q(n + padY, Math.ceil)];
      const cur = loadedRef.current;
      if (!force && cur && cur.key === key && cur.tier === 'raw' && cur.box) {
        const [cw, cs, ce, cn] = cur.box.map(Number);
        if (w >= cw && s >= cs && e <= ce && n <= cn) return;
      }
      params.set('bbox', box.join(','));
      meta = { key, tier, box };
    }

    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const seq = ++seqRef.current;

    setLoading(true);
    onLoadingChange?.(true);
    setError(null);
    try {
      const res = await fetch(`/api/hotspots?${params.toString()}`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const decoded = decodeHotspots(await res.arrayBuffer());
      if (seq !== seqRef.current) return;
      loadedRef.current = meta;
      setDataset({ decoded, geom: buildGeometry(decoded) });
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Gagal memuat hotspot:', err);
      setError('Gagal memuat data hotspot');
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        onLoadingChange?.(false);
      }
    }
  }, [onLoadingChange]);

  // filter berubah / peta siap -> muat ulang segera
  useEffect(() => {
    if (ready && filter?.start !== undefined) load(true);
  }, [ready, filterKey, load]); // eslint-disable-line react-hooks/exhaustive-deps

  // geser/zoom -> muat ulang dengan debounce
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return undefined;
    let t;
    const onEnd = () => {
      clearTimeout(t);
      t = setTimeout(() => load(false), 280);
    };
    map.on('moveend', onEnd);
    return () => {
      clearTimeout(t);
      map.off('moveend', onEnd);
    };
  }, [ready, load]);

  // ---------- elevasi titik (hanya saat 3D) ----------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !dataset) return undefined;
    const { pos } = dataset.geom;
    const n = dataset.decoded.n;

    if (!terrain.enabled) {
      if (dataset.geom.zApplied) {
        for (let i = 0; i < n; i++) pos[i * 3 + 2] = 0;
        dataset.geom.zApplied = false;
        setElevVersion((v) => v + 1);
      }
      setElevProgress(null);
      return undefined;
    }

    let cancelled = false;
    let raf = 0;
    const begin = () => {
      if (cancelled) return;
      let i = 0;
      let missing = 0;
      const step = () => {
        if (cancelled) return;
        const t = performance.now();
        while (i < n) {
          const z = map.queryTerrainElevation([pos[i * 3], pos[i * 3 + 1]]);
          if (z == null) missing++;
          pos[i * 3 + 2] = (z ?? 0) + 4;
          i++;
          if ((i & 255) === 0 && performance.now() - t > 8) break;
        }
        if (i < n) {
          setElevProgress(i / n);
          raf = requestAnimationFrame(step);
        } else {
          dataset.geom.zApplied = true;
          setElevProgress(null);
          setElevVersion((v) => v + 1);
          // tile DEM belum termuat untuk sebagian titik -> ulangi saat peta idle (maks 2x)
          if (missing > n * 0.03 && elevRun < 2) {
            map.once('idle', () => !cancelled && setElevRun((r) => r + 1));
          }
        }
      };
      step();
    };

    if (map.loaded() && !map.isMoving()) begin();
    else map.once('idle', begin);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      map.off('idle', begin);
    };
  }, [ready, dataset, terrain.enabled, terrain.exaggeration, elevRun]);

  // ---------- batas waktu jam untuk gradien kronologis ----------
  const timeBounds = useMemo(() => {
    if (selectedDate) {
      const minH = Math.floor(parseWall(`${selectedDate} 00:00`) / 3600000);
      const maxH = Math.floor(parseWall(`${selectedDate} 23:59`) / 3600000);
      return { minHour: minH, maxHour: maxH };
    }
    const minH = filter?.start ? Math.floor(parseWall(filter.start) / 3600000) : 0;
    const maxH = filter?.end ? Math.floor(parseWall(filter.end) / 3600000) : minH + 72;
    return { minHour: minH, maxHour: maxH };
  }, [filter?.start, filter?.end, selectedDate]);

  // ---------- warna per titik (sampai tingkat per jam) ----------
  const colors = useMemo(() => {
    if (!dataset) return null;
    return buildColors(dataset, timeBounds.minHour, timeBounds.maxHour);
  }, [dataset, timeBounds.minHour, timeBounds.maxHour]);

  // ---------- data deck.gl (identitas stabil -> tidak upload ulang saat timeline bergerak) ----------
  const glowData = useMemo(() => {
    if (!dataset || !colors) return null;
    return {
      length: dataset.decoded.n,
      attributes: {
        getPosition: { value: dataset.geom.pos, size: 3 },
        getFilterValue: { value: dataset.geom.fv, size: 2 },
        getFillColor: { value: colors.glow, size: 4, normalized: true },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, colors, elevVersion]);

  const dotData = useMemo(() => {
    if (!dataset || !colors) return null;
    return {
      length: dataset.decoded.n,
      attributes: {
        getPosition: { value: dataset.geom.pos, size: 3 },
        getFilterValue: { value: dataset.geom.fv, size: 2 },
        getFillColor: { value: colors.dots, size: 4, normalized: true },
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, colors, elevVersion]);

  // ---------- interaksi ----------
  const handleHover = useCallback((info) => {
    const map = mapRef.current;
    if (!info || info.index == null || info.index < 0) {
      setHover(null);
      if (map) map.getCanvas().style.cursor = '';
      return;
    }
    let idxs = [info.index];
    try {
      const multi = overlayRef.current?.pickMultipleObjects({
        x: info.x, y: info.y, radius: 5, depth: 5, layerIds: [info.layer.id],
      });
      if (multi && multi.length) idxs = multi.map((m) => m.index);
    } catch (e) { /* picking ganda opsional */ }
    setHover({ x: info.x, y: info.y, idxs });
    if (map) map.getCanvas().style.cursor = 'pointer';
  }, []);

  const handleClick = useCallback((info) => {
    const ds = datasetRef.current;
    const map = mapRef.current;
    if (!ds || !map) return;

    let idx = info?.index;
    let idxs = [];

    if (info && info.x != null && info.y != null) {
      try {
        const multi = overlayRef.current?.pickMultipleObjects({
          x: info.x, y: info.y, radius: 14, depth: 10,
        });
        if (multi && multi.length) {
          idxs = multi.map((m) => m.index).filter((i) => i != null && i >= 0);
          if (idxs.length) idx = idxs[0];
        }
      } catch (e) {}
    }

    if (idx == null || idx < 0) {
      setSelectedHotspot(null);
      return;
    }
    if (idxs.length === 0) idxs = [idx];

    const d = ds.decoded;
    const hdr = d.header;
    const t0 = hdr.t0Min;
    const isGrid = hdr.tier === 'grid';
    const cell = hdr.cell;

    const validIdxs = idxs.filter((i) => typeof i === 'number' && i >= 0 && i < d.n);
    if (!validIdxs.length) {
      setSelectedHotspot(null);
      return;
    }

    const first = validIdxs[0];
    const lon = d.lonlat[first * 2];
    const lat = d.lonlat[first * 2 + 1];

    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      setSelectedHotspot(null);
      return;
    }

    let totalCnt = 0;
    let maxBright = 0;
    const rows = validIdxs.map((i) => {
      totalCnt += d.cnt[i] || 1;
      if (d.bright[i] > maxBright) maxBright = d.bright[i];
      const [sensorName, kind] = (hdr.sensors && hdr.sensors[d.sensor[i]]) || ['FIRMS', 0];
      const min = t0 + (d.tRel[i] || 0);
      const ptHour = Math.floor(min / 60);
      const ptColor = getColorForHour(ptHour, timeBounds.minHour, timeBounds.maxHour);
      const conf = (hdr.conf && hdr.conf[d.conf[i]]) || '-';
      const prov = (hdr.prov && hdr.prov[d.prov[i]]) || 'Kalimantan';
      return {
        i,
        min,
        cnt: d.cnt[i] || 1,
        bright: d.bright[i] || 0,
        sensorName,
        kind,
        conf,
        prov,
        color: ptColor,
      };
    });
    rows.sort((a, b) => b.min - a.min);

    const elev = map.getTerrain() ? map.queryTerrainElevation([lon, lat]) : null;
    const primaryHour = rows[0]?.min != null && Number.isFinite(rows[0].min) ? Math.floor(rows[0].min / 60) : timeBounds.minHour;
    const primaryColor = getColorForHour(primaryHour, timeBounds.minHour, timeBounds.maxHour);

    setSelectedHotspot({
      lon,
      lat,
      isGrid,
      cell,
      rows,
      totalCnt,
      maxBright,
      elevation: elev,
      color: primaryColor,
    });

    map.easeTo({ center: [lon, lat], duration: 450 });
  }, [timeBounds.minHour, timeBounds.maxHour]);

  // MapLibre Popup lifecycle
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (!selectedHotspot) {
      if (popupRef.current) {
        popupRef.current.remove();
        popupRef.current = null;
      }
      return;
    }

    if (!popupRef.current) {
      const p = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        maxWidth: '360px',
        className: 'hotspot-map-popup',
        offset: 14,
      })
        .setLngLat([selectedHotspot.lon, selectedHotspot.lat])
        .setDOMContent(popupNodeRef.current)
        .addTo(map);

      p.on('close', () => {
        setSelectedHotspot(null);
      });
      popupRef.current = p;
    } else {
      popupRef.current.setLngLat([selectedHotspot.lon, selectedHotspot.lat]);
    }
  }, [selectedHotspot, ready]);

  // ---------- layer ----------
  const tier = dataset?.decoded.header.tier;
  const cell = dataset?.decoded.header.cell;
  const showGlow = layerMode === 'both' || layerMode === 'heatmap';
  const showDots = layerMode === 'both' || layerMode === 'points';

  const filterRange = useMemo(() => {
    if (!dataset) return [[-1e9, 1e9], [-1e6, 1e6]];
    const { t0, d0 } = dataset.geom;
    const curMin = cursor ? parseWall(cursor) / 60000 : Infinity;
    const hs = Math.floor(curMin / 60) * 60; // awal jam kursor
    let tr;
    if (!isFinite(curMin)) tr = [-1e9, 1e9];
    else if (isCumulative) tr = [-1e9, hs - t0 + 0.01];
    else tr = [hs - t0 - 0.01, hs - t0 + 0.01];
    let dr = [-1e6, 1e6];
    if (selectedDate) {
      const idx = Math.floor(parseWall(`${selectedDate} 00:00`) / 86400000) - d0;
      dr = [idx - 0.01, idx + 0.01];
    }
    return [tr, dr];
  }, [dataset, cursor, isCumulative, selectedDate]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (!glowData || !dotData) {
      overlay.setProps({ layers: [] });
      return;
    }

    const isGrid = tier === 'grid';
    // piksel per sel agar sel agregat menyatu menjadi permukaan kepadatan yang mulus
    const cellPx = isGrid && cell ? (cell * 111320 * Math.pow(2, zoom)) / 156543 : 0;
    const zoomScale = clamp(Math.pow(2, (zoom - 8) * 0.3), 0.75, 2.4);
    const glowPx = isGrid ? Math.max(glowRadius * 0.8, cellPx * 1.1) : glowRadius * zoomScale;
    const dotPx = isGrid ? 3 : clamp(2.6 + (zoom - 8) * 0.45, 2.6, 6.5);

    const common = {
      extensions: [filterExt],
      filterRange,
      getRadius: 1,
      radiusUnits: 'pixels',
    };

    overlay.setProps({
      layers: [
        new GlowLayer({
          ...common,
          id: 'glow',
          data: glowData,
          visible: showGlow,
          pickable: showGlow && !showDots,
          radiusScale: glowPx,
          opacity: glowOpacity,
          parameters: ADDITIVE_PARAMS,
          onHover: handleHover,
          onClick: handleClick,
        }),
        new ScatterplotLayer({
          ...common,
          id: 'dots',
          data: dotData,
          visible: showDots,
          pickable: showDots,
          radiusScale: dotPx,
          stroked: true,
          lineWidthUnits: 'pixels',
          getLineWidth: 1,
          lineWidthMinPixels: 1,
          getLineColor: [255, 248, 235, 210],
          autoHighlight: true,
          highlightColor: [255, 255, 255, 140],
          parameters: { depthCompare: 'always', depthWriteEnabled: false },
          onHover: handleHover,
          onClick: handleClick,
        }),
      ],
    });
  }, [
    glowData, dotData, filterRange, showGlow, showDots, glowRadius, glowOpacity,
    zoom, tier, cell, handleHover, handleClick,
  ]);

  // ---------- aksi kontrol ----------
  const zoomBy = (d) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: 250 });
  const resetNorth = () => mapRef.current?.easeTo({ bearing: 0, pitch: terrain.enabled ? 62 : 0, duration: 500 });
  const fitData = () => {
    const map = mapRef.current;
    if (!map) return;
    if (bbox && bbox.every(Number.isFinite)) {
      map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
        padding: { top: 90, left: 340, right: 90, bottom: 170 }, maxZoom: 11, duration: 900,
      });
    } else {
      map.flyTo({ center: KALIMANTAN.center, zoom: KALIMANTAN.zoom, duration: 900 });
    }
  };

  const count = dataset?.decoded.n || 0;
  const truncated = dataset?.decoded.header.truncated;

  return (
    <div className="map-root">
      <div ref={containerRef} className="map-canvas" />

      {loading && <div className="load-bar" />}

      {/* Tooltip Hover (disembunyikan bila popup detail sedang terbuka) */}
      {!selectedHotspot && hover && dataset && (
        <HoverCard
          hover={hover}
          ds={dataset}
          minHour={timeBounds.minHour}
          maxHour={timeBounds.maxHour}
          width={containerRef.current?.clientWidth || 0}
          onOpenDetail={(detailData) => setSelectedHotspot(detailData)}
        />
      )}

      {/* Pop-up Detail Hotspot Interaktif (Di-anchor langsung ke koordinat peta via MapLibre) */}
      {selectedHotspot && popupNodeRef.current && createPortal(
        <HotspotDetailPopup
          hotspot={selectedHotspot}
          onClose={() => setSelectedHotspot(null)}
          onFocus={(lon, lat) => {
            mapRef.current?.flyTo({ center: [lon, lat], zoom: Math.max(mapRef.current.getZoom(), 11), duration: 600 });
          }}
          onZoomIn={(lon, lat) => {
            mapRef.current?.flyTo({ center: [lon, lat], zoom: 11.5, duration: 800 });
          }}
        />,
        popupNodeRef.current
      )}

      {!hideUI && (
        <>
          <div className="map-ctrl" role="toolbar" aria-label="Kontrol peta">
            <button id="btn-zoom-in" onClick={() => zoomBy(1)} title="Perbesar" aria-label="Perbesar"><Plus size={15} /></button>
            <button id="btn-zoom-out" onClick={() => zoomBy(-1)} title="Perkecil" aria-label="Perkecil"><Minus size={15} /></button>
            <button id="btn-compass" onClick={resetNorth} title="Arahkan ke utara" aria-label="Reset arah">
              <span ref={compassRef} style={{ display: 'flex', transition: 'transform 0.1s linear' }}><Compass size={15} /></span>
            </button>
            <button id="btn-fit-extent" onClick={fitData} title="Fokus ke seluruh titik api" aria-label="Fokus ke data"><Crosshair size={15} /></button>
            <button
              id="btn-terrain-3d"
              className={terrain.enabled ? 'on' : ''}
              onClick={onToggleTerrain}
              title="Medan 3D (elevasi DEM)"
              aria-pressed={terrain.enabled}
              aria-label="Medan 3D"
            >
              <Mountain size={15} />
              <span className="ctrl-tag">3D</span>
            </button>
          </div>

          <div className="hud">
            <div className="hud-row">
              <span className="hud-k">Z</span><span className="hud-v">{Number.isFinite(zoom) ? zoom.toFixed(1) : '—'}</span>
              <span className="hud-sep" />
              <span className="hud-k">Mode</span>
              <span className="hud-v">{tier === 'grid' ? `Agregat ${cell}°` : tier === 'raw' ? 'Titik mentah' : '—'}</span>
              <span className="hud-sep" />
              <span className="hud-k">Rekaman</span>
              <span className="hud-v">{count.toLocaleString('id-ID')}</span>
              {elevProgress != null && (
                <>
                  <span className="hud-sep" />
                  <span className="hud-k">Elevasi</span>
                  <span className="hud-v">{Math.round(elevProgress * 100)}%</span>
                </>
              )}
            </div>
            <div className="hud-row hud-coord" ref={hudRef}>Arahkan kursor ke peta</div>
          </div>

          {truncated && (
            <div className="notice" role="status">
              <Flame size={13} /> Dibatasi {Number(dataset.decoded.header.limit).toLocaleString('id-ID')} titik — perbesar peta atau persempit rentang waktu.
            </div>
          )}
          {error && <div className="notice err" role="alert">{error}</div>}
        </>
      )}
    </div>
  );
}

function HoverCard({ hover, ds, minHour, maxHour, width, onOpenDetail }) {
  if (!hover || !hover.idxs || !hover.idxs.length || !ds || !ds.decoded) return null;
  const d = ds.decoded;
  const hdr = d.header;
  if (!d.lonlat || !hdr || !d.n) return null;

  const t0 = hdr.t0Min;
  const validIdxs = hover.idxs
    .filter((i) => typeof i === 'number' && i >= 0 && i < d.n)
    .slice(0, 200);

  if (!validIdxs.length) return null;

  let total = 0;
  let maxBright = 0;
  const rows = validIdxs.map((i) => {
    total += d.cnt[i] || 1;
    if (d.bright[i] > maxBright) maxBright = d.bright[i];
    const [name, kind] = (hdr.sensors && hdr.sensors[d.sensor[i]]) || ['FIRMS', 0];
    return { i, min: t0 + (d.tRel[i] || 0), cnt: d.cnt[i] || 1, bright: d.bright[i] || 0, name, kind };
  });
  rows.sort((a, b) => a.min - b.min);

  const first = validIdxs[0];
  const lon = d.lonlat[first * 2];
  const lat = d.lonlat[first * 2 + 1];

  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const firstHour = rows[0]?.min != null && Number.isFinite(rows[0].min) ? Math.floor(rows[0].min / 60) : minHour;
  const accent = getColorForHour(firstHour, minHour, maxHour);
  const isGrid = hdr.tier === 'grid';

  const left = width && hover.x + 18 > width - 270 ? hover.x - 262 : hover.x + 16;

  const handleClickCard = () => {
    if (!onOpenDetail) return;
    const mappedRows = rows.map((r) => {
      const [sensorName, kind] = (hdr.sensors && hdr.sensors[d.sensor[r.i]]) || ['FIRMS', 0];
      const conf = (hdr.conf && hdr.conf[d.conf[r.i]]) || '-';
      const prov = (hdr.prov && hdr.prov[d.prov[r.i]]) || 'Kalimantan';
      const ptHour = Math.floor(r.min / 60);
      return {
        i: r.i,
        min: r.min,
        cnt: r.cnt,
        bright: r.bright,
        sensorName,
        kind,
        conf,
        prov,
        color: getColorForHour(ptHour, minHour, maxHour),
      };
    }).reverse();

    onOpenDetail({
      lon,
      lat,
      isGrid,
      cell: hdr.cell,
      rows: mappedRows,
      totalCnt: total,
      maxBright,
      elevation: null,
      color: accent,
    });
  };

  return (
    <div
      className="hover-card"
      style={{ left, top: hover.y + 14, cursor: 'pointer' }}
      onClick={handleClickCard}
      title="Klik untuk melihat detail lengkap titik ini"
    >
      <div className="hc-head">
        <span className="hc-swatch" style={{ background: accent }} />
        <span className="hc-title">{isGrid ? 'Sel agregat' : 'Hotspot'}</span>
        <span className="hc-count">{total.toLocaleString('id-ID')}×</span>
      </div>
      <div className="hc-coord">{lat.toFixed(4)}°, {lon.toFixed(4)}°</div>
      <ul className="hc-list">
        {rows.slice(0, 5).map((r) => {
          const rowHour = Math.floor(r.min / 60);
          const dotColor = getColorForHour(rowHour, minHour, maxHour);
          return (
            <li key={r.i}>
              <span className="hc-dot" style={{ background: dotColor }} title={`${KIND_LABEL[r.kind]} (${r.name})`} />
              <span className="hc-time">{formatShort(r.min * 60000)}</span>
              <span className="hc-sensor">{isGrid ? `${r.cnt}× ${KIND_LABEL[r.kind]}` : r.name}</span>
              {r.bright > 0 && <span className="hc-bright">{Math.round(r.bright)}K</span>}
            </li>
          );
        })}
      </ul>
      {rows.length > 5 && <div className="hc-more">+ {rows.length - 5} deteksi lain di titik ini</div>}
      <div className="hc-foot">Klik untuk detail lengkap ↗</div>
    </div>
  );
}


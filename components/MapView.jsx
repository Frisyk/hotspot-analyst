'use client';

import React, { useEffect, useRef, useState } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import Heatmap from 'ol/layer/Heatmap';
import XYZ from 'ol/source/XYZ';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { fromLonLat } from 'ol/proj';
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import Overlay from 'ol/Overlay';
import { Maximize2, Flame, Activity, Sliders, X, Layers } from 'lucide-react';
import { hexToRgba, getColorForDate } from '../utils/colorPalette';
import { getBasemapConfig } from '../utils/basemaps';

export default function MapView({
  hotspots = [],
  dateColorMap = {},
  activeMapType = 'dark',
  onSelectMapType,
  layerMode = 'both', // 'both' | 'heatmap' | 'points'
  onSelectLayerMode,
  hideUI = false,
  onSelectHotspot,
}) {
  const mapElementRef = useRef(null);
  const popupElementRef = useRef(null);
  const mapRef = useRef(null);
  const vectorSourceRef = useRef(null);
  const baseLayerRef = useRef(null);
  const vectorLayerRef = useRef(null);
  const heatmapLayerRef = useRef(null);
  const popupOverlayRef = useRef(null);

  const [hoveredFeature, setHoveredFeature] = useState(null);
  const [showDensityControls, setShowDensityControls] = useState(false);

  // Density / Heatmap fine-tuning parameters
  const [heatmapRadius, setHeatmapRadius] = useState(14);
  const [heatmapBlur, setHeatmapBlur] = useState(18);
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.85);

  // Initialize Map
  useEffect(() => {
    if (!mapElementRef.current) return;

    // 1. Vector source for fire points
    const vectorSource = new VectorSource();
    vectorSourceRef.current = vectorSource;

    // 2a. Heatmap layer for hotspot density (akumuasi jika titik sama/berdekatan)
    const heatmapLayer = new Heatmap({
      source: vectorSource,
      blur: heatmapBlur,
      radius: heatmapRadius,
      opacity: heatmapOpacity,
      weight: (feature) => {
        // Normalisasi bobot berdasar kecerahan/intensitas (300K - 450K)
        const b = parseFloat(feature.get('brightness') || 0);
        if (b > 300) {
          return Math.min(1.0, Math.max(0.35, (b - 290) / 160));
        }
        return 0.55;
      },
      gradient: [
        '#0000ff', // Biru: densitas rendah / pinggiran
        '#00ffff', // Cyan
        '#00ff00', // Hijau
        '#ffff00', // Kuning: densitas sedang
        '#ff8800', // Oranye: densitas tinggi
        '#ff0000', // Merah: densitas sangat tinggi
        '#ffffff', // Putih: titik bertumpuk / ekstrem
      ],
    });
    heatmapLayerRef.current = heatmapLayer;

    // 2b. Vector layer with style function for individual hotspot markers
    const vectorLayer = new VectorLayer({
      source: vectorSource,
      style: (feature) => {
        const dateStr = feature.get('date');
        const color = getColorForDate(dateStr, dateColorMap);

        return [
          // Outer glow circle
          new Style({
            image: new CircleStyle({
              radius: 9,
              fill: new Fill({
                color: hexToRgba(color, 0.35),
              }),
            }),
          }),
          // Inner core hotspot point
          new Style({
            image: new CircleStyle({
              radius: 5,
              fill: new Fill({ color }),
              stroke: new Stroke({
                color: '#ffffff',
                width: 1.5,
              }),
            }),
          }),
        ];
      },
    });
    vectorLayerRef.current = vectorLayer;

    // Set initial visibility
    heatmapLayer.setVisible(layerMode === 'both' || layerMode === 'heatmap');
    vectorLayer.setVisible(layerMode === 'both' || layerMode === 'points');

    // 3. Base tile layer (Google 3D Terrain, OpenTopo 3D, Esri Relief, Dark Matter, etc.)
    const baseConfig = getBasemapConfig(activeMapType);
    const baseLayer = new TileLayer({
      source: new XYZ({
        url: baseConfig.url,
        attributions: baseConfig.attributions,
        maxZoom: 19,
      }),
    });
    baseLayerRef.current = baseLayer;

    // 4. Popup Overlay
    const popupOverlay = new Overlay({
      element: popupElementRef.current,
      positioning: 'bottom-center',
      stopEvent: false,
      offset: [0, -10],
    });
    popupOverlayRef.current = popupOverlay;

    // 5. Create Map centered on Kalimantan
    const map = new Map({
      target: mapElementRef.current,
      layers: [baseLayer, heatmapLayer, vectorLayer],
      overlays: [popupOverlay],
      view: new View({
        center: fromLonLat([114.0, 0.0]), // Center of Kalimantan
        zoom: 6,
        minZoom: 4,
        maxZoom: 18,
      }),
      controls: [],
    });

    // Hover tooltip interaction with multiple overlap detection
    map.on('pointermove', (evt) => {
      if (evt.dragging) {
        popupOverlay.setPosition(undefined);
        return;
      }

      const pixel = map.getEventPixel(evt.originalEvent);
      const hitFeatures = [];
      map.forEachFeatureAtPixel(pixel, (feature) => {
        hitFeatures.push(feature.getProperties());
      });

      if (hitFeatures.length > 0) {
        const top = hitFeatures[0];
        const coordinates = fromLonLat([
          parseFloat(top.longitude),
          parseFloat(top.latitude),
        ]);
        popupOverlay.setPosition(coordinates);
        setHoveredFeature({
          ...top,
          overlapCount: hitFeatures.length,
          allHits: hitFeatures,
        });
        map.getTargetElement().style.cursor = 'pointer';
      } else {
        popupOverlay.setPosition(undefined);
        setHoveredFeature(null);
        map.getTargetElement().style.cursor = '';
      }
    });

    // Click handler
    map.on('singleclick', (evt) => {
      const hit = map.forEachFeatureAtPixel(evt.pixel, (feature) => feature);
      if (hit && onSelectHotspot) {
        onSelectHotspot(hit.getProperties());
      }
    });

    mapRef.current = map;

    return () => {
      map.setTarget(null);
    };
  }, []);

  // Update Base Layer when activeMapType changes
  useEffect(() => {
    if (!baseLayerRef.current) return;
    const baseConfig = getBasemapConfig(activeMapType);
    baseLayerRef.current.setSource(
      new XYZ({
        url: baseConfig.url,
        attributions: baseConfig.attributions,
        maxZoom: 19,
      })
    );
  }, [activeMapType]);

  // Sync layerMode with layers visibility
  useEffect(() => {
    if (heatmapLayerRef.current) {
      heatmapLayerRef.current.setVisible(layerMode === 'both' || layerMode === 'heatmap');
    }
    if (vectorLayerRef.current) {
      vectorLayerRef.current.setVisible(layerMode === 'both' || layerMode === 'points');
    }
  }, [layerMode]);

  // Sync heatmap blur, radius, opacity
  useEffect(() => {
    if (heatmapLayerRef.current) {
      heatmapLayerRef.current.setRadius(heatmapRadius);
      heatmapLayerRef.current.setBlur(heatmapBlur);
      heatmapLayerRef.current.setOpacity(heatmapOpacity);
    }
  }, [heatmapRadius, heatmapBlur, heatmapOpacity]);

  // Update Hotspot Points in VectorSource (shared by vectorLayer and heatmapLayer)
  useEffect(() => {
    if (!vectorSourceRef.current) return;

    const source = vectorSourceRef.current;
    source.clear();

    if (!hotspots || hotspots.length === 0) return;

    const features = [];
    hotspots.forEach((h) => {
      const lon = h.geometry?.coordinates?.[0] ?? h.properties?.longitude;
      const lat = h.geometry?.coordinates?.[1] ?? h.properties?.latitude;

      if (lon !== undefined && lat !== undefined && !isNaN(lon) && !isNaN(lat)) {
        const feature = new Feature({
          geometry: new Point(fromLonLat([parseFloat(lon), parseFloat(lat)])),
          ...h.properties,
        });
        features.push(feature);
      }
    });

    source.addFeatures(features);
  }, [hotspots, dateColorMap]);

  // Fit to features helper
  const handleFitExtent = () => {
    if (!mapRef.current || !vectorSourceRef.current) return;
    const extent = vectorSourceRef.current.getExtent();
    if (extent && isFinite(extent[0])) {
      mapRef.current.getView().fit(extent, {
        padding: [100, 100, 100, 100],
        duration: 800,
        maxZoom: 13,
      });
    } else {
      mapRef.current.getView().animate({
        center: fromLonLat([114.0, 0.0]),
        zoom: 6,
        duration: 800,
      });
    }
  };

  return (
    <div style={styles.container}>
      {/* Map Target Element */}
      <div ref={mapElementRef} style={styles.mapElement} />

      {/* Floating Map Controls */}
      {!hideUI && (
        <div style={styles.mapControls}>
          <button
            id="btn-fit-extent"
            onClick={handleFitExtent}
            style={styles.controlIconBtn}
            title="Fokuskan Peta ke Seluruh Titik Api"
          >
            <Maximize2 size={16} />
          </button>

          <button
            id="btn-toggle-density-settings"
            onClick={() => setShowDensityControls(!showDensityControls)}
            style={{
              ...styles.controlIconBtn,
              background: showDensityControls ? '#ff4500' : 'rgba(18, 24, 38, 0.85)',
              borderColor: showDensityControls ? '#ff4500' : 'rgba(255, 255, 255, 0.1)',
              boxShadow: showDensityControls ? '0 0 12px rgba(255, 69, 0, 0.5)' : 'none',
            }}
            title="Pengaturan Layer Kepadatan / Densitas Heatmap"
          >
            <Activity size={16} />
          </button>
        </div>
      )}

      {/* Floating Density / Heatmap Settings Panel */}
      <div
        id="density-settings-panel"
        style={{
          ...styles.densityPanel,
          display: !hideUI && showDensityControls ? 'flex' : 'none',
        }}
        className="glass-panel"
      >
        <div style={styles.panelHeader}>
          <div style={styles.panelTitle}>
            <Activity size={15} color="#ff4500" />
            <span>Pengaturan Densitas Hotspot</span>
          </div>
          <button
            onClick={() => setShowDensityControls(false)}
            style={styles.closeBtn}
            title="Tutup Panel"
          >
            <X size={15} />
          </button>
        </div>

          {/* Mode Switcher */}
          <div style={styles.panelSection}>
            <label style={styles.sliderLabel}>Mode Tampilan:</label>
            <div style={styles.modeButtonGroup}>
              {[
                { id: 'both', label: 'Gabungan' },
                { id: 'heatmap', label: 'Densitas' },
                { id: 'points', label: 'Titik Api' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onSelectLayerMode && onSelectLayerMode(opt.id)}
                  style={{
                    ...styles.modeBtn,
                    background: layerMode === opt.id ? '#ff4500' : 'rgba(255, 255, 255, 0.05)',
                    color: layerMode === opt.id ? '#ffffff' : '#94a3b8',
                    borderColor: layerMode === opt.id ? '#ff4500' : 'rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sliders for Radius, Blur, Opacity */}
          <div style={styles.panelSection}>
            <div style={styles.sliderHeader}>
              <span style={styles.sliderLabel}>Radius Sebaran:</span>
              <span style={styles.sliderVal}>{heatmapRadius} px</span>
            </div>
            <input
              type="range"
              min={6}
              max={30}
              value={heatmapRadius}
              onChange={(e) => setHeatmapRadius(parseInt(e.target.value, 10))}
              style={styles.rangeInput}
            />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.sliderHeader}>
              <span style={styles.sliderLabel}>Kehalusan (Blur):</span>
              <span style={styles.sliderVal}>{heatmapBlur} px</span>
            </div>
            <input
              type="range"
              min={8}
              max={35}
              value={heatmapBlur}
              onChange={(e) => setHeatmapBlur(parseInt(e.target.value, 10))}
              style={styles.rangeInput}
            />
          </div>

          <div style={styles.panelSection}>
            <div style={styles.sliderHeader}>
              <span style={styles.sliderLabel}>Transparansi / Opasitas:</span>
              <span style={styles.sliderVal}>{Math.round(heatmapOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={100}
              value={Math.round(heatmapOpacity * 100)}
              onChange={(e) => setHeatmapOpacity(parseInt(e.target.value, 10) / 100)}
              style={styles.rangeInput}
            />
          </div>

          {/* Skala Warna Gradien Densitas */}
          <div style={styles.panelSection}>
            <span style={styles.sliderLabel}>Skala Spektrum Densitas:</span>
            <div style={styles.densityGradientBar} />
            <div style={styles.densityScaleLabels}>
              <span>Rendah (Biru)</span>
              <span>Sedang (Kuning)</span>
              <span>Tinggi (Merah/Putih)</span>
            </div>
            <p style={styles.densityNote}>
              Titik api berulang atau terkonsentrasi di koordinat yang sama akan berakumulasi menjadi warna merah/putih (sangat padat).
            </p>
          </div>
        </div>

      {/* Hover / Click Popup Tooltip Overlay (Isolated container) */}
      <div style={{ display: 'contents' }}>
        <div ref={popupElementRef} className="ol-popup">
          {hoveredFeature && (
          <div style={styles.popupContent}>
            <div style={styles.popupHeader}>
              <div
                style={{
                  ...styles.sourceBadge,
                  backgroundColor:
                    hoveredFeature.source === 'firms' ? 'rgba(255, 159, 26, 0.2)' : 'rgba(0, 240, 255, 0.2)',
                  borderColor:
                    hoveredFeature.source === 'firms' ? '#FF9F1A' : '#00F0FF',
                  color:
                    hoveredFeature.source === 'firms' ? '#FFB042' : '#38E1FF',
                }}
              >
                <Flame size={11} />
                <span>
                  {hoveredFeature.sensor
                    ? `${hoveredFeature.source?.toUpperCase()} (${hoveredFeature.sensor})`
                    : hoveredFeature.source?.toUpperCase()}
                </span>
              </div>
              <span style={styles.popupTime}>
                {hoveredFeature.datetm_loc?.split(' ')[1]?.slice(0, 5)} WIB
              </span>
            </div>

            {/* Overlap / Cluster Density Badge if multiple points at this location */}
            {hoveredFeature.overlapCount > 1 && (
              <div style={styles.overlapBadge}>
                <Flame size={13} color="#ef4444" />
                <span>
                  <strong>{hoveredFeature.overlapCount} Titik Hotspot</strong> terpusat di lokasi ini!
                </span>
              </div>
            )}

            <div style={styles.popupBody}>
              <div style={styles.popupRow}>
                <span style={styles.popupLabel}>Tanggal:</span>
                <span
                  style={{
                    ...styles.popupVal,
                    color: getColorForDate(hoveredFeature.date, dateColorMap),
                    fontWeight: '700',
                  }}
                >
                  {hoveredFeature.date}
                </span>
              </div>

              <div style={styles.popupRow}>
                <span style={styles.popupLabel}>Koordinat:</span>
                <span style={styles.popupVal}>
                  {Number(hoveredFeature.latitude).toFixed(4)}, {Number(hoveredFeature.longitude).toFixed(4)}
                </span>
              </div>

              <div style={styles.popupRow}>
                <span style={styles.popupLabel}>Keyakinan:</span>
                <span style={styles.popupVal}>{hoveredFeature.confidence || '-'}</span>
              </div>

              {hoveredFeature.brightness > 0 && (
                <div style={styles.popupRow}>
                  <span style={styles.popupLabel}>Kecerahan:</span>
                  <span style={styles.popupVal}>{hoveredFeature.brightness} K</span>
                </div>
              )}

              {hoveredFeature.province && (
                <div style={styles.popupRow}>
                  <span style={styles.popupLabel}>Provinsi:</span>
                  <span style={styles.popupVal}>{hoveredFeature.province}</span>
                </div>
              )}

              {/* Sub-list of overlapping detections if more than 1 */}
              {hoveredFeature.overlapCount > 1 && hoveredFeature.allHits && (
                <div style={styles.clusterList}>
                  <span style={styles.clusterTitle}>Deteksi Berulang:</span>
                  {hoveredFeature.allHits.slice(0, 4).map((hit, idx) => (
                    <div key={idx} style={styles.clusterItem}>
                      <span>• {hit.sensor || hit.source} ({hit.datetm_loc?.split(' ')[1]?.slice(0, 5)} WIB)</span>
                      <span style={{ color: '#f59e0b' }}>{hit.brightness ? `${hit.brightness}K` : ''}</span>
                    </div>
                  ))}
                  {hoveredFeature.allHits.length > 4 && (
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      + {hoveredFeature.allHits.length - 4} deteksi lainnya
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  mapElement: {
    width: '100%',
    height: '100%',
  },
  mapControls: {
    position: 'absolute',
    top: '90px',
    right: '20px',
    zIndex: 95,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  controlIconBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '10px',
    background: 'rgba(18, 24, 38, 0.85)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  densityPanel: {
    position: 'absolute',
    top: '90px',
    right: '68px',
    zIndex: 96,
    width: '280px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  },
  panelTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: '700',
    color: '#f8fafc',
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '2px',
    display: 'flex',
  },
  panelSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  sliderHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sliderLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  sliderVal: {
    fontSize: '12px',
    fontWeight: '700',
    color: '#f8fafc',
    fontFamily: 'var(--font-mono)',
  },
  rangeInput: {
    width: '100%',
    accentColor: '#ff4500',
    cursor: 'pointer',
  },
  modeButtonGroup: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '4px',
    marginTop: '2px',
  },
  modeBtn: {
    padding: '6px 4px',
    borderRadius: '6px',
    border: '1px solid',
    fontSize: '11px',
    fontWeight: '600',
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'all 0.15s ease',
  },
  densityGradientBar: {
    height: '10px',
    borderRadius: '5px',
    background: 'linear-gradient(to right, #0000ff, #00ffff, #00ff00, #ffff00, #ff8800, #ff0000, #ffffff)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 10px rgba(255, 69, 0, 0.25)',
    marginTop: '2px',
  },
  densityScaleLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '9px',
    color: '#94a3b8',
    fontWeight: '600',
    marginTop: '2px',
  },
  densityNote: {
    fontSize: '10px',
    color: '#64748b',
    lineHeight: '1.4',
    margin: '4px 0 0 0',
  },
  popupContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '12px',
    minWidth: '200px',
  },
  popupHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '6px',
  },
  sourceBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid',
    fontSize: '10px',
    fontWeight: '700',
    fontFamily: 'var(--font-mono)',
  },
  popupTime: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontFamily: 'var(--font-mono)',
  },
  overlapBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 8px',
    borderRadius: '6px',
    background: 'rgba(239, 68, 68, 0.15)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: '#fca5a5',
    fontSize: '11px',
  },
  popupBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  popupRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
  },
  popupLabel: {
    color: '#94a3b8',
  },
  popupVal: {
    color: '#f8fafc',
    fontFamily: 'var(--font-mono)',
  },
  clusterList: {
    marginTop: '6px',
    paddingTop: '6px',
    borderTop: '1px dashed rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  clusterTitle: {
    fontSize: '10px',
    fontWeight: '700',
    color: '#cbd5e1',
    textTransform: 'uppercase',
  },
  clusterItem: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: '#94a3b8',
    fontFamily: 'var(--font-mono)',
  },
};
